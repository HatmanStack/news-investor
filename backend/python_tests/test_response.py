"""Tests for response utilities."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from utils.error import APIError
from utils.response import error_response, success_response


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


class TestSuccessResponseNonFiniteFloats:
    """Tests for success_response's handling of NaN/Infinity/-Infinity.

    json.loads happily accepts the bare NaN/Infinity/-Infinity tokens that
    json.dumps(allow_nan=True) would otherwise emit (they're valid Python
    float literals), so a round-trip through json.loads(json.dumps(...))
    would pass even on a body no browser's JSON.parse can read. These tests
    assert on the raw serialized body TEXT instead, to actually catch that.
    """

    def test_nan_serializes_to_null_not_bare_token(self):
        """A NaN value in the payload becomes JSON null, not the bare token NaN."""
        result = success_response({"open": float("nan"), "close": 1.5})

        assert "NaN" not in result["body"]
        body = json.loads(result["body"])
        assert body["data"]["open"] is None
        assert body["data"]["close"] == 1.5

    def test_positive_infinity_serializes_to_null(self):
        """A +Infinity value becomes JSON null, not the bare token Infinity."""
        result = success_response({"value": float("inf")})

        assert "Infinity" not in result["body"]
        body = json.loads(result["body"])
        assert body["data"]["value"] is None

    def test_negative_infinity_serializes_to_null(self):
        """A -Infinity value becomes JSON null, not the bare token -Infinity."""
        result = success_response({"value": float("-inf")})

        assert "-Infinity" not in result["body"]
        body = json.loads(result["body"])
        assert body["data"]["value"] is None

    def test_nested_non_finite_values_in_dict_inside_list_inside_dict(self):
        """Non-finite floats nested inside list-of-dicts payloads are sanitized."""
        result = success_response(
            {
                "data": [
                    {"date": "2024-01-01", "open": 10.0, "high": float("nan")},
                    {"date": "2024-01-02", "open": float("inf"), "high": 12.0},
                ]
            }
        )

        assert "NaN" not in result["body"]
        assert "Infinity" not in result["body"]
        rows = json.loads(result["body"])["data"]["data"]
        assert rows[0] == {"date": "2024-01-01", "open": 10.0, "high": None}
        assert rows[1] == {"date": "2024-01-02", "open": None, "high": 12.0}

    def test_ordinary_values_are_unchanged(self):
        """Finite floats, ints, strings, bools and None pass through untouched."""
        payload = {
            "float_val": 3.14,
            "int_val": 42,
            "str_val": "hello",
            "true_val": True,
            "false_val": False,
            "none_val": None,
        }
        result = success_response(payload)

        body = json.loads(result["body"])
        assert body["data"] == payload


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


class TestSuccessResponseTuples:
    """
    Tuples serialize as JSON arrays, so they must be traversed too.

    _sanitize_floats originally walked dicts and lists only. An untraversed
    tuple carrying a non-finite float reached json.dumps and — now that
    allow_nan=False guards it — raised, turning a corrupt body into a 500.
    """

    def test_non_finite_inside_a_tuple_becomes_null(self):
        result = success_response({"pair": (1.0, float("nan"))})
        assert "NaN" not in result["body"]
        assert json.loads(result["body"])["data"]["pair"] == [1.0, None]

    def test_tuple_of_ordinary_values_survives_as_an_array(self):
        result = success_response({"pair": (1.0, 2.5)})
        assert json.loads(result["body"])["data"]["pair"] == [1.0, 2.5]

    def test_nested_tuple_inside_a_list(self):
        result = success_response({"rows": [(1.0, float("inf"))]})
        assert "Infinity" not in result["body"]
        assert json.loads(result["body"])["data"]["rows"] == [[1.0, None]]
