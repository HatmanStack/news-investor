/**
 * Branded Types for Compile-Time Safety
 *
 * Prevents accidentally passing raw strings where validated
 * tickers or date strings are expected.
 */

declare const TickerBrand: unique symbol;
declare const DateStringBrand: unique symbol;

/** A validated, uppercase ticker symbol (e.g. "AAPL", "BRK.A") */
export type Ticker = string & { readonly [TickerBrand]: typeof TickerBrand };

/** A validated date in YYYY-MM-DD format */
export type DateString = string & { readonly [DateStringBrand]: typeof DateStringBrand };
