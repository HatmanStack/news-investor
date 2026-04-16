"""Tests for data transformation utilities."""

import pandas as pd

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from utils.transform import (
    transform_finnhub_earnings,
    transform_finnhub_search_to_tiingo,
    transform_history_to_tiingo,
    transform_info_to_metadata,
    transform_search_to_tiingo,
)


class TestTransformHistoryToTiingo:
    """Tests for transform_history_to_tiingo function."""

    def test_transforms_dataframe_to_tiingo_format(self):
        """DataFrame is transformed to Tiingo price format."""
        df = pd.DataFrame(
            {
                "Open": [150.0, 151.0],
                "High": [155.0, 156.0],
                "Low": [149.0, 150.0],
                "Close": [154.0, 155.0],
                "Adj Close": [153.0, 154.0],
                "Volume": [1000000, 1100000],
                "Dividends": [0.0, 0.24],
                "Stock Splits": [0.0, 0.0],
            },
            index=pd.to_datetime(["2024-01-15", "2024-01-16"]),
        )

        result = transform_history_to_tiingo(df, "AAPL")

        assert len(result) == 2
        # Check first record
        assert result[0]["date"] == "2024-01-15T00:00:00.000Z"
        assert result[0]["open"] == 150.0
        assert result[0]["high"] == 155.0
        assert result[0]["low"] == 149.0
        assert result[0]["close"] == 154.0
        assert result[0]["volume"] == 1000000
        assert result[0]["adjClose"] == 153.0
        assert result[0]["divCash"] == 0.0
        # Check second record has dividend
        assert result[1]["divCash"] == 0.24

    def test_returns_empty_list_for_empty_dataframe(self):
        """Empty DataFrame returns empty list."""
        df = pd.DataFrame()

        result = transform_history_to_tiingo(df, "AAPL")

        assert result == []

    def test_date_format_is_iso_8601(self):
        """Date is formatted as ISO 8601 with timezone."""
        df = pd.DataFrame(
            {
                "Open": [150.0],
                "High": [155.0],
                "Low": [149.0],
                "Close": [154.0],
                "Adj Close": [154.0],
                "Volume": [1000000],
                "Dividends": [0.0],
                "Stock Splits": [0.0],
            },
            index=pd.to_datetime(["2024-01-15"]),
        )

        result = transform_history_to_tiingo(df, "AAPL")

        assert result[0]["date"] == "2024-01-15T00:00:00.000Z"

    def test_split_factor_defaults_to_one(self):
        """Split factor defaults to 1.0 when zero."""
        df = pd.DataFrame(
            {
                "Open": [150.0],
                "High": [155.0],
                "Low": [149.0],
                "Close": [154.0],
                "Adj Close": [154.0],
                "Volume": [1000000],
                "Dividends": [0.0],
                "Stock Splits": [0.0],
            },
            index=pd.to_datetime(["2024-01-15"]),
        )

        result = transform_history_to_tiingo(df, "AAPL")

        assert result[0]["splitFactor"] == 1.0


class TestTransformInfoToMetadata:
    """Tests for transform_info_to_metadata function."""

    def test_transforms_info_to_tiingo_metadata(self):
        """Info dict is transformed to Tiingo metadata format."""
        info = {
            "shortName": "Apple Inc.",
            "longName": "Apple Inc.",
            "exchange": "NMS",
            "longBusinessSummary": "Apple designs consumer electronics.",
        }

        result = transform_info_to_metadata(info, "aapl")

        assert result["ticker"] == "AAPL"
        assert result["name"] == "Apple Inc."
        assert result["exchangeCode"] == "NMS"
        assert result["description"] == "Apple designs consumer electronics."
        assert result["startDate"] == ""
        assert result["endDate"] == ""

    def test_uses_longname_fallback(self):
        """Uses longName when shortName not available."""
        info = {
            "longName": "Apple Incorporated",
            "exchange": "NMS",
        }

        result = transform_info_to_metadata(info, "AAPL")

        assert result["name"] == "Apple Incorporated"

    def test_uses_ticker_as_name_fallback(self):
        """Uses ticker when no name available."""
        info = {"exchange": "NMS"}

        result = transform_info_to_metadata(info, "AAPL")

        assert result["name"] == "AAPL"

    def test_includes_sector_and_industry_fields(self):
        """Metadata includes sector, industry, and sectorEtf fields."""
        info = {
            "shortName": "Apple Inc.",
            "exchange": "NMS",
            "sector": "Technology",
            "industry": "Consumer Electronics",
        }

        result = transform_info_to_metadata(info, "AAPL")

        assert result["sector"] == "Technology"
        assert result["industry"] == "Consumer Electronics"
        assert result["sectorEtf"] == "XLK"

    def test_sector_etf_is_none_for_unknown_sector(self):
        """sectorEtf is None when sector doesn't match GICS mapping."""
        info = {
            "shortName": "Foreign Co",
            "exchange": "LSE",
            "sector": "Unknown Sector",
            "industry": "Unknown Industry",
        }

        result = transform_info_to_metadata(info, "FRGN")

        assert result["sector"] == "Unknown Sector"
        assert result["sectorEtf"] is None

    def test_sector_defaults_to_empty_string(self):
        """Sector defaults to empty string when not in info."""
        info = {"shortName": "Test"}

        result = transform_info_to_metadata(info, "TEST")

        assert result["sector"] == ""
        assert result["industry"] == ""
        assert result["sectorEtf"] is None


class TestTransformSearchToTiingo:
    """Tests for transform_search_to_tiingo function."""

    def test_transforms_search_results_to_tiingo_format(self):
        """Search results are transformed to Tiingo format."""
        results = [
            {
                "symbol": "AAPL",
                "shortname": "Apple Inc.",
                "quoteType": "EQUITY",
                "exchange": "NMS",
            },
            {
                "symbol": "AAPD",
                "shortname": "Direxion Daily AAPL Bear 1X",
                "quoteType": "ETF",
                "exchange": "PCX",
            },
        ]

        result = transform_search_to_tiingo(results)

        assert len(result) == 2
        assert result[0]["ticker"] == "AAPL"
        assert result[0]["name"] == "Apple Inc."
        assert result[0]["assetType"] == "Stock"
        assert result[0]["isActive"] is True
        assert result[1]["assetType"] == "ETF"

    def test_maps_quote_types_correctly(self):
        """Quote types are mapped to Tiingo asset types."""
        results = [
            {"symbol": "A", "shortname": "A", "quoteType": "EQUITY"},
            {"symbol": "B", "shortname": "B", "quoteType": "ETF"},
            {"symbol": "C", "shortname": "C", "quoteType": "MUTUALFUND"},
            {"symbol": "D", "shortname": "D", "quoteType": "INDEX"},
        ]

        result = transform_search_to_tiingo(results)

        assert result[0]["assetType"] == "Stock"
        assert result[1]["assetType"] == "ETF"
        assert result[2]["assetType"] == "Mutual Fund"
        assert result[3]["assetType"] == "Index"

    def test_returns_empty_list_for_empty_results(self):
        """Empty results return empty list."""
        result = transform_search_to_tiingo([])

        assert result == []

    def test_is_active_defaults_to_true(self):
        """isActive defaults to True."""
        results = [{"symbol": "AAPL", "shortname": "Apple", "quoteType": "EQUITY"}]

        result = transform_search_to_tiingo(results)

        assert result[0]["isActive"] is True


class TestTransformFinnhubSearchToTiingo:
    """Tests for transform_finnhub_search_to_tiingo function."""

    def test_maps_finnhub_fields_to_search_result(self):
        """Finnhub fields are mapped to SearchResult format."""
        results = [
            {
                "description": "Apple Inc.",
                "displaySymbol": "AAPL",
                "symbol": "AAPL",
                "type": "Common Stock",
            },
        ]

        result = transform_finnhub_search_to_tiingo(results)

        assert len(result) == 1
        assert result[0]["ticker"] == "AAPL"
        assert result[0]["name"] == "Apple Inc."
        assert result[0]["assetType"] == "Stock"
        assert result[0]["isActive"] is True

    def test_maps_common_stock_to_stock(self):
        """'Common Stock' maps to 'Stock'."""
        results = [{"symbol": "A", "description": "A", "type": "Common Stock"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "Stock"

    def test_maps_adr_to_stock(self):
        """'ADR' maps to 'Stock'."""
        results = [{"symbol": "A", "description": "A", "type": "ADR"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "Stock"

    def test_maps_etp_to_etf(self):
        """'ETP' maps to 'ETF'."""
        results = [{"symbol": "A", "description": "A", "type": "ETP"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "ETF"

    def test_maps_reit_to_stock(self):
        """'REIT' maps to 'Stock'."""
        results = [{"symbol": "A", "description": "A", "type": "REIT"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "Stock"

    def test_maps_unit_to_stock(self):
        """'Unit' maps to 'Stock'."""
        results = [{"symbol": "A", "description": "A", "type": "Unit"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "Stock"

    def test_unknown_type_uses_raw_value(self):
        """Unknown type falls back to raw Finnhub value."""
        results = [{"symbol": "A", "description": "A", "type": "Warrant"}]
        result = transform_finnhub_search_to_tiingo(results)
        assert result[0]["assetType"] == "Warrant"

    def test_returns_empty_list_for_empty_results(self):
        """Empty results return empty list."""
        result = transform_finnhub_search_to_tiingo([])
        assert result == []


class TestTransformFinnhubEarnings:
    """Tests for transform_finnhub_earnings function."""

    def test_maps_finnhub_fields_to_earnings_event(self):
        """Finnhub fields are mapped to EarningsEvent format."""
        items = [
            {
                "date": "2026-04-25",
                "epsActual": None,
                "epsEstimate": 2.35,
                "hour": "amc",
                "quarter": 2,
                "revenueActual": None,
                "revenueEstimate": 94500000000,
                "symbol": "AAPL",
                "year": 2026,
            }
        ]

        result = transform_finnhub_earnings(items)

        assert len(result) == 1
        assert result[0]["earningsDate"] == "2026-04-25"
        assert result[0]["earningsHour"] == "AMC"
        assert result[0]["epsEstimate"] == 2.35
        assert result[0]["revenueEstimate"] == 94500000000

    def test_maps_bmo_to_uppercase(self):
        """'bmo' maps to 'BMO'."""
        items = [{"date": "2026-04-25", "hour": "bmo"}]
        result = transform_finnhub_earnings(items)
        assert result[0]["earningsHour"] == "BMO"

    def test_maps_amc_to_uppercase(self):
        """'amc' maps to 'AMC'."""
        items = [{"date": "2026-04-25", "hour": "amc"}]
        result = transform_finnhub_earnings(items)
        assert result[0]["earningsHour"] == "AMC"

    def test_maps_empty_hour_to_tns(self):
        """Empty string hour maps to 'TNS'."""
        items = [{"date": "2026-04-25", "hour": ""}]
        result = transform_finnhub_earnings(items)
        assert result[0]["earningsHour"] == "TNS"

    def test_null_estimates_pass_through(self):
        """Null epsEstimate and revenueEstimate are excluded."""
        items = [
            {
                "date": "2026-04-25",
                "hour": "amc",
                "epsEstimate": None,
                "revenueEstimate": None,
            }
        ]
        result = transform_finnhub_earnings(items)
        assert "epsEstimate" not in result[0]
        assert "revenueEstimate" not in result[0]

    def test_returns_empty_list_for_empty_input(self):
        """Empty input returns empty list."""
        result = transform_finnhub_earnings([])
        assert result == []
