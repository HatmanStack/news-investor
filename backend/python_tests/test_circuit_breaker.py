"""Tests for the circuit breaker utility."""

from __future__ import annotations

import time

from utils.circuit_breaker import CircuitBreaker


class TestCircuitBreaker:
    """Tests for CircuitBreaker."""

    def test_initial_state_is_closed(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        assert cb.is_closed()
        assert not cb.is_open()

    def test_allows_calls_when_closed(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        assert cb.allow_request()

    def test_opens_after_threshold_failures(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        cb.record_failure()
        cb.record_failure()
        assert cb.is_closed()
        cb.record_failure()
        assert cb.is_open()

    def test_rejects_calls_when_open(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        for _ in range(3):
            cb.record_failure()
        assert not cb.allow_request()

    def test_success_resets_failure_count(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb._consecutive_failures == 0
        assert cb.is_closed()

    def test_allows_probe_after_cooldown(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=0.1)
        for _ in range(3):
            cb.record_failure()
        assert cb.is_open()
        time.sleep(0.15)
        # After cooldown, should allow one probe request
        assert cb.allow_request()

    def test_closes_after_successful_probe(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=0.1)
        for _ in range(3):
            cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # probe
        cb.record_success()
        assert cb.is_closed()
        assert cb.allow_request()

    def test_reopens_after_failed_probe(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=0.1)
        for _ in range(3):
            cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # probe
        cb.record_failure()  # probe failed
        assert cb.is_open()
