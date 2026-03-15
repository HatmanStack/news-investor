/**
 * Branded Types for Compile-Time Safety
 *
 * Prevents accidentally passing raw strings where validated
 * tickers or date strings are expected.
 */

declare const TickerBrand: unique symbol;

/** A validated, uppercase ticker symbol (e.g. "AAPL", "BRK.A") */
export type Ticker = string & { readonly [TickerBrand]: typeof TickerBrand };
