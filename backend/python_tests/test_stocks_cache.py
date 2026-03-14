"""Tests for DynamoDB stocks cache repository."""

import pytest
import os
import sys
import time
from decimal import Decimal
from unittest.mock import patch

# AWS env vars set in conftest.py (DYNAMODB_TABLE_NAME, credentials)

import boto3
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))


@pytest.fixture
def dynamodb_table():
    """Create mock DynamoDB table with pk/sk composite keys."""
    with mock_aws():
        # Create the table with pk/sk keys (single-table design)
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = dynamodb.create_table(
            TableName="StocksCache",
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()

        # Reset the module's cached client so it uses the mock
        import repositories.stocks_cache as cache_module

        cache_module._dynamodb = dynamodb

        yield table


class TestGetStock:
    """Tests for get_stock function."""

    def test_returns_item_when_exists(self, dynamodb_table):
        """Returns cache item when it exists."""
        from repositories.stocks_cache import get_stock

        # Insert test item using pk/sk keys
        dynamodb_table.put_item(
            Item={
                "pk": "STOCK#AAPL",
                "sk": "DATE#2024-01-15",
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"open": "150.0", "close": "154.0"},
                "ttl": int(time.time()) + 86400,
            }
        )

        result = get_stock("AAPL", "2024-01-15")

        assert result is not None
        assert result["pk"] == "STOCK#AAPL"
        assert result["sk"] == "DATE#2024-01-15"
        assert result["ticker"] == "AAPL"
        assert result["priceData"]["open"] == "150.0"

    def test_returns_none_when_not_exists(self, dynamodb_table):
        """Returns None when item doesn't exist."""
        from repositories.stocks_cache import get_stock

        result = get_stock("AAPL", "2024-01-15")

        assert result is None

    def test_normalizes_ticker_to_uppercase(self, dynamodb_table):
        """Normalizes ticker to uppercase."""
        from repositories.stocks_cache import get_stock

        dynamodb_table.put_item(
            Item={
                "pk": "STOCK#AAPL",
                "sk": "DATE#2024-01-15",
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"close": "154.0"},
                "ttl": int(time.time()) + 86400,
            }
        )

        result = get_stock("aapl", "2024-01-15")

        assert result is not None


class TestPutStock:
    """Tests for put_stock function."""

    def test_stores_item_with_pk_sk_keys(self, dynamodb_table):
        """Stores item with pk/sk composite keys and calculated TTL."""
        from repositories.stocks_cache import put_stock

        put_stock(
            {
                "ticker": "AAPL",
                "date": "2024-01-15",
                "priceData": {"open": Decimal("150.0"), "close": Decimal("154.0")},
            }
        )

        response = dynamodb_table.get_item(
            Key={"pk": "STOCK#AAPL", "sk": "DATE#2024-01-15"}
        )
        item = response.get("Item")

        assert item is not None
        assert item["pk"] == "STOCK#AAPL"
        assert item["sk"] == "DATE#2024-01-15"
        assert item["ticker"] == "AAPL"
        assert item["date"] == "2024-01-15"
        assert "ttl" in item
        assert "fetchedAt" in item


class TestBatchGetStocks:
    """Tests for batch_get_stocks function."""

    def test_returns_items_for_dates(self, dynamodb_table):
        """Returns cached items for requested dates."""
        from repositories.stocks_cache import batch_get_stocks

        # Insert test items with pk/sk keys
        for day in ["15", "16", "17"]:
            dynamodb_table.put_item(
                Item={
                    "pk": "STOCK#AAPL",
                    "sk": f"DATE#2024-01-{day}",
                    "ticker": "AAPL",
                    "date": f"2024-01-{day}",
                    "priceData": {"close": "150.0"},
                    "ttl": int(time.time()) + 86400,
                }
            )

        result = batch_get_stocks("AAPL", ["2024-01-15", "2024-01-16", "2024-01-17"])

        assert len(result) == 3

    def test_handles_empty_dates(self, dynamodb_table):
        """Handles empty dates list gracefully."""
        from repositories.stocks_cache import batch_get_stocks

        result = batch_get_stocks("AAPL", [])

        assert result == []

    def test_handles_unprocessed_keys(self, dynamodb_table):
        """Retries when DynamoDB returns UnprocessedKeys."""
        from repositories.stocks_cache import batch_get_stocks, _get_dynamodb

        dynamodb = _get_dynamodb()

        # Mock batch_get_item to return UnprocessedKeys on first call
        original_batch_get = dynamodb.batch_get_item

        call_count = 0

        def mock_batch_get(**kwargs):
            nonlocal call_count
            call_count += 1
            result = original_batch_get(**kwargs)
            if call_count == 1:
                # Simulate UnprocessedKeys on first call
                table_name = list(kwargs["RequestItems"].keys())[0]
                keys = kwargs["RequestItems"][table_name]["Keys"]
                if len(keys) > 1:
                    # Return first item, mark rest as unprocessed
                    result["UnprocessedKeys"] = {table_name: {"Keys": keys[1:]}}
                    # Keep only first item in responses
                    items = result.get("Responses", {}).get(table_name, [])
                    if items:
                        result["Responses"][table_name] = items[:1]
            return result

        # Insert items
        for day in ["15", "16"]:
            dynamodb_table.put_item(
                Item={
                    "pk": "STOCK#AAPL",
                    "sk": f"DATE#2024-01-{day}",
                    "ticker": "AAPL",
                    "date": f"2024-01-{day}",
                    "priceData": {"close": "150.0"},
                    "ttl": int(time.time()) + 86400,
                }
            )

        with patch.object(dynamodb, "batch_get_item", side_effect=mock_batch_get):
            result = batch_get_stocks("AAPL", ["2024-01-15", "2024-01-16"])

        # Should have retried and gotten all items
        assert call_count >= 2
        assert len(result) >= 1  # At least first batch returned

    def test_retries_exhausted(self, dynamodb_table):
        """Returns partial results when max retries exhausted."""
        from repositories.stocks_cache import batch_get_stocks, _get_dynamodb

        dynamodb = _get_dynamodb()

        # Insert items
        for day in ["15", "16"]:
            dynamodb_table.put_item(
                Item={
                    "pk": "STOCK#AAPL",
                    "sk": f"DATE#2024-01-{day}",
                    "ticker": "AAPL",
                    "date": f"2024-01-{day}",
                    "priceData": {"close": "150.0"},
                    "ttl": int(time.time()) + 86400,
                }
            )

        original_batch_get = dynamodb.batch_get_item

        def always_unprocessed(**kwargs):
            result = original_batch_get(**kwargs)
            table_name = list(kwargs["RequestItems"].keys())[0]
            keys = kwargs["RequestItems"][table_name]["Keys"]
            if len(keys) > 0:
                # Always return some unprocessed keys
                result["UnprocessedKeys"] = {table_name: {"Keys": keys[-1:]}}
            return result

        with patch.object(dynamodb, "batch_get_item", side_effect=always_unprocessed):
            # Should not raise, returns what it can
            result = batch_get_stocks("AAPL", ["2024-01-15", "2024-01-16"])

        assert isinstance(result, list)


class TestBatchPutStocks:
    """Tests for batch_put_stocks function."""

    def test_stores_multiple_items_with_pk_sk(self, dynamodb_table):
        """Stores multiple items in batch with pk/sk keys."""
        from repositories.stocks_cache import batch_put_stocks

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

        # Verify all items stored with pk/sk keys
        for item in items:
            response = dynamodb_table.get_item(
                Key={"pk": f"STOCK#{item['ticker']}", "sk": f"DATE#{item['date']}"}
            )
            stored = response.get("Item")
            assert stored is not None
            assert stored["pk"] == f"STOCK#{item['ticker']}"
            assert stored["sk"] == f"DATE#{item['date']}"

    def test_handles_empty_list(self, dynamodb_table):
        """Handles empty list gracefully."""
        from repositories.stocks_cache import batch_put_stocks

        batch_put_stocks([])  # Should not raise


class TestQueryStocksByDateRange:
    """Tests for query_stocks_by_date_range function."""

    def test_returns_items_in_range(self, dynamodb_table):
        """Returns items within date range."""
        from repositories.stocks_cache import query_stocks_by_date_range

        # Insert test items with pk/sk keys
        for day in range(15, 20):
            dynamodb_table.put_item(
                Item={
                    "pk": "STOCK#AAPL",
                    "sk": f"DATE#2024-01-{day}",
                    "ticker": "AAPL",
                    "date": f"2024-01-{day}",
                    "priceData": {"close": str(150.0 + day)},
                    "ttl": int(time.time()) + 86400,
                }
            )

        result = query_stocks_by_date_range("AAPL", "2024-01-16", "2024-01-18")

        assert len(result) == 3
        dates = [item["date"] for item in result]
        assert "2024-01-16" in dates
        assert "2024-01-17" in dates
        assert "2024-01-18" in dates

    def test_returns_empty_list_when_no_data(self, dynamodb_table):
        """Returns empty list when no data in range."""
        from repositories.stocks_cache import query_stocks_by_date_range

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
