"""
Lambda entry point for yfinance stock data service.
Routes requests to appropriate handlers based on path and method.
"""

import time
from typing import Any

from utils.logger import (
    clear_request_context,
    get_structured_logger,
    set_request_context,
)
from utils.metrics import log_lambda_start_status, log_request_metrics

logger = get_structured_logger(__name__)

# Track cold start - only the first invocation is a cold start
_is_first_invocation = True


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda handler - routes requests to appropriate handler functions.

    Args:
        event: API Gateway event (format version 2.0)
        context: Lambda context

    Returns:
        API Gateway response
    """
    global _is_first_invocation

    # Import handlers here to avoid circular imports and improve cold start
    from handlers.batch import handle_batch_stocks_request
    from handlers.earnings import handle_batch_earnings_request, handle_earnings_request
    from handlers.etf_holdings import handle_etf_holdings
    from handlers.search import handle_search_request
    from handlers.stocks import handle_stocks_request
    from utils.response import error_response

    # Extract path and method from event
    raw_path = event.get("rawPath", "")
    request_context = event.get("requestContext", {})
    http_info = request_context.get("http", {})
    method = http_info.get("method", "GET")
    request_id = request_context.get("requestId", "")
    start_time = time.time()

    # Cold Start Detection - only first invocation per container is cold
    is_cold_start = _is_first_invocation
    _is_first_invocation = False
    log_lambda_start_status(is_cold_start, raw_path)

    # Set request context for structured logging
    set_request_context(correlation_id=request_id, path=raw_path, method=method)

    try:
        logger.info("Incoming request", isColdStart=is_cold_start)

        response: dict[str, Any]

        # Route to appropriate handler
        if raw_path == "/stocks" and method == "GET":
            response = handle_stocks_request(event)

        elif raw_path == "/search" and method == "GET":
            response = handle_search_request(event)

        elif raw_path == "/batch/stocks" and method == "POST":
            response = handle_batch_stocks_request(event)

        elif raw_path == "/earnings" and method == "GET":
            response = handle_earnings_request(event)

        elif raw_path == "/batch/earnings" and method == "POST":
            response = handle_batch_earnings_request(event)

        elif raw_path == "/etf-holdings" and method == "GET":
            response = handle_etf_holdings(event)

        else:
            logger.warning("Unknown route", path=raw_path)
            response = error_response(f"Not found: {method} {raw_path}", 404)

        # Log request metrics
        duration_ms = (time.time() - start_time) * 1000
        log_request_metrics(raw_path, response.get("statusCode", 500), duration_ms)

        return response

    except Exception as e:
        logger.error(f"Unhandled error: {e}", exc_info=True)
        duration_ms = (time.time() - start_time) * 1000
        log_request_metrics(raw_path, 500, duration_ms)
        return error_response("Internal server error", 500)

    finally:
        # Clear request context
        clear_request_context()
