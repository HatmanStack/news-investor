"""Tests for response utilities."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from utils.response import success_response, error_response
from utils.error import APIError


class TestSuccessResponse:
    """Tests for success_response function."""

    def test_returns_correct_structure(self):
        """Returns correct response structure."""
        result = success_response({"foo": "bar"})

        assert result["statusCode"] == 200
        assert "headers" in result
        assert "body" in result

    def test_body_contains_data_field(self):
        """Body contains data wrapped in data field."""
        result = success_response(["item1", "item2"])

        body = json.loads(result["body"])
        assert "data" in body
        assert body["data"] == ["item1", "item2"]

    def test_includes_extra_fields(self):
        """Extra fields are included at top level."""
        result = success_response(
            {"value": 1},
            extra={"_meta": {"cached": True, "timestamp": "2024-01-15T00:00:00Z"}},
        )

        body = json.loads(result["body"])
        assert body["data"] == {"value": 1}
        assert body["_meta"]["cached"] is True

    def test_custom_status_code(self):
        """Accepts custom status code."""
        result = success_response(None, status_code=201)

        assert result["statusCode"] == 201

    def test_includes_cors_headers(self):
        """Includes CORS headers."""
        result = success_response({})

        assert result["headers"]["Content-Type"] == "application/json"
        assert "Access-Control-Allow-Origin" in result["headers"]
        assert "Access-Control-Allow-Methods" in result["headers"]


class TestErrorResponse:
    """Tests for error_response function."""

    def test_returns_correct_structure(self):
        """Returns correct response structure."""
        result = error_response("Something went wrong")

        assert result["statusCode"] == 500
        assert "headers" in result
        assert "body" in result

    def test_body_contains_error_field(self):
        """Body contains error message."""
        result = error_response("Not found")

        body = json.loads(result["body"])
        assert body["error"] == "Not found"

    def test_custom_status_code(self):
        """Accepts custom status code."""
        result = error_response("Not found", status_code=404)

        assert result["statusCode"] == 404

    def test_includes_cors_headers(self):
        """Includes CORS headers."""
        result = error_response("Error")

        assert result["headers"]["Content-Type"] == "application/json"
        assert "Access-Control-Allow-Origin" in result["headers"]


class TestAPIError:
    """Tests for APIError exception."""

    def test_stores_message_and_status_code(self):
        """Stores message and status code."""
        error = APIError("Not found", 404)

        assert error.message == "Not found"
        assert error.status_code == 404
        assert str(error) == "APIError(404): Not found"

    def test_default_status_code_is_500(self):
        """Default status code is 500."""
        error = APIError("Server error")

        assert error.status_code == 500
