"""Static mapping of GICS sector names to SPDR sector ETF tickers."""

SECTOR_TO_ETF: dict[str, str] = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Energy": "XLE",
    "Healthcare": "XLV",
    "Industrials": "XLI",
    "Communication Services": "XLC",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Basic Materials": "XLB",
}

ETF_TO_SECTOR: dict[str, str] = {v: k for k, v in SECTOR_TO_ETF.items()}

ALL_SECTOR_ETFS: list[str] = list(SECTOR_TO_ETF.values())
