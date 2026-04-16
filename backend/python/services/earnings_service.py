"""
Earnings calendar service.
Fetches upcoming earnings dates from Finnhub.
"""

import logging
from datetime import date, timedelta

from services.finnhub_service import fetch_earnings_finnhub
from typedefs import EarningsEvent
from utils.transform import transform_finnhub_earnings

logger = logging.getLogger(__name__)

# Forward window for earnings calendar queries
EARNINGS_FORWARD_DAYS = 90


def fetch_earnings_calendar(ticker: str) -> list[EarningsEvent]:
    """
    Fetch upcoming earnings dates for a ticker from Finnhub.

    Returns list of earnings events:
    [
        {
            "earningsDate": "2026-04-25",
            "earningsHour": "AMC",
            "epsEstimate": 2.35,
            "revenueEstimate": 94500000000,
        }
    ]
    """
    logger.info(f"[EarningsService] Fetching earnings for {ticker}")

    try:
        today = date.today()
        from_date = today.isoformat()
        to_date = (today + timedelta(days=EARNINGS_FORWARD_DAYS)).isoformat()

        raw_results = fetch_earnings_finnhub(ticker, from_date, to_date)
        results = transform_finnhub_earnings(raw_results)

        logger.info(f"[EarningsService] Found {len(results)} earnings events for {ticker}")
        return results

    except Exception as e:
        logger.error(f"[EarningsService] Error fetching earnings for {ticker}: {e}")
        return []
