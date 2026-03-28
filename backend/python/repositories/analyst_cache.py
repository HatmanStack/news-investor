"""
Analyst cache repository.
DynamoDB CRUD for cached analyst consensus data.
PK: ANALYST#TICKER, SK: DATE#YYYY-MM-DD (today's date)
24h TTL.
"""

import os
import time
from datetime import UTC, datetime
from typing import Any

from utils.logger import get_structured_logger

logger = get_structured_logger(__name__)

TTL_SECONDS = 24 * 60 * 60  # 24 hours

_dynamodb = None


def _get_dynamodb():
    """Get DynamoDB resource (lazy initialization)."""
    global _dynamodb
    if _dynamodb is None:
        import boto3

        endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
        kwargs = {"endpoint_url": endpoint_url} if endpoint_url else {}
        _dynamodb = boto3.resource("dynamodb", **kwargs)
    return _dynamodb


def _get_table():
    """Get DynamoDB table resource."""
    table_name = os.environ.get("DYNAMODB_TABLE_NAME")
    if not table_name:
        raise RuntimeError("DYNAMODB_TABLE_NAME environment variable not set")
    return _get_dynamodb().Table(table_name)


def get_cached_analyst(ticker: str) -> dict[str, Any] | None:
    """
    Get cached analyst data for a ticker.
    Returns the cached dict on hit, None on miss or expired.
    """
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    table = _get_table()

    response = table.get_item(Key={"pk": f"ANALYST#{ticker.upper()}", "sk": f"DATE#{today}"})
    item = response.get("Item")
    if not item:
        return None

    # Check TTL expiry (DynamoDB TTL deletion is eventual)
    now = int(time.time())
    if item.get("ttl", now + 1) <= now:
        return None

    # Strip DynamoDB metadata fields
    keys_to_remove = {"pk", "sk", "entityType", "ttl", "createdAt", "updatedAt"}
    return {k: v for k, v in item.items() if k not in keys_to_remove}


def cache_analyst(ticker: str, data: dict[str, Any]) -> None:
    """Cache analyst data for a ticker with 24h TTL. Non-fatal on failure."""
    try:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        now = int(time.time())
        table = _get_table()

        table.put_item(
            Item={
                "pk": f"ANALYST#{ticker.upper()}",
                "sk": f"DATE#{today}",
                "entityType": "ANALYST",
                "ticker": ticker.upper(),
                "ttl": now + TTL_SECONDS,
                **data,
            }
        )
        logger.info("Cached analyst data", ticker=ticker.upper())
    except Exception:
        logger.warning(
            "Failed to cache analyst data (non-fatal)",
            ticker=ticker.upper(),
            exc_info=True,
        )
