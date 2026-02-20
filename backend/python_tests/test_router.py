"""Tests for Lambda router (index.py)."""

from unittest.mock import patch


class TestRouter:
    """Test router dispatches to correct handlers."""

    @patch("handlers.stocks.handle_stocks_request")
    def test_routes_get_stocks_to_stocks_handler(self, mock_handler):
        """GET /stocks routes to stocks handler."""
        from index import handler

        mock_handler.return_value = {"statusCode": 200, "body": "{}"}
        event = {
            "rawPath": "/stocks",
            "requestContext": {"http": {"method": "GET"}},
            "queryStringParameters": {"ticker": "AAPL"},
        }

        result = handler(event, None)

        mock_handler.assert_called_once_with(event)
        assert result["statusCode"] == 200

    @patch("handlers.search.handle_search_request")
    def test_routes_get_search_to_search_handler(self, mock_handler):
        """GET /search routes to search handler."""
        from index import handler

        mock_handler.return_value = {"statusCode": 200, "body": "{}"}
        event = {
            "rawPath": "/search",
            "requestContext": {"http": {"method": "GET"}},
            "queryStringParameters": {"query": "Apple"},
        }

        result = handler(event, None)

        mock_handler.assert_called_once_with(event)
        assert result["statusCode"] == 200

    @patch("handlers.batch.handle_batch_stocks_request")
    def test_routes_post_batch_stocks_to_batch_handler(self, mock_handler):
        """POST /batch/stocks routes to batch handler."""
        from index import handler

        mock_handler.return_value = {"statusCode": 200, "body": "{}"}
        event = {
            "rawPath": "/batch/stocks",
            "requestContext": {"http": {"method": "POST"}},
            "body": '{"tickers": ["AAPL"]}',
        }

        result = handler(event, None)

        mock_handler.assert_called_once_with(event)
        assert result["statusCode"] == 200

    def test_returns_404_for_unknown_route(self):
        """Unknown routes return 404."""
        # Need to mock the handlers to avoid import errors
        with patch("handlers.stocks.handle_stocks_request"), \
             patch("handlers.search.handle_search_request"), \
             patch("handlers.batch.handle_batch_stocks_request"):
            from index import handler

            event = {
                "rawPath": "/unknown",
                "requestContext": {"http": {"method": "GET"}},
            }

            result = handler(event, None)

            assert result["statusCode"] == 404
