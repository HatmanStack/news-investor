"""
StocksCache Repository.
DynamoDB operations for caching stock price data.
"""

import os
import time
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from utils.logger import get_structured_logger


def _float_to_decimal(obj: Any) -> Any:
    """Convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _float_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_float_to_decimal(i) for i in obj]
    return obj


logger = get_structured_logger(__name__)

# Configuration — must match DYNAMODB_TABLE_NAME set in template.yaml
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
if not TABLE_NAME:
    raise RuntimeError("DYNAMODB_TABLE_NAME environment variable not set")
# TTL configuration (in seconds)
TTL_HISTORICAL = 90 * 24 * 60 * 60  # 90 days for historical data
TTL_CURRENT = 1 * 24 * 60 * 60  # 1 day for current data

# DynamoDB client (lazy initialization for Lambda cold start)
_dynamodb = None


def _get_dynamodb():
    """Get DynamoDB resource (lazy initialization)."""
    global _dynamodb
    if _dynamodb is None:
        endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
        kwargs = {"endpoint_url": endpoint_url} if endpoint_url else {}
        _dynamodb = boto3.resource("dynamodb", **kwargs)
    return _dynamodb


def _get_table():
    """Get DynamoDB table resource (lazy initialization)."""
    return _get_dynamodb().Table(TABLE_NAME)


def calculate_ttl(date_str: str) -> int:
    """
    Calculate TTL based on data age.
    Historical data (>7 days old) gets 90-day TTL.
    Current data (<7 days old) gets 1-day TTL.

    Args:
        date_str: Date in YYYY-MM-DD format

    Returns:
        Unix timestamp for TTL
    """
    from datetime import datetime

    try:
        data_date = datetime.strptime(date_str, "%Y-%m-%d")
        now = datetime.now()
        age_days = (now - data_date).days

        if age_days > 7:
            ttl_seconds = TTL_HISTORICAL
        else:
            ttl_seconds = TTL_CURRENT

        return int(time.time()) + ttl_seconds
    except ValueError:
        # Default to 1 day TTL if date parsing fails
        return int(time.time()) + TTL_CURRENT


def get_stock(ticker: str, date: str) -> dict[str, Any] | None:
    """
    Get single stock price record from cache.

    Args:
        ticker: Stock ticker symbol
        date: Date in YYYY-MM-DD format

    Returns:
        Cache item or None if not found
    """
    try:
        table = _get_table()
        response = table.get_item(Key={"ticker": ticker.upper(), "date": date})
        return response.get("Item")
    except Exception as e:
        logger.error(f"[StocksCache] Error getting stock: {e}", exc_info=True)
        raise


def put_stock(item: dict[str, Any]) -> None:
    """
    Store single stock price record in cache.

    Args:
        item: Cache item with ticker, date, priceData
    """
    try:
        table = _get_table()
        cache_item = {
            "ticker": item["ticker"].upper(),
            "date": item["date"],
            "priceData": _float_to_decimal(item["priceData"]),
            "ttl": calculate_ttl(item["date"]),
            "fetchedAt": int(time.time() * 1000),
        }
        if "metadata" in item:
            cache_item["metadata"] = _float_to_decimal(item["metadata"])

        table.put_item(Item=cache_item)
    except Exception as e:
        logger.error(f"[StocksCache] Error putting stock: {e}", exc_info=True)
        raise


def batch_get_stocks(ticker: str, dates: list[str]) -> list[dict[str, Any]]:
    """
    Batch get stock prices for multiple dates.

    Args:
        ticker: Stock ticker symbol
        dates: List of dates in YYYY-MM-DD format

    Returns:
        List of cache items
    """
    if not dates:
        return []

    try:
        dynamodb = _get_dynamodb()
        results = []

        # Process in batches of 100 (DynamoDB BatchGetItem limit)
        for i in range(0, len(dates), 100):
            batch_dates = dates[i : i + 100]
            keys = [{"ticker": ticker.upper(), "date": d} for d in batch_dates]

            response = dynamodb.batch_get_item(
                RequestItems={TABLE_NAME: {"Keys": keys}}
            )

            items = response.get("Responses", {}).get(TABLE_NAME, [])
            results.extend(items)

        return results
    except Exception as e:
        logger.error(f"[StocksCache] Error batch getting stocks: {e}", exc_info=True)
        raise


def batch_put_stocks(items: list[dict[str, Any]]) -> None:
    """
    Batch put stock prices.
    Handles chunking for DynamoDB's 25-item limit.

    Args:
        items: List of cache items with ticker, date, priceData
    """
    if not items:
        return

    try:
        table = _get_table()

        # Prepare items with TTL
        cache_items = []
        for item in items:
            cache_item = {
                "ticker": item["ticker"].upper(),
                "date": item["date"],
                "priceData": _float_to_decimal(item["priceData"]),
                "ttl": calculate_ttl(item["date"]),
                "fetchedAt": int(time.time() * 1000),
            }
            if "metadata" in item:
                cache_item["metadata"] = _float_to_decimal(item["metadata"])
            cache_items.append(cache_item)

        # Write in batches of 25
        with table.batch_writer() as batch:
            for item in cache_items:
                batch.put_item(Item=item)

        logger.info(f"[StocksCache] Batch put {len(cache_items)} items")
    except Exception as e:
        logger.error(f"[StocksCache] Error batch putting stocks: {e}", exc_info=True)
        raise


def query_stocks_by_date_range(
    ticker: str, start_date: str, end_date: str
) -> list[dict[str, Any]]:
    """
    Query stock prices by date range using DynamoDB Query API.

    Args:
        ticker: Stock ticker symbol
        start_date: Start date in YYYY-MM-DD format (inclusive)
        end_date: End date in YYYY-MM-DD format (inclusive)

    Returns:
        List of cache items within date range
    """
    try:
        table = _get_table()
        response = table.query(
            KeyConditionExpression=Key("ticker").eq(ticker.upper())
            & Key("date").between(start_date, end_date)
        )

        items = response.get("Items", [])
        logger.info(
            f"[StocksCache] Query found {len(items)} items for {ticker} "
            f"from {start_date} to {end_date}"
        )
        return items
    except Exception as e:
        logger.error(
            f"[StocksCache] Error querying stocks by date range: {e}", exc_info=True
        )
        raise
