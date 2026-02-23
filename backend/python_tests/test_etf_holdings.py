from constants.etf_holdings import ETF_TOP_HOLDINGS


def test_all_sectors_have_holdings():
    assert len(ETF_TOP_HOLDINGS) == 11


def test_each_etf_has_10_holdings():
    for etf, holdings in ETF_TOP_HOLDINGS.items():
        assert len(holdings) == 10, f"{etf} has {len(holdings)} holdings"


def test_holdings_are_uppercase():
    for etf, holdings in ETF_TOP_HOLDINGS.items():
        for ticker in holdings:
            assert ticker == ticker.upper(), f"{ticker} in {etf} is not uppercase"


def test_no_duplicate_tickers_within_etf():
    for etf, holdings in ETF_TOP_HOLDINGS.items():
        assert len(holdings) == len(set(holdings)), f"{etf} has duplicate tickers"
