"""Response utilities for Lambda handlers."""

import json
import os
from typing import Any


def get_cors_headers() -> dict[str, str]:
    """Get CORS headers from environment."""
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowed_origins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def success_response(
    data: Any,
    status_code: int = 200,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
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

    return {
        "statusCode": status_code,
        "headers": get_cors_headers(),
        "body": json.dumps(body),
    }


def error_response(message: str, status_code: int = 500) -> dict[str, Any]:
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
