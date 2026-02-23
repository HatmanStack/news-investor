"""
ETF holdings service with cache-first pattern.
Fetches top 10 holdings for SPDR sector ETFs.
"""

import json
import time
from typing import Any

import yfinance as yf

from constants.etf_holdings import ETF_TOP_HOLDINGS
from utils.logger import get_structured_logger

logger = get_structured_logger(__name__)

CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def get_etf_holdings(etf_ticker: str, table: Any) -> list[str]:
    """Get top 10 holdings for a SPDR ETF.

    Priority:
    1. DynamoDB cache (if not expired)
    2. yfinance Ticker.funds_data.top_holdings
    3. Static fallback map
    """
    cached = _get_cached_holdings(etf_ticker, table)
    if cached is not None:
        return cached

    try:
        holdings = _fetch_from_yfinance(etf_ticker)
        if holdings and len(holdings) >= 5:
            _cache_holdings(etf_ticker, holdings[:10], table)
            return holdings[:10]
    except Exception:
        pass

    static = ETF_TOP_HOLDINGS.get(etf_ticker, [])
    if static:
        _cache_holdings(etf_ticker, static, table)
    return static


def _fetch_from_yfinance(etf_ticker: str) -> list[str]:
    """Fetch top holdings from yfinance."""
    ticker = yf.Ticker(etf_ticker)
    try:
        holdings_df = ticker.funds_data.top_holdings
        if holdings_df is not None and not holdings_df.empty:
            return holdings_df.index.tolist()[:10]
    except Exception:
        pass
    return []


def _get_cached_holdings(etf_ticker: str, table: Any) -> list[str] | None:
    """Get cached holdings from DynamoDB. Returns None on miss or expiry."""
    try:
        result = table.get_item(Key={"pk": f"ETF#{etf_ticker}", "sk": "HOLDINGS"})
        item = result.get("Item")
        if not item:
            return None

        ttl = item.get("ttl", 0)
        if ttl < int(time.time()):
            return None

        holdings_json = item.get("holdings", "[]")
        return json.loads(holdings_json)
    except Exception as e:
        logger.warning(f"Cache read error for ETF#{etf_ticker}: {e}")
        return None


def _cache_holdings(etf_ticker: str, holdings: list[str], table: Any) -> None:
    """Cache holdings in DynamoDB."""
    try:
        table.put_item(
            Item={
                "pk": f"ETF#{etf_ticker}",
                "sk": "HOLDINGS",
                "holdings": json.dumps(holdings),
                "ttl": int(time.time()) + CACHE_TTL_SECONDS,
                "entityType": "ETF_HOLDINGS",
            }
        )
    except Exception as e:
        logger.warning(f"Cache write error for ETF#{etf_ticker}: {e}")
