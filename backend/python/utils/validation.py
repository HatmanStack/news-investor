"""Shared validation patterns and helpers for Python handlers."""

import re

# Canonical patterns — imported by all handlers
TICKER_PATTERN = re.compile(r"^[A-Z0-9.\-]+$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_QUERY_LENGTH = 100


def validate_ticker(raw: str) -> str | None:
    """Validate and normalize a ticker symbol. Returns uppercase ticker or None."""
    if not raw:
        return None
    normalized = raw.upper().strip()
    return normalized if TICKER_PATTERN.match(normalized) else None


def validate_date(raw: str | None) -> str | None:
    """Validate date string format (YYYY-MM-DD). Returns the string or None."""
    if not raw or not DATE_PATTERN.match(raw):
        return None
    return raw
