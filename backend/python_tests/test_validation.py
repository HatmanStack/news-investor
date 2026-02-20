"""Tests for validation utility functions."""

import sys
import os

import pytest

# Ensure the python source is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from utils.validation import (
    TICKER_PATTERN,
    DATE_PATTERN,
    MAX_QUERY_LENGTH,
    validate_ticker,
    validate_date,
)


class TestTickerPattern:
    """Tests for TICKER_PATTERN regex."""

    @pytest.mark.parametrize("ticker", ["AAPL", "BRK.B", "BF-B", "X", "123"])
    def test_matches_valid_tickers(self, ticker):
        """Matches valid ticker symbols."""
        assert TICKER_PATTERN.match(ticker) is not None

    @pytest.mark.parametrize("ticker", ["aapl", "AA PL", "", "AAPL!", "AAPL@"])
    def test_rejects_invalid_tickers(self, ticker):
        """Rejects invalid ticker symbols."""
        assert TICKER_PATTERN.match(ticker) is None


class TestDatePattern:
    """Tests for DATE_PATTERN regex."""

    @pytest.mark.parametrize("date", ["2025-01-15", "2000-12-31"])
    def test_matches_valid_dates(self, date):
        """Matches valid YYYY-MM-DD date strings."""
        assert DATE_PATTERN.match(date) is not None

    @pytest.mark.parametrize("date", ["2025/01/15", "25-01-15", "2025-1-5", "not-a-date", ""])
    def test_rejects_invalid_dates(self, date):
        """Rejects invalid date strings."""
        assert DATE_PATTERN.match(date) is None


class TestValidateTicker:
    """Tests for validate_ticker function."""

    def test_normalizes_to_uppercase(self):
        """Normalizes lowercase ticker to uppercase."""
        assert validate_ticker("aapl") == "AAPL"

    def test_strips_whitespace(self):
        """Strips leading and trailing whitespace."""
        assert validate_ticker(" AAPL ") == "AAPL"

    def test_returns_none_for_empty_string(self):
        """Returns None for empty string input."""
        assert validate_ticker("") is None

    def test_returns_none_for_invalid_characters(self):
        """Returns None when ticker contains spaces or special characters."""
        assert validate_ticker("AA PL") is None

    def test_accepts_dotted_tickers(self):
        """Accepts and normalizes dotted tickers like BRK.B."""
        assert validate_ticker("brk.b") == "BRK.B"

    def test_accepts_hyphenated_tickers(self):
        """Accepts and normalizes hyphenated tickers like BF-B."""
        assert validate_ticker("bf-b") == "BF-B"


class TestValidateDate:
    """Tests for validate_date function."""

    def test_returns_valid_date_string(self):
        """Returns the date string when format is valid."""
        assert validate_date("2025-01-15") == "2025-01-15"

    def test_returns_none_for_none_input(self):
        """Returns None when input is None."""
        assert validate_date(None) is None

    def test_returns_none_for_empty_string(self):
        """Returns None for empty string input."""
        assert validate_date("") is None

    def test_returns_none_for_wrong_format(self):
        """Returns None for non-ISO date format."""
        assert validate_date("01/15/2025") is None

    def test_returns_none_for_partial_date(self):
        """Returns None for date with single-digit month or day."""
        assert validate_date("2025-1-5") is None


class TestMaxQueryLength:
    """Tests for MAX_QUERY_LENGTH constant."""

    def test_equals_100(self):
        """MAX_QUERY_LENGTH is 100."""
        assert MAX_QUERY_LENGTH == 100
