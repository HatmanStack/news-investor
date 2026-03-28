"""
Analyst consensus endpoint handler with DynamoDB caching.
Handles GET /analyst requests.
"""

from repositories.analyst_cache import cache_analyst, get_cached_analyst
from services.analyst_service import fetch_analyst_data
from typedefs import ApiGatewayEvent, ApiGatewayResponse
from utils.logger import get_structured_logger
from utils.response import error_response, success_response
from utils.validation import validate_ticker

logger = get_structured_logger(__name__)


def handle_analyst_request(event: ApiGatewayEvent) -> ApiGatewayResponse:
    """GET /analyst?ticker=X"""
    query_params = event.get("queryStringParameters") or {}
    raw_ticker = query_params.get("ticker", "")

    ticker = validate_ticker(raw_ticker)
    if not ticker:
        return error_response("Missing or invalid ticker parameter", 400)

    try:
        # Cache-first
        cached = get_cached_analyst(ticker)
        if cached is not None:
            logger.info("Analyst cache hit", ticker=ticker)
            return success_response({"available": True, "ticker": ticker, **cached})

        # Cache miss - fetch from yfinance
        logger.info("Analyst cache miss, fetching from yfinance", ticker=ticker)
        data = fetch_analyst_data(ticker)

        if data is None:
            return success_response({"available": False, "ticker": ticker})

        # Cache and return
        cache_analyst(ticker, data)
        return success_response({"available": True, "ticker": ticker, **data})

    except Exception as e:
        logger.error(f"Error fetching analyst data for {ticker}: {e}", exc_info=True)
        return error_response("Failed to fetch analyst data", 500)
