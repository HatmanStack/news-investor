"""
ETF holdings endpoint handler.
Handles GET /etf-holdings requests.
"""

import os
import re
from typing import Any

from services.etf_holdings_service import get_etf_holdings
from utils.logger import get_structured_logger
from utils.response import error_response, success_response

_ETF_PATTERN = re.compile(r"^[A-Z]{1,6}$")

logger = get_structured_logger(__name__)

_dynamodb = None


def _get_table():
    """Get DynamoDB table resource (lazy initialization)."""
    global _dynamodb
    if _dynamodb is None:
        import boto3

        endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
        kwargs = {"endpoint_url": endpoint_url} if endpoint_url else {}
        _dynamodb = boto3.resource("dynamodb", **kwargs)

    table_name = os.environ.get("DYNAMODB_TABLE_NAME")
    if not table_name:
        raise RuntimeError("DYNAMODB_TABLE_NAME environment variable not set")
    return _dynamodb.Table(table_name)


def handle_etf_holdings(event: dict[str, Any]) -> dict[str, Any]:
    """GET /etf-holdings?etf=XLK"""
    query_params = event.get("queryStringParameters") or {}
    etf = query_params.get("etf", "").upper().strip()

    if not etf:
        return error_response("etf query parameter is required", 400)

    if not _ETF_PATTERN.match(etf):
        return error_response("Invalid ETF ticker format", 400)

    try:
        table = _get_table()
        holdings = get_etf_holdings(etf, table)
        return success_response({"etf": etf, "holdings": holdings})

    except Exception as e:
        logger.error(f"Error fetching ETF holdings for {etf}: {e}", exc_info=True)
        return error_response("Failed to fetch ETF holdings", 500)
