from unittest.mock import MagicMock, patch
import time

from services.etf_holdings_service import get_etf_holdings


def test_returns_cached_holdings():
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {
            "pk": "ETF#XLK",
            "sk": "HOLDINGS",
            "holdings": '["AAPL","MSFT"]',
            "ttl": int(time.time()) + 99999,
        }
    }
    result = get_etf_holdings("XLK", mock_table)
    assert result == ["AAPL", "MSFT"]


def test_expired_cache_is_ignored():
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {
            "pk": "ETF#XLK",
            "sk": "HOLDINGS",
            "holdings": '["OLD"]',
            "ttl": int(time.time()) - 100,
        }
    }
    # Will fall through to yfinance, which we mock to return empty
    with patch("services.etf_holdings_service._fetch_from_yfinance") as mock_fetch:
        mock_fetch.return_value = []
        result = get_etf_holdings("XLK", mock_table)
    assert len(result) == 10
    assert "AAPL" in result


@patch("services.etf_holdings_service._fetch_from_yfinance")
def test_falls_back_to_static(mock_fetch):
    mock_fetch.return_value = []
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}

    result = get_etf_holdings("XLK", mock_table)
    assert len(result) == 10
    assert "AAPL" in result


@patch("services.etf_holdings_service._fetch_from_yfinance")
def test_unknown_etf_returns_empty(mock_fetch):
    mock_fetch.return_value = []
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}

    result = get_etf_holdings("UNKNOWN", mock_table)
    assert result == []


@patch("services.etf_holdings_service._fetch_from_yfinance")
def test_caches_after_yfinance_success(mock_fetch):
    mock_fetch.return_value = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}

    result = get_etf_holdings("XLK", mock_table)
    assert result == ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    mock_table.put_item.assert_called_once()


@patch("services.etf_holdings_service._fetch_from_yfinance")
def test_ignores_yfinance_with_fewer_than_5_results(mock_fetch):
    mock_fetch.return_value = ["A", "B"]
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}

    result = get_etf_holdings("XLK", mock_table)
    assert len(result) == 10  # Falls back to static
