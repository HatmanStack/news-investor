"""Tests for yfinance service layer."""

import pytest
from unittest.mock import patch, MagicMock
import pandas as pd

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from services.yfinance_service import (
    fetch_stock_prices,
    fetch_symbol_metadata,
    search_tickers,
)
from utils.error import APIError


class TestFetchStockPrices:
    """Tests for fetch_stock_prices function."""

    @patch("services.yfinance_service.yf.Ticker")
    def test_returns_dataframe_with_valid_ticker(self, mock_ticker_class):
        """Valid ticker returns DataFrame with price data."""
        # Create mock DataFrame
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
        mock_ticker.history.assert_called_once_with(start="2024-01-01", end="2024-01-02")

    @patch("services.yfinance_service.yf.Ticker")
    def test_raises_404_for_invalid_ticker(self, mock_ticker_class):
        """Invalid ticker raises APIError with 404."""
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()  # Empty DataFrame
        mock_ticker_class.return_value = mock_ticker

        with pytest.raises(APIError) as exc_info:
            fetch_stock_prices("INVALIDTICKER", "2024-01-01")

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.message.lower()

    @patch("services.yfinance_service.yf.Ticker")
    def test_handles_yfinance_exception(self, mock_ticker_class):
        """yfinance exceptions are wrapped in APIError."""
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = Exception("Network error")
        mock_ticker_class.return_value = mock_ticker

        with pytest.raises(APIError) as exc_info:
            fetch_stock_prices("AAPL", "2024-01-01")

        assert exc_info.value.status_code == 500


class TestFetchSymbolMetadata:
    """Tests for fetch_symbol_metadata function."""

    @patch("services.yfinance_service.yf.Ticker")
    def test_returns_metadata_for_valid_ticker(self, mock_ticker_class):
        """Valid ticker returns metadata dict."""
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

    @patch("services.yfinance_service.yf.Ticker")
    def test_raises_404_for_invalid_ticker(self, mock_ticker_class):
        """Invalid ticker raises APIError with 404."""
        mock_ticker = MagicMock()
        mock_ticker.info = {}  # Empty info
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
