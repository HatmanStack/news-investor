"""
Static fallback mapping of top 10 holdings per SPDR sector ETF.
Used when yfinance fails to return ETF holdings data.
Updated manually on major index rebalances.
"""

ETF_TOP_HOLDINGS: dict[str, list[str]] = {
    "XLK": ["AAPL", "MSFT", "NVDA", "AVGO", "CRM", "ADBE", "AMD", "CSCO", "ACN", "ORCL"],
    "XLF": ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "SPGI", "AXP"],
    "XLE": ["XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "PXD", "VLO", "OXY"],
    "XLV": ["UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "AMGN"],
    "XLI": ["GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT", "UPS", "ADP"],
    "XLC": ["META", "GOOGL", "GOOG", "NFLX", "T", "CMCSA", "DIS", "TMUS", "VZ", "EA"],
    "XLY": ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "CMG"],
    "XLP": ["PG", "PEP", "KO", "COST", "WMT", "PM", "MDLZ", "CL", "MO", "GIS"],
    "XLU": ["NEE", "SO", "DUK", "SRE", "AEP", "D", "EXC", "XEL", "PCG", "ED"],
    "XLRE": ["PLD", "AMT", "EQIX", "SPG", "CCI", "O", "PSA", "DLR", "WELL", "VICI"],
    "XLB": ["LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "DD", "DOW", "VMC"],
}
