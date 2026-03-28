"""Tests for analyst cache repository."""

import os
import sys
import time
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

# DYNAMODB_TABLE_NAME already set to "StocksCache" by conftest.py


class TestAnalystCache:
    """Tests for analyst cache repository."""

    @patch("repositories.analyst_cache._get_table")
    def test_cache_analyst_writes_with_correct_pk_sk_and_ttl(self, mock_get_table):
        """cache_analyst writes with ANALYST# PK and 24h TTL."""
        from repositories.analyst_cache import cache_analyst

        mock_table = MagicMock()
        mock_get_table.return_value = mock_table

        data = {
            "targetMeanPrice": 175.0,
            "recommendationKey": "buy",
            "numberOfAnalystOpinions": 25,
        }

        cache_analyst("AAPL", data)

        mock_table.put_item.assert_called_once()
        item = mock_table.put_item.call_args[1]["Item"]
        assert item["pk"] == "ANALYST#AAPL"
        assert item["sk"].startswith("DATE#")
        assert item["entityType"] == "ANALYST"
        assert item["ttl"] > int(time.time())
        assert item["targetMeanPrice"] == 175.0

    @patch("repositories.analyst_cache._get_table")
    def test_get_cached_analyst_returns_data_on_hit(self, mock_get_table):
        """get_cached_analyst returns data when cache hit."""
        from repositories.analyst_cache import get_cached_analyst

        mock_table = MagicMock()
        now = int(time.time())
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "ANALYST#AAPL",
                "sk": "DATE#2025-11-01",
                "entityType": "ANALYST",
                "ttl": now + 86400,
                "targetMeanPrice": 175.0,
            }
        }
        mock_get_table.return_value = mock_table

        result = get_cached_analyst("AAPL")
        assert result is not None
        assert result["targetMeanPrice"] == 175.0

    @patch("repositories.analyst_cache._get_table")
    def test_get_cached_analyst_returns_none_on_miss(self, mock_get_table):
        """get_cached_analyst returns None when no cached data."""
        from repositories.analyst_cache import get_cached_analyst

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_get_table.return_value = mock_table

        result = get_cached_analyst("AAPL")
        assert result is None

    @patch("repositories.analyst_cache._get_table")
    def test_get_cached_analyst_returns_none_on_expired_ttl(self, mock_get_table):
        """get_cached_analyst returns None when TTL has expired."""
        from repositories.analyst_cache import get_cached_analyst

        mock_table = MagicMock()
        now = int(time.time())
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "ANALYST#AAPL",
                "sk": "DATE#2025-11-01",
                "entityType": "ANALYST",
                "ttl": now - 100,  # Expired
                "targetMeanPrice": 175.0,
            }
        }
        mock_get_table.return_value = mock_table

        result = get_cached_analyst("AAPL")
        assert result is None
