"""Tests for earnings service."""

import sys
import os
from datetime import datetime
from unittest.mock import MagicMock, patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from services.earnings_service import fetch_earnings_calendar, _parse_earnings_event


class TestFetchEarningsCalendar:
    """Tests for fetch_earnings_calendar function."""

    @patch("services.earnings_service._get_yfinance")
    def test_returns_earnings_events_for_valid_ticker(self, mock_yf):
        """Returns earnings events when calendar data is available."""
        mock_ticker = MagicMock()
        mock_ticker.calendar = {
            "Earnings Date": [datetime(2026, 4, 25, 16, 0)],
            "Earnings Average": 2.35,
            "Revenue Average": 94500000000,
        }
        mock_yf.return_value.Ticker.return_value = mock_ticker

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert result[0]["earningsDate"] == "2026-04-25"
        assert result[0]["earningsHour"] == "AMC"  # 16:00 is after market
        assert result[0]["epsEstimate"] == 2.35
        assert result[0]["revenueEstimate"] == 94500000000

    @patch("services.earnings_service._get_yfinance")
    def test_returns_bmo_for_morning_earnings(self, mock_yf):
        """Returns BMO when earnings hour is before noon."""
        mock_ticker = MagicMock()
        mock_ticker.calendar = {
            "Earnings Date": [datetime(2026, 4, 25, 8, 0)],
        }
        mock_yf.return_value.Ticker.return_value = mock_ticker

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert result[0]["earningsHour"] == "BMO"

    @patch("services.earnings_service._get_yfinance")
    def test_returns_empty_list_for_no_calendar(self, mock_yf):
        """Returns empty list when no calendar data exists."""
        mock_ticker = MagicMock()
        mock_ticker.calendar = None
        mock_yf.return_value.Ticker.return_value = mock_ticker

        result = fetch_earnings_calendar("INVALID")

        assert result == []

    @patch("services.earnings_service._get_yfinance")
    def test_returns_empty_list_for_empty_calendar(self, mock_yf):
        """Returns empty list when calendar is empty dict."""
        mock_ticker = MagicMock()
        mock_ticker.calendar = {}
        mock_yf.return_value.Ticker.return_value = mock_ticker

        result = fetch_earnings_calendar("AAPL")

        assert result == []

    @patch("services.earnings_service._get_yfinance")
    def test_handles_missing_estimates(self, mock_yf):
        """Handles missing EPS and revenue estimates gracefully."""
        mock_ticker = MagicMock()
        mock_ticker.calendar = {
            "Earnings Date": [datetime(2026, 4, 25, 16, 0)],
        }
        mock_yf.return_value.Ticker.return_value = mock_ticker

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert "epsEstimate" not in result[0]
        assert "revenueEstimate" not in result[0]

    @patch("services.earnings_service._get_yfinance")
    def test_handles_exception_gracefully(self, mock_yf):
        """Returns empty list on yfinance errors."""
        mock_yf.return_value.Ticker.side_effect = Exception("Network error")

        result = fetch_earnings_calendar("AAPL")

        assert result == []


class TestParseEarningsEvent:
    """Tests for _parse_earnings_event helper."""

    def test_parses_datetime_object(self):
        """Parses datetime object correctly."""
        date_val = datetime(2026, 7, 15, 14, 30)
        calendar = {"Earnings Average": 1.5}

        result = _parse_earnings_event(date_val, calendar)

        assert result["earningsDate"] == "2026-07-15"
        assert result["earningsHour"] == "AMC"
        assert result["epsEstimate"] == 1.5

    def test_parses_string_date(self):
        """Parses string date format."""
        result = _parse_earnings_event("2026-07-15", {})

        assert result["earningsDate"] == "2026-07-15"
        assert result["earningsHour"] == "TNS"

    def test_returns_none_for_invalid_type(self):
        """Returns None for unsupported date type."""
        result = _parse_earnings_event(12345, {})

        assert result is None
