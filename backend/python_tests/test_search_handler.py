"""Tests for search handler."""

import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from handlers.search import handle_search_request
from utils.error import APIError


class TestSearchHandlerValidation:
    """Tests for request validation."""

    def test_returns_400_when_query_missing(self):
        """Missing query returns 400."""
        event = {"queryStringParameters": {}}

        result = handle_search_request(event)

        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "query" in body["error"].lower()

    def test_returns_400_when_query_empty(self):
        """Empty query returns 400."""
        event = {"queryStringParameters": {"query": "   "}}

        result = handle_search_request(event)

        assert result["statusCode"] == 400

    def test_returns_400_when_query_too_long(self):
        """Query over 100 chars returns 400."""
        event = {"queryStringParameters": {"query": "a" * 101}}

        result = handle_search_request(event)

        assert result["statusCode"] == 400
        assert "long" in json.loads(result["body"])["error"].lower()


class TestSearchHandlerResults:
    """Tests for search result handling."""

    @patch("handlers.search.search_tickers")
    def test_returns_transformed_results(self, mock_search):
        """Returns results in Tiingo format."""
        mock_search.return_value = [
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

        event = {"queryStringParameters": {"query": "Apple"}}

        result = handle_search_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert len(body["data"]) == 2
        assert body["data"][0]["ticker"] == "AAPL"
        assert body["data"][0]["name"] == "Apple Inc."
        assert body["data"][0]["assetType"] == "Stock"
        assert body["data"][0]["isActive"] is True

    @patch("handlers.search.search_tickers")
    def test_returns_empty_array_for_no_results(self, mock_search):
        """No results returns empty array, not error."""
        mock_search.return_value = []

        event = {"queryStringParameters": {"query": "xyznonexistent123"}}

        result = handle_search_request(event)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["data"] == []

    @patch("handlers.search.search_tickers")
    def test_handles_api_error(self, mock_search):
        """API errors are returned correctly."""
        mock_search.side_effect = APIError("Search failed", 500)

        event = {"queryStringParameters": {"query": "Apple"}}

        result = handle_search_request(event)

        assert result["statusCode"] == 500
