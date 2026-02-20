"""Tests for stocks handler."""

import json
import os
import sys
from unittest.mock import patch
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from handlers.stocks import handle_stocks_request
from utils.error import APIError


class TestStocksHandlerValidation:
    """Tests for request validation."""

    def test_returns_400_when_ticker_missing(self):
        """Missing ticker returns 400."""
        event = {"queryStringParameters": {"startDate": "2024-01-01"}}

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "ticker" in body["error"].lower()

    def test_returns_400_when_ticker_invalid_format(self):
        """Invalid ticker format returns 400."""
        event = {"queryStringParameters": {"ticker": "AAPL@#$", "startDate": "2024-01-01"}}

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        assert "format" in json.loads(result["body"])["error"].lower()

    def test_returns_400_when_start_date_missing_for_prices(self):
        """Missing startDate for prices returns 400."""
        event = {"queryStringParameters": {"ticker": "AAPL"}}

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        assert "startDate" in json.loads(result["body"])["error"]

    def test_returns_400_when_start_date_invalid_format(self):
        """Invalid startDate format returns 400."""
        event = {"queryStringParameters": {"ticker": "AAPL", "startDate": "01-01-2024"}}

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        assert "format" in json.loads(result["body"])["error"].lower()

    def test_returns_400_when_date_range_invalid(self):
        """startDate > endDate returns 400."""
        event = {
            "queryStringParameters": {
                "ticker": "AAPL",
                "startDate": "2024-01-31",
                "endDate": "2024-01-01",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        assert "range" in json.loads(result["body"])["error"].lower()

    def test_returns_400_when_type_invalid(self):
        """Invalid type returns 400."""
        event = {
            "queryStringParameters": {
                "ticker": "AAPL",
                "startDate": "2024-01-01",
                "type": "invalid",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 400
        assert "type" in json.loads(result["body"])["error"].lower()


class TestStocksHandlerPrices:
    """Tests for prices request handling."""

    @patch("handlers.stocks.query_stocks_by_date_range")
    @patch("handlers.stocks.fetch_stock_prices")
    @patch("handlers.stocks.batch_put_stocks")
    def test_returns_prices_on_cache_miss(
        self, mock_batch_put, mock_fetch, mock_query
    ):
        """Returns prices from yfinance on cache miss."""
        mock_query.return_value = []  # Cache miss
        mock_df = pd.DataFrame(
            {
                "Open": [150.0],
                "High": [155.0],
                "Low": [149.0],
                "Close": [154.0],
                "Adj Close": [154.0],
                "Volume": [1000000],
                "Dividends": [0.0],
                "Stock Splits": [0.0],
            },
            index=pd.to_datetime(["2024-01-15"]),
        )
        mock_fetch.return_value = mock_df

        event = {
            "queryStringParameters": {
                "ticker": "AAPL",
                "startDate": "2024-01-15",
                "endDate": "2024-01-15",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert len(body["data"]) == 1
        assert body["_meta"]["cached"] is False

    @patch("handlers.stocks.query_stocks_by_date_range")
    def test_returns_prices_on_cache_hit(self, mock_query):
        """Returns prices from cache on cache hit."""
        # Return enough cached data for >80% hit rate (5 of 5 days)
        mock_query.return_value = [
            {"ticker": "AAPL", "date": f"2024-01-{15+i}", "priceData": {"close": 150.0 + i}}
            for i in range(5)
        ]

        event = {
            "queryStringParameters": {
                "ticker": "AAPL",
                "startDate": "2024-01-15",
                "endDate": "2024-01-19",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["_meta"]["cached"] is True

    @patch("handlers.stocks.fetch_stock_prices")
    @patch("handlers.stocks.query_stocks_by_date_range")
    def test_returns_404_when_ticker_not_found(self, mock_query, mock_fetch):
        """Returns 404 when ticker not found."""
        mock_query.return_value = []
        mock_fetch.side_effect = APIError("Ticker 'INVALID' not found", 404)

        event = {
            "queryStringParameters": {
                "ticker": "INVALID",
                "startDate": "2024-01-01",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 404


class TestStocksHandlerMetadata:
    """Tests for metadata request handling."""

    @patch("handlers.stocks.fetch_symbol_metadata")
    def test_returns_metadata(self, mock_fetch):
        """Returns company metadata."""
        mock_fetch.return_value = {
            "shortName": "Apple Inc.",
            "exchange": "NMS",
            "longBusinessSummary": "Apple designs electronics.",
        }

        event = {
            "queryStringParameters": {
                "ticker": "AAPL",
                "type": "metadata",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["data"]["name"] == "Apple Inc."
        assert body["data"]["ticker"] == "AAPL"

    @patch("handlers.stocks.fetch_symbol_metadata")
    def test_returns_404_for_invalid_ticker_metadata(self, mock_fetch):
        """Returns 404 for invalid ticker metadata request."""
        mock_fetch.side_effect = APIError("Ticker 'INVALID' not found", 404)

        event = {
            "queryStringParameters": {
                "ticker": "INVALID",
                "type": "metadata",
            }
        }

        result = handle_stocks_request(event)

        assert result["statusCode"] == 404
