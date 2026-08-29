"""
Stocks endpoint handler with DynamoDB caching.
Handles GET /stocks requests for prices and metadata.
"""

from datetime import datetime, timedelta
from typing import Any

from repositories.stocks_cache import (
    batch_put_historical,
    batch_put_stocks,
    has_historical,
    query_stocks_by_date_range,
)
from services.yfinance_service import fetch_stock_prices, fetch_symbol_metadata
from typedefs import ApiGatewayEvent, ApiGatewayResponse, MetadataResult, PriceRecord, PriceResult
from utils.error import APIError
from utils.logger import get_structured_logger
from utils.response import error_response, success_response
from utils.transform import transform_history_to_tiingo, transform_info_to_metadata
from utils.validation import DATE_PATTERN, TICKER_PATTERN

logger = get_structured_logger(__name__)

# A cache-hit is judged by density over the *whole* requested range (see
# handle_prices_request), which a long range's stale tail barely moves — 5
# missing days out of ~1300 expected trading days still clears 80%. This is
# the independent guard against that: the tail itself must be within a few
# calendar days of the requested end, regardless of overall density. Sized to
# the worst ordinary gap (a holiday adjacent to a weekend, e.g. Thu close ->
# Mon open = 4 calendar days) so it doesn't misfire on legitimately fresh data.
MAX_TAIL_STALENESS_DAYS = 4


def _cached_items_to_price_records(items: list[dict[str, Any]]) -> list[PriceRecord]:
    """Transform STOCK# cache items (any order) into date-sorted Tiingo records."""
    data: list[PriceRecord] = []
    for item in sorted(items, key=lambda x: x["date"]):
        price_data = item.get("priceData", {})
        record: PriceRecord = {
            "date": f"{item['date']}T00:00:00.000Z",
            "open": float(price_data.get("open", 0)),
            "high": float(price_data.get("high", 0)),
            "low": float(price_data.get("low", 0)),
            "close": float(price_data.get("close", 0)),
            "volume": int(price_data.get("volume", 0)),
            "adjOpen": float(price_data.get("adjOpen", 0)),
            "adjHigh": float(price_data.get("adjHigh", 0)),
            "adjLow": float(price_data.get("adjLow", 0)),
            "adjClose": float(price_data.get("adjClose", 0)),
            "adjVolume": int(price_data.get("adjVolume", 0)),
            "divCash": float(price_data.get("divCash", 0)),
            "splitFactor": float(price_data.get("splitFactor", 1.0)),
        }
        data.append(record)
    return data


def _persist_price_records(ticker: str, records: list[PriceRecord]) -> None:
    """
    Write a fetched batch to both STOCK# (TTL'd response cache) and HIST#
    (the durable price spine the ML pipeline trains on). Each write is its
    own try/except — a caching failure must never cost the caller the price
    data they asked for.
    """
    if not records:
        return

    try:
        cache_items = [
            {
                "ticker": ticker,
                "date": record["date"][:10],
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
            for record in records
        ]
        batch_put_stocks(cache_items)
        logger.info(f"[StocksHandler] Cached {len(cache_items)} price records for {ticker}")
    except Exception as e:
        logger.error(f"[StocksHandler] Failed to cache stock prices: {e}")

    # Persist the same fetch as HIST# — the durable price spine the ML
    # pipeline reads. STOCK# above is a TTL'd response cache and expires, so
    # it cannot serve as training data. Kept in its own try block so a
    # failure here never breaks the price response the caller asked for.
    try:
        batch_put_historical(
            [
                {
                    "ticker": ticker,
                    "date": record["date"][:10],
                    "open": record["open"],
                    "high": record["high"],
                    "low": record["low"],
                    "close": record["close"],
                    "volume": record["volume"],
                    "adjClose": record.get("adjClose"),
                }
                for record in records
            ]
        )
    except Exception as e:
        logger.error(f"[StocksHandler] Failed to persist historical prices: {e}")


def _backfill_historical_if_missing(ticker: str, data: list[PriceRecord]) -> None:
    """
    Lay down the durable HIST# spine if this ticker has none.

    HIST# was only written on the cache-miss path, so a ticker whose STOCK#
    cache was already warm when that write was added is stuck: it returns
    from the cache-hit branch every time and never reaches the writer. Those
    tickers can never be predicted on, because the model requires 30 days of
    price history.

    Gated on an existence probe so this costs one extra read per cache hit
    and one bulk write per ticker, ever — not a write amplification on every
    request.
    """
    try:
        if not has_historical(ticker):
            batch_put_historical(
                [
                    {
                        "ticker": ticker,
                        "date": record["date"][:10],
                        "open": record["open"],
                        "high": record["high"],
                        "low": record["low"],
                        "close": record["close"],
                        "volume": record["volume"],
                        "adjClose": record.get("adjClose"),
                    }
                    for record in data
                ]
            )
            logger.info(
                f"[StocksHandler] Backfilled {len(data)} HIST# records for {ticker} from cache hit"
            )
    except Exception as e:
        # Never fail the price response over a repair.
        logger.error(f"[StocksHandler] HIST# backfill failed for {ticker}: {e}")


def _top_up_stale_tail(
    ticker: str,
    cached_records: list[PriceRecord],
    latest_cached_date: str,
    effective_end_date: str,
) -> list[PriceRecord]:
    """
    Extend a cached series whose tail has fallen more than
    MAX_TAIL_STALENESS_DAYS behind the requested end date.

    Fetches only the gap after the last cached date, not the whole requested
    range — a five-year lookback with a one-week-stale tail costs one small
    yfinance call, not a re-fetch of years of unchanged history. On any
    failure to fetch the gap, falls back to the stale cached series: the
    caller still sees the true last date in the response either way (via
    latestAvailableDate), which discloses staleness rather than masking it.
    """
    top_up_start = (datetime.strptime(latest_cached_date, "%Y-%m-%d") + timedelta(days=1)).strftime(
        "%Y-%m-%d"
    )

    try:
        df = fetch_stock_prices(ticker, top_up_start, effective_end_date)
        top_up_records = transform_history_to_tiingo(df, ticker)
    except Exception as e:
        logger.warning(
            f"[StocksHandler] Tail top-up failed for {ticker} "
            f"({top_up_start}..{effective_end_date}): {e}. "
            f"Serving cache through {latest_cached_date} instead."
        )
        return cached_records

    if not top_up_records:
        return cached_records

    _persist_price_records(ticker, top_up_records)
    return cached_records + top_up_records


def handle_prices_request(
    ticker: str,
    start_date: str,
    end_date: str | None,
) -> PriceResult:
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

        # If cache hit rate >80%, use cached data — but density over the whole
        # range says nothing about *where* the gap is. Check the tail
        # separately: a stale-but-thin tail can hide behind a dense long
        # range (see MAX_TAIL_STALENESS_DAYS above).
        if cache_hit_rate > 0.8 and cached_data:
            data: list[PriceRecord] = _cached_items_to_price_records(cached_data)

            # Backfill runs against the full cached span before any top-up,
            # so a ticker reaching this branch for the first time still gets
            # its complete HIST# spine rather than only the topped-up tail.
            _backfill_historical_if_missing(ticker, data)

            latest_cached_date = data[-1]["date"][:10]
            tail_gap_days = (end - datetime.strptime(latest_cached_date, "%Y-%m-%d")).days

            if tail_gap_days > MAX_TAIL_STALENESS_DAYS:
                logger.info(
                    f"[StocksHandler] Cache hit for {ticker} ({cache_hit_rate * 100:.1f}% "
                    f"dense) but tail is {tail_gap_days}d stale (latest {latest_cached_date}) "
                    f"- topping up through {effective_end_date}"
                )
                data = _top_up_stale_tail(ticker, data, latest_cached_date, effective_end_date)
            else:
                logger.info(f"[StocksHandler] Cache hit for {ticker}: {cache_hit_rate * 100:.1f}%")

            return PriceResult(
                data=data,
                cached=True,
                cacheHitRate=cache_hit_rate,
                latestAvailableDate=data[-1]["date"][:10] if data else None,
            )

        # Cache miss - fetch from yfinance
        logger.info(
            f"[StocksHandler] Cache miss for {ticker}:"
            f" {cache_hit_rate * 100:.1f}% - fetching from API"
        )

        df = fetch_stock_prices(ticker, start_date, effective_end_date)
        data = transform_history_to_tiingo(df, ticker)
        _persist_price_records(ticker, data)

        return PriceResult(
            data=data,
            cached=False,
            cacheHitRate=cache_hit_rate,
            latestAvailableDate=data[-1]["date"][:10] if data else None,
        )

    except APIError:
        raise
    except Exception as e:
        logger.warning(f"[StocksHandler] Cache check failed, falling back to API: {e}")
        df = fetch_stock_prices(ticker, start_date, effective_end_date)
        data = transform_history_to_tiingo(df, ticker)
        return PriceResult(
            data=data,
            cached=False,
            cacheHitRate=0,
            latestAvailableDate=data[-1]["date"][:10] if data else None,
        )


def handle_metadata_request(ticker: str) -> MetadataResult:
    """
    Handle symbol metadata request.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with metadata and cached flag
    """
    info = fetch_symbol_metadata(ticker)
    data = transform_info_to_metadata(info, ticker)
    return MetadataResult(data=data, cached=False)


def handle_stocks_request(event: ApiGatewayEvent) -> ApiGatewayResponse:
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
        result: MetadataResult | PriceResult
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
                    "latestAvailableDate": result.get("latestAvailableDate"),
                    "timestamp": datetime.now().isoformat() + "Z",
                }
            },
        )

    except APIError as e:
        return error_response(e.message, e.status_code)
    except Exception as e:
        logger.error(f"[StocksHandler] Unhandled error: {e}", exc_info=True)
        return error_response("Internal server error", 500)
