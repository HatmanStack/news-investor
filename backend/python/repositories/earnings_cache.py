"""
Earnings cache repository.
DynamoDB CRUD for cached earnings data.
"""

import math
import os
import time
from decimal import Decimal
from typing import Any

from utils.logger import get_structured_logger

logger = get_structured_logger(__name__)

TTL_SECONDS = 24 * 60 * 60  # 24 hours


def _float_to_decimal(obj: Any) -> Any:
    """
    Convert floats to Decimal for DynamoDB compatibility.

    boto3's Table resource rejects native Python floats outright (TypeError,
    not silent loss of precision), and Finnhub's epsEstimate/revenueEstimate
    arrive as JSON floats, so every real earnings item hit this on write —
    the cause of every /earnings request 500ing regardless of ticker: cache
    misses only avoided it when a ticker genuinely had no earnings (the
    empty-sentinel branch below has no float fields). Mirrors
    repositories/stocks_cache.py's helper of the same name.
    """
    if isinstance(obj, float):
        # A non-finite float survives Decimal(str(...)) as a non-finite
        # Decimal, which boto3 rejects exactly like the raw float did — so
        # converting NaN would have reproduced the 500 this helper exists to
        # stop. None is what the read path and the JSON response already use
        # for a missing number.
        return Decimal(str(obj)) if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _float_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_float_to_decimal(i) for i in obj]
    return obj


_dynamodb = None


# -> Any because boto3 ships no stubs and is scoped out in pyproject.toml's
# overrides block. Annotating the return keeps disallow_untyped_defs honest
# without claiming a precision the ecosystem does not offer.
def _get_dynamodb() -> Any:
    """Get DynamoDB resource (lazy initialization)."""
    global _dynamodb
    if _dynamodb is None:
        import boto3

        endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
        kwargs = {"endpoint_url": endpoint_url} if endpoint_url else {}
        _dynamodb = boto3.resource("dynamodb", **kwargs)
    return _dynamodb


def _get_table() -> Any:
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
                    **_float_to_decimal(item),
                }
            )
    logger.info("Cached earnings events", ticker=ticker.upper(), count=len(items))
