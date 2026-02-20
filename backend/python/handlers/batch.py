"""
Batch stocks endpoint handler.
Handles POST /batch/stocks requests for multiple tickers.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any

from handlers.stocks import handle_prices_request
from utils.error import APIError
from utils.logger import get_structured_logger
from utils.response import error_response
from utils.response import get_cors_headers as base_get_cors_headers
from utils.validation import DATE_PATTERN, TICKER_PATTERN

logger = get_structured_logger(__name__)

# Configuration
MAX_TICKERS = 10


def get_cors_headers() -> dict[str, str]:
    """Get CORS headers including batch limit."""
    headers = base_get_cors_headers()
    headers["X-Batch-Limit"] = str(MAX_TICKERS)
    return headers


def handle_batch_stocks_request(event: dict[str, Any]) -> dict[str, Any]:
    """
    Handle POST /batch/stocks requests.

    Request body:
        {
            "tickers": ["AAPL", "GOOGL", "MSFT"],
            "startDate": "2024-01-01",
            "endDate": "2024-12-31"
        }

    Args:
        event: API Gateway event

    Returns:
        API Gateway response with aggregated results:
        {
            "data": {"AAPL": [...], "GOOGL": [...]},
            "errors": {"INVALID": "Ticker not found"},
            "_meta": {
                "successCount": 2,
                "errorCount": 1,
                "cached": {"AAPL": true, "GOOGL": false},
                "timestamp": "..."
            }
        }
    """
    try:
        # Parse request body
        body = event.get("body", "{}")
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except json.JSONDecodeError:
                return error_response("Invalid JSON in request body", 400)

        tickers = body.get("tickers", [])
        start_date = body.get("startDate")
        end_date = body.get("endDate")

        # Validate tickers
        if not tickers:
            return error_response("Missing required field: tickers", 400)

        if not isinstance(tickers, list):
            return error_response("tickers must be an array", 400)

        if len(tickers) > MAX_TICKERS:
            return error_response(
                f"Too many tickers. Maximum is {MAX_TICKERS}.",
                400,
            )

        # Validate and normalize tickers
        normalized_tickers = []
        for ticker in tickers:
            if not isinstance(ticker, str):
                return error_response("Each ticker must be a string", 400)
            ticker = ticker.upper()
            if not TICKER_PATTERN.match(ticker):
                return error_response(
                    f"Invalid ticker format: {ticker}."
                    " Must contain only letters, numbers, dots, and hyphens.",
                    400,
                )
            normalized_tickers.append(ticker)

        # Validate dates
        if not start_date:
            return error_response("Missing required field: startDate", 400)

        if not DATE_PATTERN.match(start_date):
            return error_response("Invalid startDate format. Must be YYYY-MM-DD.", 400)

        if end_date and not DATE_PATTERN.match(end_date):
            return error_response("Invalid endDate format. Must be YYYY-MM-DD.", 400)

        if start_date and end_date and start_date > end_date:
            return error_response(
                "Invalid date range. startDate must be before or equal to endDate.",
                400,
            )

        logger.info(
            f"[BatchHandler] Processing batch request for {len(normalized_tickers)} tickers"
        )

        # Process tickers in parallel
        results: dict[str, list[Any]] = {}
        errors: dict[str, str] = {}
        cached: dict[str, bool] = {}

        def fetch_ticker(ticker: str) -> tuple[str, Any, str | None, bool]:
            """Fetch data for a single ticker."""
            try:
                result = handle_prices_request(ticker, start_date, end_date)
                return ticker, result["data"], None, result["cached"]
            except APIError as e:
                return ticker, None, e.message, False
            except Exception as e:
                logger.error(f"[BatchHandler] Error fetching {ticker}: {e}")
                return ticker, None, str(e), False

        with ThreadPoolExecutor(max_workers=min(len(normalized_tickers), 5)) as executor:
            futures = {
                executor.submit(fetch_ticker, ticker): ticker for ticker in normalized_tickers
            }

            for future in as_completed(futures):
                ticker, data, error, was_cached = future.result()
                if error:
                    errors[ticker] = error
                else:
                    results[ticker] = data
                    cached[ticker] = was_cached

        # Build response
        response_body = {
            "data": results,
            "errors": errors,
            "_meta": {
                "successCount": len(results),
                "errorCount": len(errors),
                "cached": cached,
                "timestamp": datetime.now().isoformat() + "Z",
            },
        }

        logger.info(f"[BatchHandler] Completed batch: {len(results)} success, {len(errors)} errors")

        return {
            "statusCode": 200,
            "headers": get_cors_headers(),
            "body": json.dumps(response_body),
        }

    except Exception as e:
        logger.error(f"[BatchHandler] Unhandled error: {e}", exc_info=True)
        return error_response("Internal server error", 500)
