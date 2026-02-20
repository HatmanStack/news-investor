"""
yfinance service layer.
Wrapper around yfinance library for fetching stock data.
"""

import logging
import time
from typing import Any

import requests

from utils.error import APIError

# Lazy imports for heavy libraries (yfinance, pandas)
# These are only imported when needed to reduce cold start time for search
_yf = None


def _get_yfinance():
    """Lazy import yfinance to reduce cold start time."""
    global _yf
    if _yf is None:
        import yfinance as yf

        _yf = yf
    return _yf


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configuration
REQUEST_TIMEOUT = 10  # seconds
MAX_RETRIES = 3
BACKOFF_BASE = 2  # seconds


def retry_with_backoff(func):
    """Decorator for retry logic with exponential backoff."""

    def wrapper(*args, **kwargs):
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except APIError as e:
                # Don't retry client errors (4xx except 429)
                if e.status_code and 400 <= e.status_code < 500 and e.status_code != 429:
                    raise
                last_error = e
            except Exception as e:
                last_error = e

            if attempt < MAX_RETRIES:
                delay = BACKOFF_BASE ** (attempt + 1)
                logger.info(
                    f"[YFinanceService] Retry {attempt + 1}/{MAX_RETRIES} after {delay}s..."
                )
                time.sleep(delay)

        raise last_error if last_error else APIError("Unknown error", 500)

    return wrapper


@retry_with_backoff
def fetch_stock_prices(
    ticker: str,
    start_date: str,
    end_date: str | None = None,
) -> Any:
    """
    Fetch historical stock prices from yfinance.

    Args:
        ticker: Stock ticker symbol (e.g., "AAPL")
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        DataFrame with OHLCV data and additional columns:
        - Open, High, Low, Close, Volume
        - Adj Close (adjusted close)
        - Dividends, Stock Splits

    Raises:
        APIError: If ticker not found or request fails
    """
    logger.info(
        f"[YFinanceService] Fetching prices for {ticker} from {start_date} to {end_date or 'today'}"
    )

    try:
        yf = _get_yfinance()
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date)

        if hist.empty:
            logger.warning(f"[YFinanceService] No data found for {ticker}")
            raise APIError(f"Ticker '{ticker}' not found or no data available", 404)

        logger.info(f"[YFinanceService] Fetched {len(hist)} price records for {ticker}")
        return hist

    except APIError:
        raise
    except Exception as e:
        logger.error(f"[YFinanceService] Error fetching prices for {ticker}: {e}")
        raise APIError(f"Failed to fetch stock prices: {e}", 500) from e


@retry_with_backoff
def fetch_symbol_metadata(ticker: str) -> dict[str, Any]:
    """
    Fetch company metadata from yfinance.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with company info including:
        - shortName, longName
        - exchange
        - longBusinessSummary
        - sector, industry

    Raises:
        APIError: If ticker not found or request fails
    """
    logger.info(f"[YFinanceService] Fetching metadata for {ticker}")

    try:
        yf = _get_yfinance()
        stock = yf.Ticker(ticker)
        info = stock.info

        # Check if ticker is valid
        if not info or info.get("regularMarketPrice") is None:
            logger.warning(f"[YFinanceService] No metadata found for {ticker}")
            raise APIError(f"Ticker '{ticker}' not found", 404)

        name = info.get("shortName") or info.get("longName") or ticker
        logger.info(f"[YFinanceService] Fetched metadata for {ticker}: {name}")
        return info

    except APIError:
        raise
    except Exception as e:
        logger.error(f"[YFinanceService] Error fetching metadata for {ticker}: {e}")
        raise APIError(f"Failed to fetch metadata: {e}", 500) from e


@retry_with_backoff
def search_tickers(query: str) -> list[dict[str, Any]]:
    """
    Search for tickers using Yahoo Finance autocomplete API.

    Note: yfinance's built-in search is inconsistent, so we use
    Yahoo Finance's autocomplete API directly.

    Args:
        query: Search query (ticker or company name)

    Returns:
        List of matching results with:
        - symbol: Ticker symbol
        - shortname: Company name
        - quoteType: Asset type (EQUITY, ETF, etc.)
        - exchange: Exchange code

    Raises:
        APIError: If request fails
    """
    logger.info(f"[YFinanceService] Searching for: {query}")

    try:
        url = "https://query2.finance.yahoo.com/v1/finance/search"
        params = {
            "q": query.strip(),
            "quotesCount": 10,
            "newsCount": 0,
            "enableFuzzyQuery": False,
            "quotesQueryId": "tss_match_phrase_query",
        }
        headers = {"User-Agent": "Mozilla/5.0"}

        response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()

        data = response.json()
        quotes = data.get("quotes", [])

        logger.info(f"[YFinanceService] Found {len(quotes)} results for query: {query}")
        return quotes

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.info(f"[YFinanceService] No results found for query: {query}")
            return []
        logger.error(f"[YFinanceService] HTTP error searching for {query}: {e}")
        raise APIError(f"Search failed: {e}", e.response.status_code) from e
    except requests.exceptions.Timeout as e:
        logger.error(f"[YFinanceService] Timeout searching for {query}")
        raise APIError("Search request timed out", 504) from e
    except Exception as e:
        logger.error(f"[YFinanceService] Error searching for {query}: {e}")
        raise APIError(f"Search failed: {e}", 500) from e
