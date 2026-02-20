"""
Structured Logger Utility for Python Lambda

Provides JSON-formatted logging with correlation ID propagation.
Uses contextvars for request context across async operations.
"""

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# Context variable for correlation ID propagation
_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)
_request_path: ContextVar[str | None] = ContextVar("request_path", default=None)
_request_method: ContextVar[str | None] = ContextVar("request_method", default=None)


def set_request_context(
    correlation_id: str | None = None,
    path: str | None = None,
    method: str | None = None,
) -> None:
    """
    Set request context for structured logging.

    Args:
        correlation_id: API Gateway request ID
        path: Request path
        method: HTTP method
    """
    if correlation_id:
        _correlation_id.set(correlation_id)
    if path:
        _request_path.set(path)
    if method:
        _request_method.set(method)


def clear_request_context() -> None:
    """Clear request context (call at end of request)."""
    _correlation_id.set(None)
    _request_path.set(None)
    _request_method.set(None)


def get_xray_trace_id() -> str | None:
    """
    Extract X-Ray trace ID from Lambda environment.

    Returns:
        X-Ray trace ID or None if not available
    """
    trace_header = os.environ.get("_X_AMZN_TRACE_ID")
    if not trace_header:
        return None

    # Parse "Root=1-xxx;Parent=xxx;Sampled=1" format
    for part in trace_header.split(";"):
        if part.startswith("Root="):
            return part[5:]
    return None


class StructuredLogFormatter(logging.Formatter):
    """
    JSON formatter for structured CloudWatch logs.

    Outputs JSON with timestamp, level, message, correlationId, and custom fields.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "logger": record.name,
        }

        # Add correlation ID from context
        correlation_id = _correlation_id.get()
        if correlation_id:
            log_entry["correlationId"] = correlation_id

        # Add request context
        path = _request_path.get()
        if path:
            log_entry["path"] = path

        method = _request_method.get()
        if method:
            log_entry["method"] = method

        # Add X-Ray trace ID
        xray_trace_id = get_xray_trace_id()
        if xray_trace_id:
            log_entry["xrayTraceId"] = xray_trace_id

        # Add exception info if present
        if record.exc_info:
            log_entry["errorName"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            log_entry["errorMessage"] = str(record.exc_info[1]) if record.exc_info[1] else None
            log_entry["errorStack"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "extra_data") and record.extra_data:
            log_entry.update(record.extra_data)

        return json.dumps(log_entry, default=str)


class StructuredLogger:
    """
    Structured logger wrapper with extra data support.

    Usage:
        logger = get_structured_logger(__name__)
        logger.info("Processing request", ticker="AAPL", count=5)
    """

    def __init__(self, name: str):
        """Initialize structured logger."""
        self._logger = logging.getLogger(name)
        self._setup_handler()

    def _setup_handler(self) -> None:
        """Configure logger with structured formatter."""
        # Only configure if not already set up
        if not self._logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(StructuredLogFormatter())
            self._logger.addHandler(handler)

            # Set level from environment (default: INFO)
            log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
            self._logger.setLevel(getattr(logging, log_level, logging.INFO))

    def _log(self, level: int, message: str, **kwargs: Any) -> None:
        """Log message with extra data."""
        # Create log record with extra data
        record = self._logger.makeRecord(
            self._logger.name,
            level,
            "(unknown file)",
            0,
            message,
            (),
            None,
        )
        record.extra_data = kwargs if kwargs else None
        self._logger.handle(record)

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message."""
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message."""
        self._log(logging.INFO, message, **kwargs)

    def warn(self, message: str, **kwargs: Any) -> None:
        """Log warning message."""
        self._log(logging.WARNING, message, **kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message (alias for warn)."""
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, exc_info: bool = False, **kwargs: Any) -> None:
        """
        Log error message.

        Args:
            message: Error message
            exc_info: Include exception info (default: False)
            **kwargs: Additional fields to include
        """
        if exc_info:
            # Log with exception info but also include extra fields
            record = self._logger.makeRecord(
                self._logger.name,
                logging.ERROR,
                "(unknown file)",
                0,
                message,
                (),
                sys.exc_info(),
            )
            record.extra_data = kwargs if kwargs else None
            self._logger.handle(record)
        else:
            self._log(logging.ERROR, message, **kwargs)


# Module-level logger cache
_loggers: dict[str, StructuredLogger] = {}


def get_structured_logger(name: str) -> StructuredLogger:
    """
    Get or create a structured logger.

    Args:
        name: Logger name (typically __name__)

    Returns:
        StructuredLogger instance
    """
    if name not in _loggers:
        _loggers[name] = StructuredLogger(name)
    return _loggers[name]
