"""
Earnings calendar service.
Fetches upcoming earnings dates from yfinance.
"""

import logging
from typing import Any

from services.yfinance_service import _get_yfinance, retry_with_backoff
from utils.error import APIError

logger = logging.getLogger(__name__)


@retry_with_backoff
def fetch_earnings_calendar(ticker: str) -> list[dict[str, Any]]:
    """
    Fetch upcoming earnings dates for a ticker from yfinance.

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
        yf = _get_yfinance()
        stock = yf.Ticker(ticker)
        calendar = stock.calendar

        if not calendar:
            logger.info(f"[EarningsService] No calendar data for {ticker}")
            return []

        # calendar is a dict with keys like 'Earnings Date', 'Earnings Average', etc.
        earnings_date = calendar.get("Earnings Date")
        if not earnings_date:
            logger.info(f"[EarningsService] No earnings date for {ticker}")
            return []

        # earnings_date can be a list of dates or a single date
        dates = earnings_date if isinstance(earnings_date, list) else [earnings_date]

        results = []
        for date_val in dates:
            event = _parse_earnings_event(date_val, calendar)
            if event:
                results.append(event)

        logger.info(f"[EarningsService] Found {len(results)} earnings events for {ticker}")
        return results

    except APIError:
        raise
    except Exception as e:
        logger.error(f"[EarningsService] Error fetching earnings for {ticker}: {e}")
        return []


def _parse_earnings_event(date_val: Any, calendar: dict[str, Any]) -> dict[str, Any] | None:
    """Parse a single earnings event from calendar data."""
    try:
        # Handle datetime or Timestamp objects
        if hasattr(date_val, "strftime"):
            date_str = date_val.strftime("%Y-%m-%d")
            # Determine BMO/AMC from hour (hour=0 is date-only timestamp, not a real time)
            hour = getattr(date_val, "hour", 0)
            if hour == 0:
                earnings_hour = "TNS"  # Time not specified — yfinance often returns midnight
            elif hour < 12:
                earnings_hour = "BMO"
            else:
                earnings_hour = "AMC"
        elif isinstance(date_val, str):
            date_str = date_val[:10]  # Take YYYY-MM-DD portion
            earnings_hour = "TNS"  # Time not specified
        else:
            return None

        event: dict[str, Any] = {
            "earningsDate": date_str,
            "earningsHour": earnings_hour,
        }

        # Extract estimates if available
        eps_estimate = calendar.get("Earnings Average") or calendar.get("Earnings Low")
        if eps_estimate is not None:
            event["epsEstimate"] = float(eps_estimate)

        revenue_estimate = calendar.get("Revenue Average") or calendar.get("Revenue Low")
        if revenue_estimate is not None:
            event["revenueEstimate"] = float(revenue_estimate)

        return event

    except Exception as e:
        logger.warning(f"[EarningsService] Error parsing earnings event: {e}")
        return None
