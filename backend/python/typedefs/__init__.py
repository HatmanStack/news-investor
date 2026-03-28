"""
Shared type definitions for the Python Lambda.

TypedDicts replace dict[str, Any] in handler and service function signatures
for improved type safety and documentation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol, TypedDict

# ---------------------------------------------------------------------------
# API Gateway types
# ---------------------------------------------------------------------------


class HttpInfo(TypedDict, total=False):
    """HTTP info from API Gateway request context."""

    method: str


class RequestContext(TypedDict, total=False):
    """API Gateway request context."""

    http: HttpInfo
    requestId: str


class ApiGatewayEvent(TypedDict, total=False):
    """API Gateway v2 event (subset of fields used by handlers)."""

    rawPath: str
    requestContext: RequestContext
    queryStringParameters: dict[str, str] | None
    body: str | None


class ApiGatewayResponse(TypedDict):
    """API Gateway response."""

    statusCode: int
    headers: dict[str, str]
    body: str


class LambdaContext(Protocol):
    """AWS Lambda context object (subset of fields provided at runtime)."""

    function_name: str
    memory_limit_in_mb: int
    invoked_function_arn: str
    aws_request_id: str


# ---------------------------------------------------------------------------
# Stock data types
# ---------------------------------------------------------------------------


class PriceRecord(TypedDict):
    """Single price record in Tiingo format."""

    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    adjOpen: float
    adjHigh: float
    adjLow: float
    adjClose: float
    adjVolume: int
    divCash: float
    splitFactor: float


class StockMetadata(TypedDict, total=False):
    """Stock metadata in Tiingo format."""

    ticker: str
    name: str
    exchangeCode: str
    startDate: str
    endDate: str
    description: str
    sector: str
    industry: str
    sectorEtf: str | None


class PriceResult(TypedDict):
    """Result from handle_prices_request."""

    data: list[PriceRecord]
    cached: bool
    cacheHitRate: float


class MetadataResult(TypedDict):
    """Result from handle_metadata_request."""

    data: StockMetadata
    cached: bool


# ---------------------------------------------------------------------------
# Search types
# ---------------------------------------------------------------------------


class SearchResult(TypedDict, total=False):
    """Single search result in Tiingo format."""

    ticker: str
    name: str
    assetType: str
    isActive: bool


class YahooSearchQuote(TypedDict, total=False):
    """Raw Yahoo Finance search result."""

    symbol: str
    shortname: str
    longname: str
    quoteType: str
    exchange: str


# ---------------------------------------------------------------------------
# Earnings types
# ---------------------------------------------------------------------------


class EarningsEvent(TypedDict, total=False):
    """Single earnings event."""

    earningsDate: str
    earningsHour: str
    epsEstimate: float
    revenueEstimate: float


# fmt: off
# Functional TypedDict syntax required because yfinance uses keys with spaces.
EarningsCalendar = TypedDict(
    "EarningsCalendar",
    {
        "Earnings Date": "list[datetime] | datetime | None",
        "Earnings Average": float,
        "Earnings Low": float,
        "Revenue Average": float,
        "Revenue Low": float,
    },
    total=False,
)
# fmt: on


class YahooInfo(TypedDict, total=False):
    """yfinance Ticker.info dict (subset of known keys)."""

    shortName: str
    longName: str
    exchange: str
    longBusinessSummary: str
    sector: str
    industry: str
    regularMarketPrice: float


# ---------------------------------------------------------------------------
# Cache item types
# ---------------------------------------------------------------------------


class StockCacheItem(TypedDict, total=False):
    """DynamoDB stock price cache item."""

    pk: str
    sk: str
    ticker: str
    date: str
    priceData: PriceRecord
    metadata: StockMetadata
    ttl: int
    fetchedAt: int


class EarningsCacheItem(TypedDict, total=False):
    """DynamoDB earnings cache item."""

    pk: str
    sk: str
    entityType: str
    ticker: str
    ttl: int
    earningsDate: str
    earningsHour: str
    epsEstimate: float
    revenueEstimate: float
    createdAt: str
    updatedAt: str


# ---------------------------------------------------------------------------
# Metric types
# ---------------------------------------------------------------------------


class MetricDefinition(TypedDict, total=False):
    """A metric entry for log_metrics."""

    name: str
    value: float
    unit: str
