"""Tests for earnings handler."""

import json
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

os.environ["DYNAMODB_TABLE_NAME"] = "test-table"

from handlers.earnings import handle_earnings_request, handle_batch_earnings_request


def make_event(ticker=None, method="GET"):
    """Create a mock API Gateway event."""
    event = {
        "queryStringParameters": {},
        "requestContext": {"http": {"method": method}},
    }
    if ticker:
        event["queryStringParameters"]["ticker"] = ticker
    return event


def make_batch_event(tickers):
    """Create a mock batch API Gateway event."""
    return {
        "body": json.dumps({"tickers": tickers}),
        "requestContext": {"http": {"method": "POST"}},
    }


class TestHandleEarningsRequest:
    """Tests for handle_earnings_request."""

    def test_returns_400_for_missing_ticker(self):
        """Returns 400 when ticker is missing."""
        event = make_event()
        response = handle_earnings_request(event)

        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert (
            "invalid ticker" in body["error"].lower()
            or "missing" in body["error"].lower()
        )

    def test_returns_400_for_invalid_ticker(self):
        """Returns 400 for invalid ticker format."""
        event = make_event(ticker="invalid ticker!!")
        response = handle_earnings_request(event)

        assert response["statusCode"] == 400

    @patch("handlers.earnings.get_cached_earnings")
    def test_returns_cached_data_on_cache_hit(self, mock_cache):
        """Returns cached earnings on cache hit."""
        mock_cache.return_value = [
            {
                "pk": "EARN#AAPL",
                "sk": "DATE#2026-04-25",
                "entityType": "EARNINGS_EVENT",
                "ttl": 9999999999,
                "earningsDate": "2026-04-25",
                "earningsHour": "AMC",
                "epsEstimate": 2.35,
                "ticker": "AAPL",
            }
        ]

        event = make_event(ticker="AAPL")
        response = handle_earnings_request(event)

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert len(body["data"]) == 1
        assert body["data"][0]["earningsDate"] == "2026-04-25"
        # DynamoDB keys should be stripped
        assert "pk" not in body["data"][0]
        assert "sk" not in body["data"][0]

    @patch("handlers.earnings.cache_earnings")
    @patch("handlers.earnings.fetch_earnings_calendar")
    @patch("handlers.earnings.get_cached_earnings")
    def test_fetches_and_caches_on_cache_miss(self, mock_cache, mock_fetch, mock_store):
        """Fetches from yfinance and caches on cache miss."""
        mock_cache.return_value = None  # None = cache miss (not [])
        mock_fetch.return_value = [
            {"earningsDate": "2026-04-25", "earningsHour": "AMC"}
        ]

        event = make_event(ticker="AAPL")
        response = handle_earnings_request(event)

        assert response["statusCode"] == 200
        mock_fetch.assert_called_once_with("AAPL")
        mock_store.assert_called_once()


class TestHandleBatchEarningsRequest:
    """Tests for handle_batch_earnings_request."""

    def test_returns_400_for_invalid_json(self):
        """Returns 400 for invalid JSON body."""
        event = {"body": "not json"}
        response = handle_batch_earnings_request(event)

        assert response["statusCode"] == 400

    def test_returns_400_for_missing_tickers(self):
        """Returns 400 when tickers array is missing."""
        event = {"body": json.dumps({})}
        response = handle_batch_earnings_request(event)

        assert response["statusCode"] == 400

    def test_returns_400_for_too_many_tickers(self):
        """Returns 400 when tickers exceed limit."""
        event = make_batch_event([f"T{i}" for i in range(21)])
        response = handle_batch_earnings_request(event)

        assert response["statusCode"] == 400

    @patch("handlers.earnings._get_earnings_for_ticker")
    def test_returns_results_for_multiple_tickers(self, mock_get):
        """Returns results keyed by ticker."""
        mock_get.side_effect = lambda t: (
            [{"earningsDate": "2026-04-25"}] if t == "AAPL" else []
        )

        event = make_batch_event(["AAPL", "MSFT"])
        response = handle_batch_earnings_request(event)

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert "AAPL" in body["data"]["results"]
        assert "MSFT" in body["data"]["results"]
