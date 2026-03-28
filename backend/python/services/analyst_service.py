"""
Analyst data extraction service.
Extracts analyst consensus fields from yfinance stock.info.
"""

from typing import Any

from services.yfinance_service import fetch_symbol_metadata
from utils.logger import get_structured_logger

logger = get_structured_logger(__name__)


def fetch_analyst_data(ticker: str) -> dict[str, Any] | None:
    """
    Extract analyst consensus data for a ticker.

    Returns dict with analyst fields, or None if no analyst coverage.
    """
    try:
        info = fetch_symbol_metadata(ticker)
    except Exception as e:
        logger.warning(f"Failed to fetch metadata for {ticker}: {e}")
        return None

    target_mean = info.get("targetMeanPrice")
    target_high = info.get("targetHighPrice")
    target_low = info.get("targetLowPrice")
    recommendation = info.get("recommendationKey")
    num_opinions = info.get("numberOfAnalystOpinions")
    current_price = info.get("regularMarketPrice")

    # If no meaningful analyst data, return None
    if target_mean is None and num_opinions is None:
        logger.info(f"No analyst coverage for {ticker}")
        return None

    return {
        "targetMeanPrice": target_mean,
        "targetHighPrice": target_high,
        "targetLowPrice": target_low,
        "recommendationKey": recommendation,
        "numberOfAnalystOpinions": num_opinions,
        "currentPrice": current_price,
    }
