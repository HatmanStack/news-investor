"""Tests for batch stocks handler."""

import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from handlers.batch import handle_batch_stocks_request
from utils.error import APIError


class TestBatchHandlerValidation:
    """Tests for request validation."""

    def test_returns_400_when_tickers_missing(self):
        """Missing tickers returns 400."""
        event = {"body": json.dumps({"startDate": "2024-01-01"})}

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "tickers" in body["error"].lower()

    def test_returns_400_when_tickers_empty(self):
        """Empty tickers array returns 400."""
        event = {"body": json.dumps({"tickers": [], "startDate": "2024-01-01"})}

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400

    def test_returns_400_when_tickers_exceeds_limit(self):
        """More than 10 tickers returns 400."""
        event = {
            "body": json.dumps({
                "tickers": [f"T{i}" for i in range(11)],
                "startDate": "2024-01-01",
            })
        }

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400
        assert "10" in json.loads(result["body"])["error"]

    def test_returns_400_when_start_date_missing(self):
        """Missing startDate returns 400."""
        event = {"body": json.dumps({"tickers": ["AAPL"]})}

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400
        assert "startDate" in json.loads(result["body"])["error"]

    def test_returns_400_when_date_invalid(self):
        """Invalid date format returns 400."""
        event = {
            "body": json.dumps({
                "tickers": ["AAPL"],
                "startDate": "01-01-2024",
            })
        }

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400

    def test_returns_400_when_body_invalid_json(self):
        """Invalid JSON returns 400."""
        event = {"body": "not json"}

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 400


class TestBatchHandlerResults:
    """Tests for batch result handling."""

    @patch("handlers.batch.handle_prices_request")
    def test_returns_aggregated_results(self, mock_prices):
        """Returns aggregated results for multiple tickers."""
        mock_prices.side_effect = [
            {"data": [{"close": 150}], "cached": True},
            {"data": [{"close": 100}], "cached": False},
        ]

        event = {
            "body": json.dumps({
                "tickers": ["AAPL", "GOOGL"],
                "startDate": "2024-01-01",
            })
        }

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert "AAPL" in body["data"]
        assert "GOOGL" in body["data"]
        assert body["_meta"]["successCount"] == 2
        assert body["_meta"]["errorCount"] == 0

    @patch("handlers.batch.handle_prices_request")
    def test_handles_partial_failures(self, mock_prices):
        """Handles partial failures gracefully."""
        mock_prices.side_effect = [
            {"data": [{"close": 150}], "cached": False},
            APIError("Ticker not found", 404),
        ]

        event = {
            "body": json.dumps({
                "tickers": ["AAPL", "INVALID"],
                "startDate": "2024-01-01",
            })
        }

        result = handle_batch_stocks_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert "AAPL" in body["data"]
        assert "INVALID" in body["errors"]
        assert body["_meta"]["successCount"] == 1
        assert body["_meta"]["errorCount"] == 1

    @patch("handlers.batch.handle_prices_request")
    def test_includes_cache_info_in_meta(self, mock_prices):
        """Includes cache hit info for each ticker."""
        mock_prices.side_effect = [
            {"data": [], "cached": True},
            {"data": [], "cached": False},
        ]

        event = {
            "body": json.dumps({
                "tickers": ["AAPL", "GOOGL"],
                "startDate": "2024-01-01",
            })
        }

        result = handle_batch_stocks_request(event)

        body = json.loads(result["body"])
        assert body["_meta"]["cached"]["AAPL"] is True
        assert body["_meta"]["cached"]["GOOGL"] is False

    def test_includes_batch_limit_header(self):
        """Response includes X-Batch-Limit header."""
        with patch("handlers.batch.handle_prices_request") as mock:
            mock.return_value = {"data": [], "cached": False}

            event = {
                "body": json.dumps({
                    "tickers": ["AAPL"],
                    "startDate": "2024-01-01",
                })
            }

            result = handle_batch_stocks_request(event)

            assert result["headers"]["X-Batch-Limit"] == "10"
