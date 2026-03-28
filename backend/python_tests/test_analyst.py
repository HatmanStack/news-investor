"""Tests for analyst handler."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

os.environ["DYNAMODB_TABLE_NAME"] = "test-table"

# Mock yfinance_service before importing the handler so the module loads
# without requiring yfinance as a runtime dependency. Save and restore
# sys.modules to avoid polluting other test files (e.g., test_earnings_service).
_saved = sys.modules.get("services.yfinance_service")
sys.modules["services.yfinance_service"] = MagicMock()

from handlers.analyst import handle_analyst_request  # noqa: E402

# Restore original module state so later test files get the real module
if _saved is not None:
    sys.modules["services.yfinance_service"] = _saved
else:
    del sys.modules["services.yfinance_service"]


def make_event(ticker=None):
    """Create a mock API Gateway event."""
    event = {
        "queryStringParameters": {},
        "requestContext": {"http": {"method": "GET"}},
    }
    if ticker:
        event["queryStringParameters"]["ticker"] = ticker
    return event


class TestHandleAnalystRequest:
    """Tests for handle_analyst_request."""

    def test_returns_400_for_missing_ticker(self):
        """Returns 400 when ticker is missing."""
        event = make_event()
        response = handle_analyst_request(event)

        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert "ticker" in body["error"].lower()

    @patch("handlers.analyst.get_cached_analyst")
    def test_returns_cached_data_on_cache_hit(self, mock_cache):
        """Returns cached analyst data on cache hit."""
        mock_cache.return_value = {
            "targetMeanPrice": 175.0,
            "targetHighPrice": 200.0,
            "targetLowPrice": 150.0,
            "recommendationKey": "buy",
            "numberOfAnalystOpinions": 25,
            "currentPrice": 165.0,
        }

        response = handle_analyst_request(make_event(ticker="AAPL"))

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["data"]["available"] is True
        assert body["data"]["targetMeanPrice"] == 175.0

    @patch("handlers.analyst.get_cached_analyst")
    @patch("handlers.analyst.fetch_analyst_data")
    @patch("handlers.analyst.cache_analyst")
    def test_fetches_and_caches_on_cache_miss(
        self, mock_cache_write, mock_fetch, mock_cache_read
    ):
        """Fetches from yfinance and caches on cache miss."""
        mock_cache_read.return_value = None
        mock_fetch.return_value = {
            "targetMeanPrice": 175.0,
            "targetHighPrice": 200.0,
            "targetLowPrice": 150.0,
            "recommendationKey": "buy",
            "numberOfAnalystOpinions": 25,
            "currentPrice": 165.0,
        }

        response = handle_analyst_request(make_event(ticker="AAPL"))

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["data"]["available"] is True
        mock_cache_write.assert_called_once()

    @patch("handlers.analyst.get_cached_analyst")
    @patch("handlers.analyst.fetch_analyst_data")
    def test_returns_unavailable_when_no_data(self, mock_fetch, mock_cache_read):
        """Returns available=false when no analyst data exists."""
        mock_cache_read.return_value = None
        mock_fetch.return_value = None

        response = handle_analyst_request(make_event(ticker="XYZNOTREAL"))

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["data"]["available"] is False
        assert body["data"]["ticker"] == "XYZNOTREAL"
