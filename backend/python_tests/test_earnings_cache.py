"""Tests for earnings cache repository."""

import sys
import os
import time
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

# Must set env var before importing the module
os.environ["DYNAMODB_TABLE_NAME"] = "test-table"

from repositories.earnings_cache import get_cached_earnings, cache_earnings


class TestGetCachedEarnings:
    """Tests for get_cached_earnings function."""

    @patch("repositories.earnings_cache._get_table")
    def test_returns_cached_items(self, mock_get_table):
        """Returns cached earnings items that haven't expired."""
        future_ttl = int(time.time()) + 3600
        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [
                {
                    "pk": "EARN#AAPL",
                    "sk": "DATE#2026-04-25",
                    "earningsDate": "2026-04-25",
                    "earningsHour": "AMC",
                    "ttl": future_ttl,
                }
            ]
        }
        mock_get_table.return_value = mock_table

        result = get_cached_earnings("AAPL")

        assert len(result) == 1
        assert result[0]["earningsDate"] == "2026-04-25"

    @patch("repositories.earnings_cache._get_table")
    def test_filters_out_expired_items(self, mock_get_table):
        """Filters out items with expired TTL."""
        expired_ttl = int(time.time()) - 3600
        future_ttl = int(time.time()) + 3600
        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [
                {"earningsDate": "2026-04-25", "ttl": expired_ttl},
                {"earningsDate": "2026-07-25", "ttl": future_ttl},
            ]
        }
        mock_get_table.return_value = mock_table

        result = get_cached_earnings("AAPL")

        assert len(result) == 1
        assert result[0]["earningsDate"] == "2026-07-25"

    @patch("repositories.earnings_cache._get_table")
    def test_returns_none_for_no_items(self, mock_get_table):
        """Returns None (cache miss) when no cached items exist."""
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}
        mock_get_table.return_value = mock_table

        result = get_cached_earnings("AAPL")

        assert result is None


class TestCacheEarnings:
    """Tests for cache_earnings function."""

    @patch("repositories.earnings_cache._get_table")
    def test_caches_earnings_items(self, mock_get_table):
        """Caches earnings items with correct PK/SK and TTL."""
        mock_table = MagicMock()
        mock_batch = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(
            return_value=mock_batch
        )
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)
        mock_get_table.return_value = mock_table

        items = [
            {
                "earningsDate": "2026-04-25",
                "earningsHour": "AMC",
                "epsEstimate": 2.35,
            }
        ]

        cache_earnings("AAPL", items)

        mock_batch.put_item.assert_called_once()
        call_args = mock_batch.put_item.call_args
        item = call_args[1]["Item"]
        assert item["pk"] == "EARN#AAPL"
        assert item["sk"] == "DATE#2026-04-25"
        assert item["entityType"] == "EARNINGS_EVENT"
        assert item["ticker"] == "AAPL"
        assert "ttl" in item

    @patch("repositories.earnings_cache._get_table")
    def test_caches_empty_sentinel_for_empty_items(self, mock_get_table):
        """Writes an empty sentinel to prevent re-fetching tickers with no earnings."""
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table

        cache_earnings("AAPL", [])

        mock_table.put_item.assert_called_once()
        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"]
        assert item["pk"] == "EARN#AAPL"
        assert item["sk"] == "DATE#_EMPTY"
        assert item["entityType"] == "EARNINGS_EMPTY"
        assert "ttl" in item
