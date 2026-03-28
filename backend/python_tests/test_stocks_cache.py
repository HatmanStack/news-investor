"""Tests for DynamoDB stocks cache repository."""

import os
import sys
import time
from decimal import Decimal
from unittest.mock import MagicMock, patch

# AWS env vars set in conftest.py (DYNAMODB_TABLE_NAME, credentials)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))


class TestGetStock:
    """Tests for get_stock function."""

    @patch("repositories.stocks_cache._get_table")
    def test_returns_item_when_exists(self, mock_get_table):
        """Returns cache item when it exists."""
        from repositories.stocks_cache import get_stock

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "STOCK#AAPL",
                "sk": "DATE#2024-01-15",
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"open": "150.0", "close": "154.0"},
                "ttl": int(time.time()) + 86400,
            }
        }
        mock_get_table.return_value = mock_table

        result = get_stock("AAPL", "2024-01-15")

        assert result is not None
        assert result["pk"] == "STOCK#AAPL"
        assert result["sk"] == "DATE#2024-01-15"
        assert result["ticker"] == "AAPL"
        assert result["priceData"]["open"] == "150.0"
        mock_table.get_item.assert_called_once_with(
            Key={"pk": "STOCK#AAPL", "sk": "DATE#2024-01-15"}
        )

    @patch("repositories.stocks_cache._get_table")
    def test_returns_none_when_not_exists(self, mock_get_table):
        """Returns None when item doesn't exist."""
        from repositories.stocks_cache import get_stock

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_get_table.return_value = mock_table

        result = get_stock("AAPL", "2024-01-15")

        assert result is None

    @patch("repositories.stocks_cache._get_table")
    def test_normalizes_ticker_to_uppercase(self, mock_get_table):
        """Normalizes ticker to uppercase."""
        from repositories.stocks_cache import get_stock

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "STOCK#AAPL",
                "sk": "DATE#2024-01-15",
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"close": "154.0"},
                "ttl": int(time.time()) + 86400,
            }
        }
        mock_get_table.return_value = mock_table

        result = get_stock("aapl", "2024-01-15")

        assert result is not None
        mock_table.get_item.assert_called_once_with(
            Key={"pk": "STOCK#AAPL", "sk": "DATE#2024-01-15"}
        )


class TestPutStock:
    """Tests for put_stock function."""

    @patch("repositories.stocks_cache._get_table")
    def test_stores_item_with_pk_sk_keys(self, mock_get_table):
        """Stores item with pk/sk composite keys and calculated TTL."""
        from repositories.stocks_cache import put_stock

        mock_table = MagicMock()
        mock_get_table.return_value = mock_table

        put_stock(
            {
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"open": Decimal("150.0"), "close": Decimal("154.0")},
            }
        )

        mock_table.put_item.assert_called_once()
        item = mock_table.put_item.call_args[1]["Item"]
        assert item["pk"] == "STOCK#AAPL"
        assert item["sk"] == "DATE#2024-01-15"
        assert item["ticker"] == "AAPL"
        assert item["date"] == "2024-01-15"
        assert "ttl" in item
        assert "fetchedAt" in item


class TestBatchGetStocks:
    """Tests for batch_get_stocks function."""

    def test_returns_items_for_dates(self):
        """Returns cached items for requested dates."""
        import repositories.stocks_cache as cache_module

        mock_dynamodb = MagicMock()
        mock_dynamodb.batch_get_item.return_value = {
            "Responses": {
                "StocksCache": [
                    {
                        "pk": "STOCK#AAPL",
                        "sk": "DATE#2024-01-15",
                        "ticker": "AAPL",
                        "date": "2024-01-15",
                    },
                    {
                        "pk": "STOCK#AAPL",
                        "sk": "DATE#2024-01-16",
                        "ticker": "AAPL",
                        "date": "2024-01-16",
                    },
                    {
                        "pk": "STOCK#AAPL",
                        "sk": "DATE#2024-01-17",
                        "ticker": "AAPL",
                        "date": "2024-01-17",
                    },
                ]
            }
        }
        saved = cache_module._dynamodb
        cache_module._dynamodb = mock_dynamodb
        try:
            result = cache_module.batch_get_stocks(
                "AAPL", ["2024-01-15", "2024-01-16", "2024-01-17"]
            )
            assert len(result) == 3
        finally:
            cache_module._dynamodb = saved

    def test_handles_empty_dates(self):
        """Handles empty dates list gracefully."""
        from repositories.stocks_cache import batch_get_stocks

        result = batch_get_stocks("AAPL", [])

        assert result == []

    def test_handles_unprocessed_keys(self):
        """Retries when DynamoDB returns UnprocessedKeys."""
        import repositories.stocks_cache as cache_module

        mock_dynamodb = MagicMock()
        mock_dynamodb.batch_get_item.side_effect = [
            {
                "Responses": {
                    "StocksCache": [
                        {
                            "pk": "STOCK#AAPL",
                            "sk": "DATE#2024-01-15",
                            "date": "2024-01-15",
                        },
                    ]
                },
                "UnprocessedKeys": {
                    "StocksCache": {
                        "Keys": [{"pk": "STOCK#AAPL", "sk": "DATE#2024-01-16"}]
                    }
                },
            },
            {
                "Responses": {
                    "StocksCache": [
                        {
                            "pk": "STOCK#AAPL",
                            "sk": "DATE#2024-01-16",
                            "date": "2024-01-16",
                        },
                    ]
                },
            },
        ]
        saved = cache_module._dynamodb
        cache_module._dynamodb = mock_dynamodb
        try:
            result = cache_module.batch_get_stocks("AAPL", ["2024-01-15", "2024-01-16"])
            assert mock_dynamodb.batch_get_item.call_count >= 2
            assert len(result) == 2
        finally:
            cache_module._dynamodb = saved

    def test_retries_exhausted(self):
        """Returns partial results when max retries exhausted."""
        import repositories.stocks_cache as cache_module

        mock_dynamodb = MagicMock()
        mock_dynamodb.batch_get_item.return_value = {
            "Responses": {
                "StocksCache": [
                    {"pk": "STOCK#AAPL", "sk": "DATE#2024-01-15", "date": "2024-01-15"},
                ]
            },
            "UnprocessedKeys": {
                "StocksCache": {"Keys": [{"pk": "STOCK#AAPL", "sk": "DATE#2024-01-16"}]}
            },
        }
        saved = cache_module._dynamodb
        cache_module._dynamodb = mock_dynamodb
        try:
            result = cache_module.batch_get_stocks("AAPL", ["2024-01-15", "2024-01-16"])
            assert isinstance(result, list)
            assert len(result) >= 1
        finally:
            cache_module._dynamodb = saved


class TestBatchPutStocks:
    """Tests for batch_put_stocks function."""

    @patch("repositories.stocks_cache._get_table")
    def test_stores_multiple_items_with_pk_sk(self, mock_get_table):
        """Stores multiple items in batch with pk/sk keys."""
        from repositories.stocks_cache import batch_put_stocks

        mock_table = MagicMock()
        mock_batch_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(
            return_value=mock_batch_writer
        )
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)
        mock_get_table.return_value = mock_table

        items = [
            {
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"close": Decimal("150.0")},
            },
            {
                "ticker": "AAPL",
                "date": "2024-01-16",
                "priceData": {"close": Decimal("151.0")},
            },
            {
                "ticker": "AAPL",
                "date": "2024-01-17",
                "priceData": {"close": Decimal("152.0")},
            },
        ]

        batch_put_stocks(items)

        assert mock_batch_writer.put_item.call_count == 3
        for c in mock_batch_writer.put_item.call_args_list:
            item = c[1]["Item"]
            assert item["pk"].startswith("STOCK#")
            assert item["sk"].startswith("DATE#")

    @patch("repositories.stocks_cache._get_table")
    def test_handles_empty_list(self, mock_get_table):
        """Handles empty list gracefully."""
        from repositories.stocks_cache import batch_put_stocks

        batch_put_stocks([])  # Should not raise


class TestQueryStocksByDateRange:
    """Tests for query_stocks_by_date_range function."""

    @patch("repositories.stocks_cache._get_table")
    def test_returns_items_in_range(self, mock_get_table):
        """Returns items within date range."""
        from repositories.stocks_cache import query_stocks_by_date_range

        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [
                {"pk": "STOCK#AAPL", "sk": "DATE#2024-01-16", "date": "2024-01-16"},
                {"pk": "STOCK#AAPL", "sk": "DATE#2024-01-17", "date": "2024-01-17"},
                {"pk": "STOCK#AAPL", "sk": "DATE#2024-01-18", "date": "2024-01-18"},
            ]
        }
        mock_get_table.return_value = mock_table

        result = query_stocks_by_date_range("AAPL", "2024-01-16", "2024-01-18")

        assert len(result) == 3
        dates = [item["date"] for item in result]
        assert "2024-01-16" in dates
        assert "2024-01-17" in dates
        assert "2024-01-18" in dates

    @patch("repositories.stocks_cache._get_table")
    def test_returns_empty_list_when_no_data(self, mock_get_table):
        """Returns empty list when no data in range."""
        from repositories.stocks_cache import query_stocks_by_date_range

        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}
        mock_get_table.return_value = mock_table

        result = query_stocks_by_date_range("AAPL", "2024-01-01", "2024-01-31")

        assert result == []


class TestCalculateTtl:
    """Tests for calculate_ttl function."""

    def test_historical_data_gets_90_day_ttl(self):
        """Data older than 7 days gets 90-day TTL."""
        from repositories.stocks_cache import calculate_ttl
        from datetime import datetime, timedelta

        old_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        ttl = calculate_ttl(old_date)

        # TTL should be approximately 90 days from now
        expected_min = int(time.time()) + (89 * 24 * 60 * 60)
        expected_max = int(time.time()) + (91 * 24 * 60 * 60)
        assert expected_min < ttl < expected_max

    def test_current_data_gets_1_day_ttl(self):
        """Data less than 7 days old gets 1-day TTL."""
        from repositories.stocks_cache import calculate_ttl
        from datetime import datetime, timedelta

        recent_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        ttl = calculate_ttl(recent_date)

        # TTL should be approximately 1 day from now
        expected_min = int(time.time()) + (23 * 60 * 60)
        expected_max = int(time.time()) + (25 * 60 * 60)
        assert expected_min < ttl < expected_max
