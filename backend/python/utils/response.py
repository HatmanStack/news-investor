"""Response utilities for Lambda handlers."""

import json
import math
import os
from typing import Any

from typedefs import ApiGatewayResponse


def get_cors_headers() -> dict[str, str]:
    """Get CORS headers from environment."""
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowed_origins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _sanitize_floats(obj: Any) -> Any:
    """
    Recursively replace non-finite floats with None.

    json.dumps defaults to allow_nan=True, which serializes NaN/Infinity/
    -Infinity as bare tokens that are valid Python float literals but not
    valid JSON. No browser JSON.parse accepts them, so a single non-finite
    value anywhere in a payload fails the entire response to parse.
    pandas/yfinance routinely emit NaN for rows with incomplete OHLC data,
    so this surfaces on real price series. None matches how the client
    already handles missing fields, so a bad row loses that field instead
    of taking down the whole series.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {key: _sanitize_floats(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        # Tuples are traversed too: json.dumps serializes them as arrays, so an
        # untraversed tuple carrying a NaN reached json.dumps and — now that
        # allow_nan=False guards it — raised, turning a corrupt body into a
        # 500. A list is returned either way, which is what the tuple would
        # have serialized to.
        return [_sanitize_floats(item) for item in obj]
    return obj


def success_response(
    data: Any,
    status_code: int = 200,
    extra: dict[str, Any] | None = None,
) -> ApiGatewayResponse:
    """
    Create a successful API response.

    Args:
        data: Response data
        status_code: HTTP status code (default 200)
        extra: Optional extra fields to include at top level (e.g., _meta)

    Returns:
        API Gateway response dict
    """
    body: dict[str, Any] = {"data": data}
    if extra:
        body.update(extra)

    # allow_nan=False is a fail-fast guard for anything _sanitize_floats
    # missed, not the primary fix: it raises here (caught by the handler as
    # a 500) rather than letting NaN/Infinity slip out as broken JSON, but
    # by this point sanitization has already removed the finite/non-finite
    # cases it acts on, so it changes nothing for well-formed payloads.
    return {
        "statusCode": status_code,
        "headers": get_cors_headers(),
        "body": json.dumps(_sanitize_floats(body), allow_nan=False),
    }


def error_response(message: str, status_code: int = 500) -> ApiGatewayResponse:
    """
    Create an error API response.

    Args:
        message: Error message
        status_code: HTTP status code (default 500)

    Returns:
        API Gateway response dict
    """
    return {
        "statusCode": status_code,
        "headers": get_cors_headers(),
        "body": json.dumps({"error": message}),
    }
