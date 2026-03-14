"""Tests for yfinance service layer."""

import pytest
from unittest.mock import patch, MagicMock
import pandas as pd

from services.yfinance_service import (
    fetch_stock_prices,
    fetch_symbol_metadata,
    search_tickers,
)
from utils.error import APIError


def _preload_yfinance():
    """Pre-load the lazy _yf module so we can patch it."""
    import services.yfinance_service as svc

    if svc._yf is None:
        import yfinance

        svc._yf = yfinance


class TestFetchStockPrices:
    """Tests for fetch_stock_prices function."""

    @patch("yfinance.Ticker")
    def test_returns_dataframe_with_valid_ticker(self, mock_ticker_class):
        """Valid ticker returns DataFrame with price data."""
        _preload_yfinance()
        mock_data = pd.DataFrame(
            {
                "Open": [150.0, 151.0],
                "High": [155.0, 156.0],
                "Low": [149.0, 150.0],
                "Close": [154.0, 155.0],
                "Volume": [1000000, 1100000],
                "Dividends": [0.0, 0.0],
                "Stock Splits": [0.0, 0.0],
            },
            index=pd.to_datetime(["2024-01-01", "2024-01-02"]),
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_data
        mock_ticker_class.return_value = mock_ticker

        result = fetch_stock_prices("AAPL", "2024-01-01", "2024-01-02")

        assert isinstance(result, pd.DataFrame)
        assert len(result) == 2
        assert "Open" in result.columns
        assert "Close" in result.columns
        mock_ticker.history.assert_called_once_with(
            start="2024-01-01", end="2024-01-02"
        )

    @patch("yfinance.Ticker")
    def test_raises_404_for_invalid_ticker(self, mock_ticker_class):
        """Invalid ticker raises APIError with 404."""
        _preload_yfinance()
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()
        mock_ticker_class.return_value = mock_ticker

        with pytest.raises(APIError) as exc_info:
            fetch_stock_prices("INVALIDTICKER", "2024-01-01")

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.message.lower()

    @patch("yfinance.Ticker")
    def test_handles_yfinance_exception(self, mock_ticker_class):
        """yfinance exceptions are wrapped in APIError."""
        _preload_yfinance()
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = Exception("Network error")
        mock_ticker_class.return_value = mock_ticker

        with pytest.raises(APIError) as exc_info:
            fetch_stock_prices("AAPL", "2024-01-01")

        assert exc_info.value.status_code == 500


class TestFetchSymbolMetadata:
    """Tests for fetch_symbol_metadata function."""

    @patch("yfinance.Ticker")
    def test_returns_metadata_for_valid_ticker(self, mock_ticker_class):
        """Valid ticker returns metadata dict."""
        _preload_yfinance()
        mock_info = {
            "shortName": "Apple Inc.",
            "longName": "Apple Inc.",
            "exchange": "NMS",
            "longBusinessSummary": "Apple designs and sells electronics.",
            "regularMarketPrice": 150.0,
        }
        mock_ticker = MagicMock()
        mock_ticker.info = mock_info
        mock_ticker_class.return_value = mock_ticker

        result = fetch_symbol_metadata("AAPL")

        assert result["shortName"] == "Apple Inc."
        assert result["exchange"] == "NMS"

    @patch("yfinance.Ticker")
    def test_raises_404_for_invalid_ticker(self, mock_ticker_class):
        """Invalid ticker raises APIError with 404."""
        _preload_yfinance()
        mock_ticker = MagicMock()
        mock_ticker.info = {}
        mock_ticker_class.return_value = mock_ticker

        with pytest.raises(APIError) as exc_info:
            fetch_symbol_metadata("INVALIDTICKER")

        assert exc_info.value.status_code == 404


class TestSearchTickers:
    """Tests for search_tickers function."""

    @patch("services.yfinance_service.requests.get")
    def test_returns_results_for_valid_query(self, mock_get):
        """Valid query returns list of results."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "quotes": [
                {
                    "symbol": "AAPL",
                    "shortname": "Apple Inc.",
                    "quoteType": "EQUITY",
                    "exchange": "NMS",
                },
                {
                    "symbol": "AAPD",
                    "shortname": "Direxion Daily AAPL Bear 1X",
                    "quoteType": "ETF",
                    "exchange": "PCX",
                },
            ]
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = search_tickers("Apple")

        assert len(result) == 2
        assert result[0]["symbol"] == "AAPL"
        assert result[0]["shortname"] == "Apple Inc."

    @patch("services.yfinance_service.requests.get")
    def test_returns_empty_list_for_no_results(self, mock_get):
        """Query with no results returns empty list."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"quotes": []}
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = search_tickers("xyznonexistent123")

        assert result == []

    @patch("services.yfinance_service.MAX_RETRIES", 0)
    @patch("services.yfinance_service.requests.get")
    def test_handles_request_timeout(self, mock_get):
        """Request timeout raises APIError with 504."""
        import requests

        mock_get.side_effect = requests.exceptions.Timeout()

        with pytest.raises(APIError) as exc_info:
            search_tickers("AAPL")

        assert exc_info.value.status_code == 504
        assert "timed out" in exc_info.value.message.lower()


class TestRetryWithBackoff:
    """Tests for retry_with_backoff decorator."""

    @patch("services.yfinance_service.time.sleep")
    @patch("services.yfinance_service.requests.get")
    def test_retries_twice_on_server_error(self, mock_get, mock_sleep):
        """Function is called max 3 times (1 initial + 2 retries) with MAX_RETRIES=2."""
        import requests as req

        mock_get.side_effect = req.exceptions.Timeout()

        with pytest.raises(APIError):
            search_tickers("AAPL")

        # 1 initial call + 2 retries = 3 total calls
        assert mock_get.call_count == 3
        # sleep called twice (between retries)
        assert mock_sleep.call_count == 2

    @patch("services.yfinance_service.time.sleep")
    @patch("services.yfinance_service.requests.get")
    def test_no_retry_on_client_error(self, mock_get, mock_sleep):
        """4xx errors (except 429) are not retried."""
        import requests as req

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.raise_for_status.side_effect = req.exceptions.HTTPError(
            response=mock_response
        )
        mock_get.return_value = mock_response

        with pytest.raises(APIError) as exc_info:
            search_tickers("AAPL")

        assert exc_info.value.status_code == 400
        # Should not have retried
        assert mock_get.call_count == 1
        assert mock_sleep.call_count == 0
