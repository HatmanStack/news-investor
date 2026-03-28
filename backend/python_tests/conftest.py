"""Shared pytest fixtures for Python Lambda tests."""

import os
import sys
import pytest

# Add python source to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

# Set AWS credentials for moto
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["DYNAMODB_TABLE_NAME"] = "StocksCache"
os.environ["ALLOWED_ORIGINS"] = "*"


@pytest.fixture(autouse=True)
def _reset_module_state():
    """Reset module-level state between tests to prevent cross-test leaks."""
    yield
    try:
        from services.yfinance_service import _yfinance_circuit

        _yfinance_circuit._consecutive_failures = 0
        _yfinance_circuit._open_until = 0
    except ImportError:
        pass
    # Reset cached DynamoDB resources so mock-based tests start clean.
    # Without this, a real boto3 resource cached by one test leaks into
    # the next test's @patch scope.
    for mod_name in (
        "repositories.stocks_cache",
        "repositories.analyst_cache",
        "repositories.earnings_cache",
    ):
        mod = sys.modules.get(mod_name)
        if mod and hasattr(mod, "_dynamodb"):
            mod._dynamodb = None


@pytest.fixture
def api_event():
    """Factory for creating API Gateway events."""

    def _make_event(
        method: str = "GET",
        path: str = "/stocks",
        query_params: dict = None,
        body: str = None,
    ) -> dict:
        return {
            "rawPath": path,
            "requestContext": {
                "http": {"method": method},
                "requestId": "test-request-id",
            },
            "queryStringParameters": query_params,
            "body": body,
        }

    return _make_event
