"""
Search endpoint handler.
Handles GET /search requests for ticker search.
"""

from typing import Any

from services.yfinance_service import search_tickers
from utils.error import APIError
from utils.logger import get_structured_logger
from utils.response import error_response, success_response
from utils.transform import transform_search_to_tiingo
from utils.validation import MAX_QUERY_LENGTH

logger = get_structured_logger(__name__)


def handle_search_request(event: dict[str, Any]) -> dict[str, Any]:
    """
    Handle GET /search requests.

    Query parameters:
        - query: Required, search string (max 100 characters)

    Args:
        event: API Gateway event

    Returns:
        API Gateway response with search results in Tiingo format
    """
    try:
        # Parse query parameters
        params = event.get("queryStringParameters") or {}
        query = params.get("query", "").strip()

        # Validate query parameter
        if not query:
            return error_response("Missing required parameter: query", 400)

        if len(query) > MAX_QUERY_LENGTH:
            return error_response(
                f"Query too long. Maximum length is {MAX_QUERY_LENGTH} characters.",
                400,
            )

        logger.info(f"[SearchHandler] Searching for: {query}")

        # Search for tickers
        results = search_tickers(query)

        # Transform to Tiingo format
        transformed = transform_search_to_tiingo(results)

        logger.info(f"[SearchHandler] Found {len(transformed)} results for: {query}")

        return success_response(transformed)

    except APIError as e:
        return error_response(e.message, e.status_code)
    except Exception as e:
        logger.error(f"[SearchHandler] Unhandled error: {e}", exc_info=True)
        return error_response("Internal server error", 500)
