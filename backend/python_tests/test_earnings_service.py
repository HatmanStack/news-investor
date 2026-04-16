"""Tests for earnings service."""

import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from services.earnings_service import fetch_earnings_calendar


class TestFetchEarningsCalendar:
    """Tests for fetch_earnings_calendar function."""

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_returns_transformed_earnings_events(self, mock_finnhub):
        """Returns transformed earnings events from Finnhub."""
        mock_finnhub.return_value = [
            {
                "date": "2026-04-25",
                "epsActual": None,
                "epsEstimate": 2.35,
                "hour": "amc",
                "quarter": 2,
                "revenueActual": None,
                "revenueEstimate": 94500000000,
                "symbol": "AAPL",
                "year": 2026,
            }
        ]

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert result[0]["earningsDate"] == "2026-04-25"
        assert result[0]["earningsHour"] == "AMC"
        assert result[0]["epsEstimate"] == 2.35
        assert result[0]["revenueEstimate"] == 94500000000

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_returns_bmo_for_bmo_hour(self, mock_finnhub):
        """Returns BMO when Finnhub hour is 'bmo'."""
        mock_finnhub.return_value = [
            {"date": "2026-04-25", "hour": "bmo", "symbol": "AAPL"}
        ]

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert result[0]["earningsHour"] == "BMO"

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_returns_empty_list_for_no_earnings(self, mock_finnhub):
        """Returns empty list when no earnings found."""
        mock_finnhub.return_value = []

        result = fetch_earnings_calendar("INVALID")

        assert result == []

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_handles_missing_estimates(self, mock_finnhub):
        """Handles missing EPS and revenue estimates gracefully."""
        mock_finnhub.return_value = [
            {
                "date": "2026-04-25",
                "hour": "amc",
                "epsEstimate": None,
                "revenueEstimate": None,
                "symbol": "AAPL",
            }
        ]

        result = fetch_earnings_calendar("AAPL")

        assert len(result) == 1
        assert "epsEstimate" not in result[0]
        assert "revenueEstimate" not in result[0]

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_handles_exception_gracefully(self, mock_finnhub):
        """Returns empty list on Finnhub errors."""
        mock_finnhub.side_effect = Exception("Network error")

        result = fetch_earnings_calendar("AAPL")

        assert result == []

    @patch("services.earnings_service.fetch_earnings_finnhub")
    def test_computes_90_day_forward_window(self, mock_finnhub):
        """Passes a 90-day forward date range to Finnhub."""
        mock_finnhub.return_value = []

        fetch_earnings_calendar("AAPL")

        mock_finnhub.assert_called_once()
        args = mock_finnhub.call_args[0]
        assert args[0] == "AAPL"
        from_date = args[1]
        to_date = args[2]
        # Verify dates are strings in YYYY-MM-DD format
        assert len(from_date) == 10
        assert len(to_date) == 10
        # Verify to_date is roughly 90 days after from_date
        from datetime import date

        d_from = date.fromisoformat(from_date)
        d_to = date.fromisoformat(to_date)
        delta = (d_to - d_from).days
        assert delta == 90
