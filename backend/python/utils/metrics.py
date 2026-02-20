"""
CloudWatch Embedded Metrics Format (EMF) Utility for Python Lambda

Provides functions to log custom metrics to CloudWatch using EMF.
Lambda automatically parses EMF JSON from print() and creates metrics.

See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
"""

import json
import time
from enum import StrEnum
from typing import Any


class MetricUnit(StrEnum):
    """Metric units supported by CloudWatch (pruned to used values)."""

    MILLISECONDS = "Milliseconds"
    PERCENT = "Percent"
    COUNT = "Count"
    NONE = "None"


NAMESPACE = "ReactStocks"


def log_metric(
    name: str,
    value: float,
    unit: MetricUnit = MetricUnit.NONE,
    dimensions: dict[str, str] | None = None,
) -> None:
    """
    Log a metric to CloudWatch using EMF format.

    Args:
        name: Metric name (e.g., 'CacheHitRate')
        value: Metric value (e.g., 95.5)
        unit: Metric unit (e.g., MetricUnit.PERCENT)
        dimensions: Key-value pairs for filtering
            (e.g., {'Endpoint': 'stocks', 'Ticker': 'AAPL'})

    Example:
        >>> log_metric('CacheHitRate', 95.5, MetricUnit.PERCENT,
        ...            {'Endpoint': 'stocks', 'Ticker': 'AAPL'})
    """
    dimensions = dimensions or {}
    timestamp = int(time.time() * 1000)

    emf: dict[str, Any] = {
        "_aws": {
            "Timestamp": timestamp,
            "CloudWatchMetrics": [
                {
                    "Namespace": NAMESPACE,
                    "Dimensions": [list(dimensions.keys())] if dimensions else [[]],
                    "Metrics": [
                        {
                            "Name": name,
                            "Unit": unit.value,
                        }
                    ],
                }
            ],
        },
        name: value,
    }

    # Add dimension values
    emf.update(dimensions)

    # Output as JSON to be parsed by Lambda
    print(json.dumps(emf))


def log_metrics(
    metrics: list[dict[str, Any]],
    dimensions: dict[str, str] | None = None,
) -> None:
    """
    Log multiple metrics in a single EMF entry.
    More efficient than multiple log_metric calls.

    Args:
        metrics: List of metric definitions with 'name', 'value', and optional 'unit'
        dimensions: Shared dimensions for all metrics

    Example:
        log_metrics([
            {'name': 'CacheHitRate', 'value': 95.5, 'unit': MetricUnit.PERCENT},
            {'name': 'RequestDuration', 'value': 150, 'unit': MetricUnit.MILLISECONDS}
        ], {'Endpoint': 'stocks', 'Ticker': 'AAPL'})
    """
    dimensions = dimensions or {}
    timestamp = int(time.time() * 1000)

    emf: dict[str, Any] = {
        "_aws": {
            "Timestamp": timestamp,
            "CloudWatchMetrics": [
                {
                    "Namespace": NAMESPACE,
                    "Dimensions": [list(dimensions.keys())] if dimensions else [[]],
                    "Metrics": [
                        {
                            "Name": m["name"],
                            "Unit": m.get("unit", MetricUnit.NONE).value
                            if isinstance(m.get("unit"), MetricUnit)
                            else m.get("unit", "None"),
                        }
                        for m in metrics
                    ],
                }
            ],
        },
    }

    # Add metric values
    for m in metrics:
        emf[m["name"]] = m["value"]

    # Add dimension values
    emf.update(dimensions)

    print(json.dumps(emf))


def log_lambda_start_status(is_cold_start: bool, endpoint: str) -> None:
    """Log Lambda cold/warm start status."""
    metric_name = "LambdaColdStart" if is_cold_start else "LambdaWarmStart"
    log_metric(metric_name, 1, MetricUnit.COUNT, {"Endpoint": endpoint})


def log_request_metrics(
    endpoint: str,
    status_code: int,
    duration_ms: float,
    cached: bool = False,
) -> None:
    """
    Log request metrics for handler responses.

    Args:
        endpoint: API endpoint path
        status_code: HTTP status code
        duration_ms: Request duration in milliseconds
        cached: Whether response was served from cache
    """
    success = 200 <= status_code < 400

    metrics: list[dict[str, Any]] = [
        {
            "name": "RequestDuration",
            "value": duration_ms,
            "unit": MetricUnit.MILLISECONDS,
        },
        {"name": "RequestCount", "value": 1, "unit": MetricUnit.COUNT},
    ]

    if success:
        metrics.append({"name": "RequestSuccess", "value": 1, "unit": MetricUnit.COUNT})
    else:
        metrics.append({"name": "RequestError", "value": 1, "unit": MetricUnit.COUNT})

    log_metrics(
        metrics,
        {
            "Endpoint": endpoint,
            "StatusCode": str(status_code),
            "Cached": "true" if cached else "false",
        },
    )
