"""
Data transformation utilities.
Converts yfinance data format to Tiingo API format for response compatibility.
"""

from typing import Any


def transform_history_to_tiingo(df: Any, ticker: str) -> list[dict[str, Any]]:
    """
    Transform yfinance history DataFrame to Tiingo price format.

    Args:
        df: yfinance history DataFrame with columns:
            Open, High, Low, Close, Volume, Dividends, Stock Splits
            Index is DatetimeIndex
        ticker: Stock ticker symbol

    Returns:
        List of price records in Tiingo format:
        [{"date": "2024-01-15T00:00:00.000Z", "open": 150.0, ...}, ...]
    """
    if df.empty:
        return []

    result = []
    for idx, row in df.iterrows():
        # Convert index (Timestamp) to ISO 8601 string
        date_str = idx.strftime("%Y-%m-%dT00:00:00.000Z")

        # Calculate adjustment ratio from Close to Adj Close
        close = row.get("Close", 0)
        adj_close = row.get("Adj Close", close)
        adj_ratio = adj_close / close if close != 0 else 1.0

        # Get raw OHLC values
        open_price = float(row.get("Open", 0))
        high_price = float(row.get("High", 0))
        low_price = float(row.get("Low", 0))
        close_price = float(row.get("Close", 0))
        volume = int(row.get("Volume", 0))

        # Calculate adjusted values using the ratio
        # Note: yfinance only provides Adj Close, so we derive others
        adj_open = round(open_price * adj_ratio, 4)
        adj_high = round(high_price * adj_ratio, 4)
        adj_low = round(low_price * adj_ratio, 4)

        record = {
            "date": date_str,
            "open": round(open_price, 4),
            "high": round(high_price, 4),
            "low": round(low_price, 4),
            "close": round(close_price, 4),
            "volume": volume,
            "adjOpen": adj_open,
            "adjHigh": adj_high,
            "adjLow": adj_low,
            "adjClose": round(float(adj_close), 4),
            "adjVolume": volume,  # yfinance doesn't provide adj volume
            "divCash": round(float(row.get("Dividends", 0)), 4),
            "splitFactor": round(float(row.get("Stock Splits", 0)), 4) or 1.0,
        }
        result.append(record)

    return result


def transform_info_to_metadata(info: dict[str, Any], ticker: str) -> dict[str, Any]:
    """
    Transform yfinance info dict to Tiingo metadata format.

    Args:
        info: yfinance ticker.info dict
        ticker: Stock ticker symbol

    Returns:
        Dict in Tiingo metadata format:
        {"ticker": "AAPL", "name": "Apple Inc.", ...}
    """
    return {
        "ticker": ticker.upper(),
        "name": info.get("shortName") or info.get("longName") or ticker,
        "exchangeCode": info.get("exchange", ""),
        "startDate": "",  # yfinance doesn't provide
        "endDate": "",  # yfinance doesn't provide
        "description": info.get("longBusinessSummary", ""),
    }


def transform_search_to_tiingo(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Transform Yahoo Finance search results to Tiingo search format.

    Args:
        results: List of Yahoo Finance search results with:
            symbol, shortname, quoteType, exchange

    Returns:
        List of results in Tiingo search format:
        [{"ticker": "AAPL", "name": "Apple Inc.", ...}, ...]
    """
    transformed = []
    for item in results:
        # Map quoteType to Tiingo assetType
        quote_type = item.get("quoteType", "EQUITY")
        asset_type_map = {
            "EQUITY": "Stock",
            "ETF": "ETF",
            "MUTUALFUND": "Mutual Fund",
            "INDEX": "Index",
            "CURRENCY": "Currency",
            "CRYPTOCURRENCY": "Cryptocurrency",
            "FUTURE": "Future",
            "OPTION": "Option",
        }
        asset_type = asset_type_map.get(quote_type, quote_type)

        transformed.append({
            "ticker": item.get("symbol", ""),
            "name": item.get("shortname") or item.get("longname", ""),
            "assetType": asset_type,
            "isActive": True,  # yfinance doesn't provide, default to true
        })

    return transformed
