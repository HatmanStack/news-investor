"""
Earnings endpoint handler with DynamoDB caching.
Handles GET /earnings and POST /batch/earnings requests.
"""

import json
from typing import Any

from repositories.earnings_cache import cache_earnings, get_cached_earnings
from services.earnings_service import fetch_earnings_calendar
from utils.logger import get_structured_logger
from utils.response import error_response, success_response
from utils.validation import validate_ticker

logger = get_structured_logger(__name__)


def handle_earnings_request(event: dict[str, Any]) -> dict[str, Any]:
    """GET /earnings?ticker=X"""
    query_params = event.get("queryStringParameters") or {}
    raw_ticker = query_params.get("ticker", "")

    ticker = validate_ticker(raw_ticker)
    if not ticker:
        return error_response("Missing or invalid ticker parameter", 400)

    try:
        earnings = _get_earnings_for_ticker(ticker)
        return success_response(earnings)

    except Exception as e:
        logger.error(f"Error fetching earnings for {ticker}: {e}", exc_info=True)
        return error_response(f"Failed to fetch earnings: {e}", 500)


def handle_batch_earnings_request(event: dict[str, Any]) -> dict[str, Any]:
    """POST /batch/earnings with body { tickers: [...] }"""
    try:
        body = json.loads(event.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        return error_response("Invalid JSON body", 400)

    tickers = body.get("tickers", [])
    if not isinstance(tickers, list) or not tickers:
        return error_response("Missing or empty tickers array", 400)

    if len(tickers) > 20:
        return error_response("Maximum 20 tickers per batch request", 400)

    results: dict[str, Any] = {}
    for raw_ticker in tickers:
        ticker = validate_ticker(str(raw_ticker))
        if not ticker:
            continue
        try:
            results[ticker] = _get_earnings_for_ticker(ticker)
        except Exception as e:
            logger.warning(f"Failed to fetch earnings for {ticker}: {e}")
            results[ticker] = []

    return success_response({"results": results})


def _get_earnings_for_ticker(ticker: str) -> list[dict[str, Any]]:
    """Get earnings for a ticker with cache-first logic."""
    # Check cache first (None = miss, [] = cached empty, [...] = cached data)
    cached = get_cached_earnings(ticker)
    if cached is not None:
        logger.info("Earnings cache hit", ticker=ticker, count=len(cached))
        return _clean_cache_items(cached) if cached else []

    # Cache miss - fetch from yfinance
    logger.info("Earnings cache miss, fetching from yfinance", ticker=ticker)
    earnings = fetch_earnings_calendar(ticker)

    # Cache results (even if empty, to prevent repeated fetches for ETFs/index funds)
    cache_earnings(ticker, earnings)

    return earnings


def _clean_cache_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove DynamoDB-specific fields from cached items."""
    keys_to_remove = {"pk", "sk", "entityType", "ttl", "createdAt", "updatedAt"}
    return [{k: v for k, v in item.items() if k not in keys_to_remove} for item in items]
