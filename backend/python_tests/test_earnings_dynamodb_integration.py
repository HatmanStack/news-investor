"""
Integration tests for the earnings cache against a real (moto-mocked) DynamoDB.

The unit tests in test_earnings_cache.py and test_earnings_handler.py mock
`_get_table`/boto3 directly, so they never exercise boto3's actual item
serialization — which is exactly where the production bug lived. boto3's
Table resource rejects native Python `float` values (Finnhub's epsEstimate
and revenueEstimate) with a TypeError; a `MagicMock` table swallows that
distinction silently. These tests use moto to stand up a real DynamoDB table
so the serialization path is genuinely exercised.
"""

import os
import sys
from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))


TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]


@pytest.fixture
def dynamodb_table():
    """Create a real (moto-backed) DynamoDB table matching the prod schema."""
    with mock_aws():
        # Reset the module-level cached resource so it picks up moto's mock
        # region/credentials instead of a real one cached by an earlier test.
        from repositories import earnings_cache

        earnings_cache._dynamodb = None

        client = boto3.resource("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
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
        yield
        earnings_cache._dynamodb = None


class TestCacheEarningsRealSerialization:
    """
    Reproduces the production defect: fetch_earnings_calendar's float
    epsEstimate/revenueEstimate reaching table.batch_writer().put_item()
    unconverted raised boto3's TypeError for every ticker with real
    upcoming earnings (the common case for AAPL/MSFT/NVDA/TSLA), while
    tickers with no earnings (empty items list) hit a float-free code path
    and succeeded — matching "500 for every ticker tried."
    """

    def test_caching_float_estimates_does_not_raise(self, dynamodb_table):
        """cache_earnings must not raise TypeError on real Finnhub-shaped floats."""
        from repositories.earnings_cache import cache_earnings

        items = [
            {
                "earningsDate": "2026-04-25",
                "earningsHour": "AMC",
                "epsEstimate": 2.35,
                "revenueEstimate": 94500000000.0,
            }
        ]

        # Before the fix this raised:
        #   TypeError: Float types are not supported. Use Decimal types instead.
        cache_earnings("AAPL", items)

    def test_round_trip_preserves_values_as_floats(self, dynamodb_table):
        """A cache write followed by a handler-level read returns floats, not Decimal."""
        from handlers.earnings import handle_earnings_request
        from repositories.earnings_cache import cache_earnings

        items = [
            {
                "earningsDate": "2026-04-25",
                "earningsHour": "AMC",
                "epsEstimate": 2.35,
                "revenueEstimate": 94500000000.0,
            }
        ]
        cache_earnings("AAPL", items)

        # Cache hit path: get_cached_earnings returns real Decimal values from
        # DynamoDB; _clean_cache_items must convert them back or
        # success_response's json.dumps (no Decimal support) raises TypeError.
        event = {
            "queryStringParameters": {"ticker": "AAPL"},
            "requestContext": {"http": {"method": "GET"}},
        }
        response = handle_earnings_request(event)

        assert response["statusCode"] == 200
        import json as json_module

        body = json_module.loads(response["body"])
        assert body["data"][0]["epsEstimate"] == 2.35
        assert body["data"][0]["revenueEstimate"] == 94500000000.0
        assert isinstance(body["data"][0]["epsEstimate"], float)

    def test_caches_empty_sentinel_without_floats(self, dynamodb_table):
        """The pre-existing empty-sentinel path (no earnings) has no floats and still works."""
        from repositories.earnings_cache import cache_earnings, get_cached_earnings

        cache_earnings("XLF", [])

        assert get_cached_earnings("XLF") == []

    def test_stored_estimates_are_decimal_in_dynamodb(self, dynamodb_table):
        """Verifies the write side actually converted — Decimal is DynamoDB's only numeric type."""
        from repositories.earnings_cache import cache_earnings

        items = [
            {
                "earningsDate": "2026-04-25",
                "earningsHour": "AMC",
                "epsEstimate": 2.35,
            }
        ]
        cache_earnings("AAPL", items)

        table = boto3.resource("dynamodb", region_name="us-east-1").Table(TABLE_NAME)
        stored = table.get_item(Key={"pk": "EARN#AAPL", "sk": "DATE#2026-04-25"})[
            "Item"
        ]
        assert isinstance(stored["epsEstimate"], Decimal)
        assert stored["epsEstimate"] == Decimal("2.35")


class TestEndToEndCacheMissThenHit:
    """Full handler flow: cache miss -> fetch from Finnhub -> cache write -> re-request -> cache hit."""

    def test_full_request_cycle_survives_real_dynamodb(
        self, dynamodb_table, monkeypatch
    ):
        """Simulates the exact reported failure: GET /earnings for a ticker with real estimates."""
        from unittest.mock import patch

        from handlers.earnings import handle_earnings_request

        finnhub_payload = [
            {
                "date": "2026-04-25",
                "epsActual": None,
                "epsEstimate": 2.35,
                "hour": "amc",
                "quarter": 2,
                "revenueActual": None,
                "revenueEstimate": 94500000000,
                "symbol": "AAPL",
                "year": 2026,
            }
        ]

        event = {
            "queryStringParameters": {"ticker": "AAPL"},
            "requestContext": {"http": {"method": "GET"}},
        }

        with patch(
            "services.earnings_service.fetch_earnings_finnhub",
            return_value=finnhub_payload,
        ):
            first = handle_earnings_request(
                event
            )  # cache miss, writes to real DynamoDB

        assert first["statusCode"] == 200

        second = handle_earnings_request(event)  # cache hit, reads Decimal back
        assert second["statusCode"] == 200

        import json as json_module

        body = json_module.loads(second["body"])
        assert body["data"][0]["earningsDate"] == "2026-04-25"
        assert body["data"][0]["epsEstimate"] == 2.35


class TestNonFiniteEstimates:
    """
    Decimal(str(float('nan'))) is a non-finite Decimal, and boto3 rejects
    those exactly as it rejects the raw float — so converting a NaN estimate
    would have reproduced the 500 this helper exists to prevent.
    """

    def test_non_finite_float_becomes_none_not_a_nan_decimal(self):
        from repositories.earnings_cache import _float_to_decimal

        assert _float_to_decimal(float("nan")) is None
        assert _float_to_decimal(float("inf")) is None
        assert _float_to_decimal(float("-inf")) is None

    def test_ordinary_estimates_still_convert(self):
        from repositories.earnings_cache import _float_to_decimal

        assert _float_to_decimal(1.25) == Decimal("1.25")
        assert _float_to_decimal({"eps": 2.5}) == {"eps": Decimal("2.5")}
