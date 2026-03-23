"""
Lightweight in-memory circuit breaker for Lambda functions.

Uses a simple counter-based approach appropriate for ephemeral Lambda containers.
State is per-container and resets on container recycle.

See Phase-0 ADR-005 for design rationale.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """In-memory circuit breaker with configurable threshold and cooldown."""

    def __init__(
        self,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60,
        name: str = "default",
    ) -> None:
        self._failure_threshold = failure_threshold
        self._cooldown_seconds = cooldown_seconds
        self._name = name
        self._consecutive_failures = 0
        self._open_until: float = 0

    def is_open(self) -> bool:
        """Return True if the circuit is open (rejecting requests)."""
        if self._consecutive_failures >= self._failure_threshold:
            if time.monotonic() < self._open_until:
                return True
            # Cooldown expired — half-open state handled by allow_request
        return False

    def is_closed(self) -> bool:
        """Return True if the circuit is closed (allowing requests)."""
        return not self.is_open()

    def allow_request(self) -> bool:
        """Check whether a request should proceed.

        Returns True if the circuit is closed or if the cooldown has expired
        (half-open probe). Returns False if the circuit is open.
        """
        if self._consecutive_failures < self._failure_threshold:
            return True

        now = time.monotonic()
        if now >= self._open_until:
            logger.info("[CircuitBreaker:%s] Cooldown expired, allowing probe request", self._name)
            return True

        return False

    def record_success(self) -> None:
        """Record a successful call — resets consecutive failure count."""
        if self._consecutive_failures > 0:
            logger.info("[CircuitBreaker:%s] Circuit closed after successful call", self._name)
        self._consecutive_failures = 0
        self._open_until = 0

    def record_failure(self) -> None:
        """Record a failed call — may open the circuit."""
        self._consecutive_failures += 1
        if self._consecutive_failures >= self._failure_threshold:
            self._open_until = time.monotonic() + self._cooldown_seconds
            logger.warning(
                "[CircuitBreaker:%s] Circuit opened after %d consecutive failures, cooldown %.0fs",
                self._name,
                self._consecutive_failures,
                self._cooldown_seconds,
            )
