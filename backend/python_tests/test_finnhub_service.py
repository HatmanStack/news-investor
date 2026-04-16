"""Tests for Finnhub Python service."""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from utils.error import APIError


class TestSearchTickersFinnhub:
    """Tests for search_tickers_finnhub function."""

    @patch("services.finnhub_service.requests.get")
    def test_calls_correct_url_with_query_and_api_key(self, mock_get):
        """Verifies URL construction with query and API key."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"count": 0, "result": []}
        mock_get.return_value = mock_response

        from services.finnhub_service import search_tickers_finnhub

        search_tickers_finnhub("apple")

        mock_get.assert_called_once()
        call_url = mock_get.call_args[0][0]
        call_params = mock_get.call_args[1].get("params", {})
        assert "finnhub.io/api/v1/search" in call_url
        assert call_params["q"] == "apple"
        assert call_params["token"] == "test-key"

    @patch("services.finnhub_service.requests.get")
    def test_parses_response_result_array(self, mock_get):
        """Verifies response parsing returns result array."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "count": 2,
            "result": [
                {
                    "description": "Apple Inc.",
                    "displaySymbol": "AAPL",
                    "symbol": "AAPL",
                    "type": "Common Stock",
                },
                {
                    "description": "Apple Hospitality REIT Inc",
                    "displaySymbol": "APLE",
                    "symbol": "APLE",
                    "type": "REIT",
                },
            ],
        }
        mock_get.return_value = mock_response

        from services.finnhub_service import search_tickers_finnhub

        results = search_tickers_finnhub("apple")

        assert len(results) == 2
        assert results[0]["symbol"] == "AAPL"
        assert results[0]["description"] == "Apple Inc."
        assert results[1]["symbol"] == "APLE"

    @patch("services.finnhub_service.requests.get")
    def test_returns_empty_list_for_no_results(self, mock_get):
        """Empty result array returns empty list."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"count": 0, "result": []}
        mock_get.return_value = mock_response

        from services.finnhub_service import search_tickers_finnhub

        results = search_tickers_finnhub("xyznonexistent")

        assert results == []


class TestFetchEarningsFinnhub:
    """Tests for fetch_earnings_finnhub function."""

    @patch("services.finnhub_service.requests.get")
    def test_calls_correct_url_with_ticker_and_dates(self, mock_get):
        """Verifies URL construction with ticker, date range, and API key."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"earningsCalendar": []}
        mock_get.return_value = mock_response

        from services.finnhub_service import fetch_earnings_finnhub

        fetch_earnings_finnhub("AAPL", "2026-04-01", "2026-07-01")

        mock_get.assert_called_once()
        call_params = mock_get.call_args[1].get("params", {})
        assert call_params["symbol"] == "AAPL"
        assert call_params["from"] == "2026-04-01"
        assert call_params["to"] == "2026-07-01"
        assert call_params["token"] == "test-key"

    @patch("services.finnhub_service.requests.get")
    def test_filters_results_to_requested_ticker(self, mock_get):
        """Only returns results matching the requested ticker."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "earningsCalendar": [
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
                },
                {
                    "date": "2026-04-25",
                    "epsActual": None,
                    "epsEstimate": 3.10,
                    "hour": "bmo",
                    "quarter": 2,
                    "revenueActual": None,
                    "revenueEstimate": 50000000000,
                    "symbol": "MSFT",
                    "year": 2026,
                },
            ]
        }
        mock_get.return_value = mock_response

        from services.finnhub_service import fetch_earnings_finnhub

        results = fetch_earnings_finnhub("AAPL", "2026-04-01", "2026-07-01")

        assert len(results) == 1
        assert results[0]["symbol"] == "AAPL"
        assert results[0]["epsEstimate"] == 2.35


class TestFinnhubServiceErrors:
    """Tests for error handling."""

    def test_raises_api_error_when_api_key_missing(self):
        """Raises APIError when FINNHUB_API_KEY not set."""
        os.environ.pop("FINNHUB_API_KEY", None)

        # Need to reimport to pick up missing env var
        if "services.finnhub_service" in sys.modules:
            del sys.modules["services.finnhub_service"]
        from services.finnhub_service import search_tickers_finnhub

        with pytest.raises(APIError, match="FINNHUB_API_KEY not configured"):
            search_tickers_finnhub("apple")

    @patch("services.finnhub_service.requests.get")
    def test_raises_api_error_on_http_error(self, mock_get):
        """Raises APIError on non-200 HTTP response after retries."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Rate limit exceeded"
        mock_get.return_value = mock_response

        if "services.finnhub_service" in sys.modules:
            del sys.modules["services.finnhub_service"]
        from services.finnhub_service import search_tickers_finnhub

        with pytest.raises(APIError):
            search_tickers_finnhub("apple")

    @patch("services.finnhub_service._finnhub_circuit")
    def test_raises_api_error_when_circuit_open(self, mock_circuit):
        """Raises APIError when circuit breaker is open."""
        os.environ["FINNHUB_API_KEY"] = "test-key"
        mock_circuit.allow_request.return_value = False

        from services.finnhub_service import search_tickers_finnhub

        with pytest.raises(APIError, match="circuit breaker open"):
            search_tickers_finnhub("apple")

    @patch("services.finnhub_service.time.sleep")
    @patch("services.finnhub_service.requests.get")
    def test_retries_once_on_failure_then_succeeds(self, mock_get, mock_sleep):
        """Retries once on server error, returns success on second attempt."""
        os.environ["FINNHUB_API_KEY"] = "test-key"

        fail_response = MagicMock()
        fail_response.status_code = 500
        fail_response.text = "Internal Server Error"

        success_response = MagicMock()
        success_response.status_code = 200
        success_response.json.return_value = {
            "count": 1,
            "result": [
                {"symbol": "AAPL", "description": "Apple Inc.", "type": "Common Stock"}
            ],
        }

        mock_get.side_effect = [fail_response, success_response]

        if "services.finnhub_service" in sys.modules:
            del sys.modules["services.finnhub_service"]
        from services.finnhub_service import search_tickers_finnhub

        results = search_tickers_finnhub("apple")

        assert len(results) == 1
        assert mock_get.call_count == 2
        mock_sleep.assert_called_once_with(1)
