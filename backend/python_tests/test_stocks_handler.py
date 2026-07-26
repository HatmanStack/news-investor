"""Tests for stocks handler."""

import json
import os
import sys
from typing import ClassVar
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


class TestHistoricalBackfillOnCacheHit:
    """
    The cache-hit path must lay down HIST# when a ticker has none.

    HIST# was only written on the cache-miss path, so a ticker whose STOCK#
    cache was already warm when that write was introduced returns from the
    cache-hit branch forever and never acquires the durable price spine the
    prediction model needs.
    """

    CACHED: ClassVar = [
        {"ticker": "AAPL", "date": f"2024-01-{15 + i}", "priceData": {"close": 150.0 + i}}
        for i in range(5)
    ]
    EVENT: ClassVar = {
        "queryStringParameters": {
            "ticker": "AAPL",
            "startDate": "2024-01-15",
            "endDate": "2024-01-19",
        }
    }

    @patch("handlers.stocks.batch_put_historical")
    @patch("handlers.stocks.has_historical")
    @patch("handlers.stocks.query_stocks_by_date_range")
    def test_backfills_when_no_historical_exists(self, mock_query, mock_has, mock_put):
        from handlers.stocks import handle_stocks_request

        mock_query.return_value = self.CACHED
        mock_has.return_value = False

        result = handle_stocks_request(self.EVENT)

        assert result["statusCode"] == 200
        mock_put.assert_called_once()
        written = mock_put.call_args.args[0]
        assert len(written) == 5
        assert {row["ticker"] for row in written} == {"AAPL"}
        # Dates must be YYYY-MM-DD, not the ISO timestamps the response carries.
        assert all(len(row["date"]) == 10 for row in written)

    @patch("handlers.stocks.batch_put_historical")
    @patch("handlers.stocks.has_historical")
    @patch("handlers.stocks.query_stocks_by_date_range")
    def test_does_not_rewrite_when_historical_exists(self, mock_query, mock_has, mock_put):
        """One bulk write per ticker ever, not one per cache hit."""
        from handlers.stocks import handle_stocks_request

        mock_query.return_value = self.CACHED
        mock_has.return_value = True

        result = handle_stocks_request(self.EVENT)

        assert result["statusCode"] == 200
        mock_put.assert_not_called()

    @patch("handlers.stocks.batch_put_historical")
    @patch("handlers.stocks.has_historical")
    @patch("handlers.stocks.query_stocks_by_date_range")
    def test_backfill_failure_does_not_break_the_price_response(
        self, mock_query, mock_has, mock_put
    ):
        """A repair must never cost the caller the answer they asked for."""
        from handlers.stocks import handle_stocks_request

        mock_query.return_value = self.CACHED
        mock_has.return_value = False
        mock_put.side_effect = RuntimeError("dynamo down")

        result = handle_stocks_request(self.EVENT)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert len(body["data"]) == 5
