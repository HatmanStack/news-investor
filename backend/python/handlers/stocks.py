"""
Stocks endpoint handler with DynamoDB caching.
Handles GET /stocks requests for prices and metadata.
"""

from datetime import datetime
from typing import Any

from repositories.stocks_cache import batch_put_stocks, query_stocks_by_date_range
from services.yfinance_service import fetch_stock_prices, fetch_symbol_metadata
from utils.error import APIError
from utils.logger import get_structured_logger
from utils.response import error_response, success_response
from utils.transform import transform_history_to_tiingo, transform_info_to_metadata
from utils.validation import DATE_PATTERN, TICKER_PATTERN

logger = get_structured_logger(__name__)


def handle_prices_request(
    ticker: str,
    start_date: str,
    end_date: str | None,
) -> dict[str, Any]:
    """
    Handle stock prices request with caching.

    Args:
        ticker: Stock ticker symbol
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format (optional)

    Returns:
        Dict with data, cached flag, and cache hit rate
    """
    effective_end_date = end_date or datetime.now().strftime("%Y-%m-%d")

    try:
        # Check DynamoDB cache first
        cached_data = query_stocks_by_date_range(ticker, start_date, effective_end_date)

        # Calculate expected trading days (~5/7 of calendar days)
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(effective_end_date, "%Y-%m-%d")
        calendar_days = (end - start).days + 1
        expected_trading_days = max(1, int(calendar_days * 5 / 7))

        cache_hit_rate = (
            len(cached_data) / expected_trading_days if expected_trading_days > 0 else 0
        )

        # If cache hit rate >80%, use cached data
        if cache_hit_rate > 0.8 and cached_data:
            logger.info(f"[StocksHandler] Cache hit for {ticker}: {cache_hit_rate * 100:.1f}%")

            # Transform cached data to Tiingo format
            data = []
            for item in sorted(cached_data, key=lambda x: x["date"]):
                price_data = item.get("priceData", {})
                record = {
                    "date": f"{item['date']}T00:00:00.000Z",
                    **{
                        k: float(v) if hasattr(v, "__float__") else v for k, v in price_data.items()
                    },
                }
                data.append(record)

            return {
                "data": data,
                "cached": True,
                "cacheHitRate": cache_hit_rate,
            }

        # Cache miss - fetch from yfinance
        logger.info(
            f"[StocksHandler] Cache miss for {ticker}:"
            f" {cache_hit_rate * 100:.1f}% - fetching from API"
        )

        df = fetch_stock_prices(ticker, start_date, effective_end_date)
        data = transform_history_to_tiingo(df, ticker)

        # Cache the fetched data
        if data:
            try:
                cache_items = []
                for record in data:
                    date_str = record["date"][:10]  # Extract YYYY-MM-DD
                    cache_items.append(
                        {
                            "ticker": ticker,
                            "date": date_str,
                            "priceData": {
                                "open": record["open"],
                                "high": record["high"],
                                "low": record["low"],
                                "close": record["close"],
                                "volume": record["volume"],
                                "adjOpen": record["adjOpen"],
                                "adjHigh": record["adjHigh"],
                                "adjLow": record["adjLow"],
                                "adjClose": record["adjClose"],
                                "adjVolume": record["adjVolume"],
                                "divCash": record["divCash"],
                                "splitFactor": record["splitFactor"],
                            },
                        }
                    )
                batch_put_stocks(cache_items)
                logger.info(f"[StocksHandler] Cached {len(cache_items)} price records for {ticker}")
            except Exception as e:
                logger.error(f"[StocksHandler] Failed to cache stock prices: {e}")

        return {
            "data": data,
            "cached": False,
            "cacheHitRate": cache_hit_rate,
        }

    except APIError:
        raise
    except Exception as e:
        logger.warning(f"[StocksHandler] Cache check failed, falling back to API: {e}")
        df = fetch_stock_prices(ticker, start_date, effective_end_date)
        data = transform_history_to_tiingo(df, ticker)
        return {"data": data, "cached": False, "cacheHitRate": 0}


def handle_metadata_request(ticker: str) -> dict[str, Any]:
    """
    Handle symbol metadata request.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with metadata and cached flag
    """
    info = fetch_symbol_metadata(ticker)
    data = transform_info_to_metadata(info, ticker)
    return {"data": data, "cached": False}


def handle_stocks_request(event: dict[str, Any]) -> dict[str, Any]:
    """
    Handle GET /stocks requests.

    Query parameters:
        - ticker: Required, stock ticker symbol
        - startDate: Required for prices, YYYY-MM-DD format
        - endDate: Optional, YYYY-MM-DD format
        - type: Optional, "prices" (default) or "metadata"

    Args:
        event: API Gateway event

    Returns:
        API Gateway response
    """
    try:
        # Parse query parameters
        params = event.get("queryStringParameters") or {}
        ticker = params.get("ticker", "").upper()
        start_date = params.get("startDate")
        end_date = params.get("endDate")
        request_type = params.get("type", "prices")

        # Validate ticker
        if not ticker:
            return error_response("Missing required parameter: ticker", 400)

        if not TICKER_PATTERN.match(ticker):
            return error_response(
                "Invalid ticker format. Must contain only letters, numbers, dots, and hyphens.",
                400,
            )

        # Validate type
        if request_type not in ("prices", "metadata"):
            return error_response('Invalid type. Must be "prices" or "metadata".', 400)

        # Validate dates for prices request
        if request_type == "prices":
            if not start_date:
                return error_response("Missing required parameter for prices: startDate", 400)

            if not DATE_PATTERN.match(start_date):
                return error_response("Invalid startDate format. Must be YYYY-MM-DD.", 400)

            if end_date and not DATE_PATTERN.match(end_date):
                return error_response("Invalid endDate format. Must be YYYY-MM-DD.", 400)

            # Validate date range
            if start_date and end_date:
                if start_date > end_date:
                    return error_response(
                        "Invalid date range. startDate must be before or equal to endDate.",
                        400,
                    )

        # Route to appropriate handler
        if request_type == "metadata":
            result = handle_metadata_request(ticker)
        else:
            assert start_date is not None  # validated above for prices
            result = handle_prices_request(ticker, start_date, end_date)

        # Return response with cache metadata
        return success_response(
            result["data"],
            extra={
                "_meta": {
                    "cached": result["cached"],
                    "cacheHitRate": result.get("cacheHitRate"),
                    "timestamp": datetime.now().isoformat() + "Z",
                }
            },
        )

    except APIError as e:
        return error_response(e.message, e.status_code)
    except Exception as e:
        logger.error(f"[StocksHandler] Unhandled error: {e}", exc_info=True)
        return error_response("Internal server error", 500)
