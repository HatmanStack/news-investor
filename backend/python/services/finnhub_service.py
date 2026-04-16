"""
Finnhub service layer.
HTTP client for Finnhub REST API (search and earnings calendar).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests

from utils.circuit_breaker import CircuitBreaker
from utils.error import APIError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configuration
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
REQUEST_TIMEOUT = 10  # seconds
MAX_RETRIES = 1
RETRY_DELAY_SECONDS = 1

# Circuit breaker: fail fast after 5 consecutive Finnhub failures, cooldown 60s
_finnhub_circuit = CircuitBreaker(
    failure_threshold=5,
    cooldown_seconds=60,
    name="finnhub-python",
)


def _get_api_key() -> str:
    """Get Finnhub API key from environment."""
    key = os.environ.get("FINNHUB_API_KEY")
    if not key:
        raise APIError("FINNHUB_API_KEY not configured", 500)
    return key


def _finnhub_get(endpoint: str, params: dict[str, Any]) -> Any:
    """
    Make a GET request to Finnhub with circuit breaker and retry logic.

    Args:
        endpoint: API endpoint path (e.g., '/search')
        params: Query parameters (token is added automatically)

    Returns:
        Parsed JSON response

    Raises:
        APIError: On circuit breaker open, HTTP errors, or missing API key
    """
    api_key = _get_api_key()

    if not _finnhub_circuit.allow_request():
        raise APIError("Finnhub circuit breaker open — failing fast", 503)

    params["token"] = api_key
    url = f"{FINNHUB_BASE_URL}{endpoint}"
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

            if response.status_code != 200:
                raise APIError(
                    f"Finnhub API error: {response.status_code} {response.text}",
                    response.status_code,
                )

            _finnhub_circuit.record_success()
            return response.json()

        except APIError as e:
            # Don't retry client errors (4xx except 429)
            if e.status_code and 400 <= e.status_code < 500 and e.status_code != 429:
                raise
            last_error = e
        except Exception as e:
            last_error = e

        if attempt < MAX_RETRIES:
            delay = RETRY_DELAY_SECONDS
            logger.info(
                "[FinnhubService] Retry %d/%d after %ds...",
                attempt + 1,
                MAX_RETRIES,
                delay,
            )
            time.sleep(RETRY_DELAY_SECONDS)

    _finnhub_circuit.record_failure()
    raise last_error if last_error else APIError("Unknown Finnhub error", 500)


def search_tickers_finnhub(query: str) -> list[dict[str, Any]]:
    """
    Search for tickers using Finnhub /search endpoint.

    Args:
        query: Search query string

    Returns:
        List of dicts with description, displaySymbol, symbol, type
    """
    logger.info(f"[FinnhubService] Searching for: {query}")

    data = _finnhub_get("/search", {"q": query})
    results = data.get("result", [])

    logger.info(f"[FinnhubService] Found {len(results)} results for: {query}")
    return results


def fetch_earnings_finnhub(ticker: str, from_date: str, to_date: str) -> list[dict[str, Any]]:
    """
    Fetch earnings calendar from Finnhub /calendar/earnings endpoint.

    Args:
        ticker: Stock ticker symbol
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)

    Returns:
        List of earnings dicts filtered to the requested ticker
    """
    logger.info(f"[FinnhubService] Fetching earnings for {ticker} from {from_date} to {to_date}")

    data = _finnhub_get(
        "/calendar/earnings",
        {"symbol": ticker, "from": from_date, "to": to_date},
    )
    all_earnings = data.get("earningsCalendar", [])

    # Filter to requested ticker (endpoint may return others in date range)
    filtered = [e for e in all_earnings if e.get("symbol") == ticker]

    logger.info(
        f"[FinnhubService] Found {len(filtered)} earnings events for {ticker} "
        f"(out of {len(all_earnings)} total)"
    )
    return filtered
