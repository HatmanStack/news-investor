"""
Earnings cache repository.
DynamoDB CRUD for cached earnings data.
"""

import os
import time
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
    """Get DynamoDB table resource (deferred env check for testability)."""
    table_name = os.environ.get("DYNAMODB_TABLE_NAME")
    if not table_name:
        raise RuntimeError("DYNAMODB_TABLE_NAME environment variable not set")
    return _get_dynamodb().Table(table_name)


def get_cached_earnings(ticker: str) -> list[dict[str, Any]] | None:
    """Query all cached earnings for a ticker. Returns None on cache miss, [] on cached empty."""
    from boto3.dynamodb.conditions import Key

    table = _get_table()
    response = table.query(
        KeyConditionExpression=Key("pk").eq(f"EARN#{ticker.upper()}")
        & Key("sk").begins_with("DATE#")
    )
    # Filter out expired items (TTL deletion is eventual)
    now = int(time.time())
    items = [item for item in response.get("Items", []) if item.get("ttl", now + 1) > now]

    if not items:
        return None  # True cache miss — no items at all

    # Check for empty sentinel (ticker has no earnings, cached to prevent re-fetch)
    if len(items) == 1 and items[0].get("sk") == EMPTY_SENTINEL_SK:
        return []  # Cached empty — don't call yfinance again

    # Filter out sentinel if mixed with real items (shouldn't happen, but defensive)
    return [item for item in items if item.get("sk") != EMPTY_SENTINEL_SK]


EMPTY_SENTINEL_SK = "DATE#_EMPTY"


def cache_earnings(ticker: str, items: list[dict[str, Any]]) -> None:
    """Cache earnings events for a ticker. Caches empty sentinel for tickers with no earnings."""
    table = _get_table()
    now = int(time.time())

    if not items:
        # Write sentinel so we don't re-fetch tickers with no earnings (ETFs, index funds)
        table.put_item(
            Item={
                "pk": f"EARN#{ticker.upper()}",
                "sk": EMPTY_SENTINEL_SK,
                "entityType": "EARNINGS_EMPTY",
                "ticker": ticker.upper(),
                "ttl": now + TTL_SECONDS,
            }
        )
        logger.info("Cached empty earnings sentinel", ticker=ticker.upper())
        return

    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(
                Item={
                    "pk": f"EARN#{ticker.upper()}",
                    "sk": f"DATE#{item['earningsDate']}",
                    "entityType": "EARNINGS_EVENT",
                    "ticker": ticker.upper(),
                    "ttl": now + TTL_SECONDS,
                    **item,
                }
            )
    logger.info("Cached earnings events", ticker=ticker.upper(), count=len(items))
