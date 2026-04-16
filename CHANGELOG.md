# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Features marked with **[Pro]** are available in the pro edition only and are excluded from the community sync.

## [Unreleased]

## [2.14.0] - 2026-04-16

### Added

- **[Pro]** Self-hosted Reddit social sentiment pipeline: Reddit Official API (OAuth2) scrapes r/wallstreetbets, r/stocks, r/investing for cashtag mentions. Posts scored via DistilFinBERT (title + selftext + top 5 comments). Mention-weighted daily aggregation with upvote-based weighting (clamped to minimum 1). DynamoDB-backed OAuth token cache (`TOKEN#reddit`) shared across concurrent Lambda invocations. Circuit breaker (`CIRCUIT#reddit`) following Finnhub pattern. Replaces Finnhub Premium social sentiment endpoint ($3,500/mo).
- `REDDIT_COMMENT_SCORE_THRESHOLD` constant — skip comment fetching for posts with score < 2 to reduce API calls
- `FEATURE_LABEL_MAP` entries for `social_score` ("Social Buzz") and `insider_net_sentiment` ("Insider Activity") in `ModelDiagnosticsCard`
- `TOKEN#` DynamoDB entity type for OAuth token caching with TTL
- `FINNHUB_API_KEY` environment variable on `PythonStocksFunction` Lambda
- Provider Architecture table in `PRO_FEATURES_ROADMAP.md` documenting all data sources

### Changed

- **[Pro]** `SOCIAL#` entity fields (`redditMentions`, `redditScore`, `twitterMentions`, `twitterScore`, `compositeScore`) are now nullable (`number | null`). `SocialSentimentCard` hides platform rows when null, shows "--" for null composite score. Twitter fields null until future X provider (Adanos) integration.
- Sentiment worker calls `fetchAndStoreRedditSentiment` (Reddit API) instead of `fetchAndStoreSocialSentiment` (Finnhub Premium)
- Search handler (`/search`) migrated from yfinance to Finnhub free-tier `/search` endpoint with `transform_finnhub_search_to_tiingo` type mapping (Common Stock, ADR, ETP, REIT, Unit)
- Earnings service (`/earnings`, `/batch/earnings`) migrated from yfinance to Finnhub free-tier `/calendar/earnings` endpoint with 90-day forward window and `transform_finnhub_earnings` hour mapping (bmo/amc/empty to BMO/AMC/TNS)
- Reddit credentials (`RedditClientId`, `RedditClientSecret`) added to `SentimentWorkerFunction` via SAM template parameters

### Fixed

- Pre-existing test failures in `publisherAccuracy.service.test.ts` and `dailyHistory.handler.test.ts` caused by hardcoded dates drifting outside lookback/retention windows. Tests now use relative dates via `daysAgo()` helper.
- `dailyHistory.handler.test.ts` missing mock for `truncateByDateRange` causing data to be filtered by tier-aware date retention

## [2.13.0] - 2026-04-14

### Added

- Self-calibrating publisher reliability: weekly `SignalCalibrationFunction` Lambda computes Bayesian-blended reliability scores from T+3 price deltas. Daily aggregation accumulates per-publisher accuracy stats (`PUBLISHER_STATS#` entities). Dynamic `reliabilityIndex` stored in `PUBLISHER#` entities replaces static publisher authority weight in signal scores.
- **[Pro]** Social sentiment integration: `GET /social` endpoint fetching Reddit/X mention counts and sentiment scores from Finnhub. `SOCIAL#` DynamoDB entities with 30-day TTL. `SocialSentimentCard` on sentiment tab displaying per-ticker social buzz.
- **[Pro]** Insider trading overlay: SEC Form 4 filings fetched from Finnhub in sentiment worker, filtered (option exercises removed), role-weighted (CEO 1.0 to Other 0.5), and aggregated to `insiderNetSentiment` field on `DAILY#` entities with 10-trading-day half-life decay. Insider conviction column on `AggregateSentimentCard`. Buy/sell markers on price chart via `useInsiderOverlay`.
- **[Pro]** Portfolio risk analytics: `GET /portfolio/risk` endpoint computing Portfolio Beta (vs SPY), parametric VaR, historical VaR, and Pearson correlation matrix from 90 days of `HIST#` price data. `RiskHeatmapCard` with color-coded correlation grid (blue for negative/hedge, green to red for increasing positive correlation). `RiskAlertsCard` highlighting high-correlation pairs and VaR divergence.
- Adaptive ML feature selection gate: F-test (p < 0.10) dynamically includes/excludes features per prediction horizon, replacing the hardcoded 8-feature/4-feature split. `social_score` and `insider_net_sentiment` available as candidate features. Gate applies independently to NEXT, WEEK, and MONTH horizons.
- `portfolio_risk`, `social_sentiment`, and `insider_data` feature flags in tier service

### Changed

- WEEK/MONTH prediction horizons no longer hardcoded to price-only model; features that pass the F-test gate on subsampled data are included
- Signal score service accepts optional `reliabilityOverrides` map; sentiment processing pre-fetches `PUBLISHER#` entities in batch with graceful fallback to static tier scores
- Sentiment worker runs social sentiment fetch and insider annotation as non-fatal post-processing steps after main sentiment analysis
- Risk computation uses sample variance (Bessel's correction) instead of population variance
- Prediction service reads `sentimentAvailability` from most recent data row instead of oldest
- Community tier stub updated with three new feature flags

## [2.12.0] - 2026-03-28

### Fixed

- 8 API Gateway route definitions added to `template.yaml` for endpoints that were unreachable in production (trending, freshness, earnings-impact, sector, watchlist x3, analyst)
- `querySentimentsByTicker` now accepts optional date range and pushes `FilterExpression` on `createdAt` to DynamoDB instead of loading all sentiments into memory
- SES client in report service now uses `process.env.AWS_REGION || 'us-east-1'` instead of empty config (was relying on SDK default resolution)
- `handleTrendingSelect` was passing `assetType` and `isActive` which do not exist on `SymbolDetails` (type-check failure on CI)
- Frontend database repositories now validate data before writes with `schema.parse()`, preventing silently lost records on subsequent reads
- Redundant `as TypeName` casts removed after Zod `safeParse` across all 7 frontend repositories (Zod inference provides the correct type)
- Shared test fixtures unified: removed misleading `TestProvidersOptions` interface, consolidated `createQueryWrapper` into `createTestProviders`
- Python test isolation: removed `sys.modules` mock leak in `test_analyst.py`, fixed `DYNAMODB_TABLE_NAME` overrides in 4 test files, rewrote `test_stocks_cache.py` to use `@patch` mocks instead of fragile moto context managers
- Bare `catch {}` blocks in prediction and track record handlers now capture and log the error object instead of silently swallowing failures
- Alert sweep subscriber watchlist fetch bounded to 25 concurrent DynamoDB queries via `mapWithConcurrency` (was unbounded `Promise.all`)
- Alert sweep error logging passes errors as logger parameters instead of embedding in data objects, restoring stack traces in structured logs
- ML sentiment metric calls now receive ticker context (`ticker ?? 'UNKNOWN'`) instead of hardcoded `'UNKNOWN'` for all tickers
- `as unknown as` type casts removed from `mlSentiment.service.ts` and `eventClassification.service.ts` (replaced with explicit field extraction and spread operators)
- Regex metacharacter escaping in event matcher keyword matching (`escapeRegExp` utility prevents broken patterns from keywords like "M&A" or "P/E")
- Alert history `getRecentAlerts` uses `skBetween` date-bounded range query instead of `limit: 50` with client-side filtering
- `fetchSentimentData` pushes date-range filtering to DynamoDB via `FilterExpression` instead of loading entire article partition into memory
- Finnhub retry budget reduced from 54s worst-case to 22s (1 retry instead of 3), fitting within 30s Lambda timeout per ADR-003
- Python yfinance retry budget reduced from 32s to 21s (`MAX_RETRIES` 2 to 1)
- Batch news and sentiment handlers limited to 3 concurrent Finnhub calls via `mapWithConcurrency` (was unbounded `Promise.allSettled`)
- Trending service uses `batchGetItemsSingleTable` for yesterday's aggregates instead of N individual `getDailyAggregate` calls
- Admin dashboard `fetch` calls now include 15s `AbortSignal.timeout` (was no timeout)
- Root layout `console.error` replaced with structured `logger.error`
- Handler import extensions normalized to extensionless (two `.js` imports removed)
- Python Lambda handler imports all handlers eagerly at function entry (removed asymmetric conditional import for analyst handler)
- Python `handler` function typed with `LambdaContext` Protocol instead of `Any`
- Python `MetricDefinition.unit` typed as `str` instead of `Any`
- Python `StockCacheItem` fields typed with `PriceRecord` and `StockMetadata` instead of `dict[str, Any]`

### Added

- Zod runtime validation schemas for all 7 frontend database repositories (`stock`, `symbol`, `portfolio`, `notes`, `wordCount`, `combinedWord`, `annotations`), replacing 25 `as unknown as` type casts with `safeParse` and graceful degradation
- Shared hook test fixtures at `frontend/src/hooks/__tests__/__fixtures__/` (`createTestQueryClient`, `createQueryWrapper`, `createTestProviders`, `mockLogger`)
- Admin dashboard page tests for `DashboardPage`, `BusinessPage`, `CostsPage`, `UsersPage` covering loading, data, and error states
- ESLint `no-empty` rule with `allowEmptyCatch: false` to prevent future bare catch blocks in backend
- ESLint `caughtErrors: 'all'` with `caughtErrorsIgnorePattern: '^_'` to enforce caught error usage in backend
- `admin/.env.example` documenting `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`
- `escapeRegExp` utility in event matcher for safe dynamic regex construction
- `filterExpression` support in `queryItems` DynamoDB utility

### Changed

- CLAUDE.md coverage thresholds corrected to match jest config (frontend 45/55/55/56, backend 63/75/71/70)
- `as any` casts in `sqliteAdapter.ts` documented with rationale comments

### Documentation

- CLAUDE.md: hook count corrected to 30, Lambda count to 7, platform abstraction updated from `database.web.ts` to `StorageAdapter`, `sentimentWorker.entry.ts` added to directory tree, 4 DynamoDB entity types added (JOB#, ARTICLE#, MODEL#, CIRCUIT#)
- ARCHITECTURE.md: all 30 hooks listed in file map, missing components added (TrendingFeed, AnalystConsensusCard, EarningsImpactCard, SectorSentimentDetailCard, chart hooks, portfolio decomposition), missing handlers added (trending, freshness, earningsImpact, sectorSentiment, batch, analyst.py, sentimentWorker.entry.ts), feature count updated to 23, new sections for Async Sentiment Pipeline, StorageAdapter, Volume Bars, Trending Sentiment Feed, Analyst Consensus, Data Freshness, Price Alerts, Earnings Impact Analysis
- API.md: 5 undocumented endpoints added (`/sentiment/trending`, `/sentiment/freshness`, `/sentiment/earnings-impact`, `/sentiment/sector`, `/analyst`), `backtesting` added to `/auth/tier` response, `SENTIMENT_QUEUE_URL` and admin/ML environment variables documented
- CHANGELOG.md v2.9.0: bundle count updated from five to six (Sentiment Worker)

## [2.11.0] - 2026-03-27

### Added

- Volume bars indicator: toggleable volume histogram on the price chart with green/red color coding for up/down days, synced crosshair with main chart
- Trending sentiment feed: "Top 10 Movers" feed on the home screen showing tickers with the largest absolute sentiment delta, computed by the sentiment worker and stored as a pre-aggregated TRENDING# entity
- Analyst consensus card: new Python `/analyst` endpoint fetching analyst price targets and recommendation data from yfinance, cached in ANALYST# entities with 24h TTL, displayed on the price tab
- Data freshness indicators: batch `GET /sentiment/freshness` endpoint returning last-sync timestamps for multiple tickers, with human-readable labels ("Updated 3h ago", "Stale") on portfolio items and sentiment tab
- Price alerts: percentage-based price change detection (5% threshold) integrated into the existing alert sweep pipeline with email notifications and a new `priceAlertEnabled` toggle in alert preferences
- Earnings impact analysis: sentiment worker annotates DAILY# entities with earnings proximity (5 business day window), new `GET /sentiment/earnings-impact` endpoint computes pre/post-earnings sentiment deltas, displayed as EarningsImpactCard on the sentiment tab

### Changed

- Home screen now shows trending sentiment feed above search results when search is empty, collapses when user starts typing
- Community sync overlays updated for new routes (`/sentiment/trending`, `/sentiment/freshness`, `/analyst`, `/sentiment/earnings-impact`) and new UI components (volume indicator, freshness badges, EarningsImpactCard)

## [2.10.0] - 2026-03-26

### Added

- **[Pro]** Sector sentiment analytics: `GET /sentiment/sector` endpoint aggregates DAILY# sentiment across sector ETF holdings with 7-day rolling trend, plus `SectorSentimentDetailCard` on portfolio analytics tab
- **[Pro]** Alert badge navigation: tapping alert badge on portfolio card navigates to alert-settings screen with ticker context chip
- **[Pro]** Track record visualization: rolling accuracy chart, win/loss distribution, streak tracking, and confidence calibration charts gated behind `backtesting` feature flag
- **[Pro]** Track record endpoint `limit` parameter: configurable recent predictions per horizon (default 7, max 50)
- **[Pro]** Unknown ETF validation: `GET /sentiment/sector` returns 400 for unrecognized ETFs with static + DynamoDB fallback lookup
- `portfolio_export` and `real_time_alerts` keys added to community tier stub features map
- `news_alerts` confirmed covered by existing v2.6 alert sweep (material event detection via z-score anomaly)
- `prediction_alerts` confirmed covered by existing v2.6 alert sweep (direction-flip detection)

### Fixed

- **[Pro]** Community sync: TrackRecordCard and notes screen added to `.sync/config.json` exclusions with "Available in Pro" overlay stubs
- **[Pro]** TrackRecordCard and notes hooks gracefully handle 404 from missing backend endpoints (defense-in-depth for community edition)
- **[Pro]** Alert badge navigation routes to `alert-settings?ticker=X` (was routing to stock sentiment tab where scrollTo had no effect)
- **[Pro]** Sector sentiment route uses `lazyHandler` pattern consistent with all other routes in index.ts
- **[Pro]** Track record calibration bar uses `theme.colors.surfaceVariant` instead of hardcoded `#e0e0e0` (dark mode support)
- **[Pro]** Sector sentiment ticker count uses most recent day's count instead of max over 7 days

### Changed

- Chart annotations, multi-ticker comparison, and portfolio export audited and confirmed working end-to-end (already implemented in v2.7.0)
- Feature roadmap updated: 9 features moved from Backlog to Implemented, 3 remaining (custom_models, api_access, webhook_integration)

## [2.9.0] - 2026-03-23

### Added

- **[Pro]** DynamoDB `EntityTypeIndex` GSI on `entityType` attribute — user-entity queries (report prefs, alert prefs, admin aggregation, user list) now use `Query` instead of full-table `Scan`
- **[Pro]** `queryByEntityType` DynamoDB utility with pagination support
- **[Pro]** Async sentiment pipeline — POST `/sentiment` enqueues to SQS and returns job ID immediately; new `SentimentWorkerFunction` Lambda (300s timeout) processes jobs asynchronously
- **[Pro]** SQS dead-letter queue for failed sentiment jobs (14-day retention, 3 retries)
- Structured frontend logger with `{level, module, message, context}` output — JSON in production, human-readable in development
- `withRepoLogging` and `withRepoLoggingDefault` utilities for DRY repository error handling
- `StorageAdapter` interface with document-style API (`query`, `put`, `update`, `delete`, `getAll`) — platform-agnostic database abstraction below the repository layer
- `SqliteAdapter` implementation wrapping expo-sqlite for native platforms
- `LocalStorageAdapter` implementation for web platform with debounced persistence and QuotaExceededError eviction
- `ML_PIPELINE_VERSION` and `ML_PIPELINE_COMPONENTS` version constants for both backend and frontend ML pipelines
- Backend ML integration tests for sentiment analyzer, aspect detector, and event matcher with known inputs

### Changed

- Backend build now produces six bundles (API, Sentiment Worker, Reports, Alerts, Admin, Aggregation)
- PriceChartDom decomposed from 552-line monolith into 8 focused hooks/helpers (`useMainChart`, `chartSeries`, `chartAnnotations`, `useRSIChart`, `useMACDChart`, `useChartSync`, `types`, barrel `index`)
- PortfolioItem decomposed from 477-line component into 4 child components (`PortfolioItemHeader`, `PortfolioItemPrice`, `PortfolioItemPrediction`, `ExpandedHeatmapSection`) with co-located tests
- Frontend console calls reduced from 89 to 6 (4 in logger delegation, 2 in JSDoc examples)
- `batchPutItemsSingleTable` now handles transient DynamoDB errors (throttling, internal server error) with exponential backoff, matching `batchGetItemsSingleTable`
- Sentiment worker validates SQS message body with Zod schema before processing
- Chart annotation callbacks use ref-forwarding to avoid unnecessary chart rebuilds when parent re-renders
- All 7 frontend database repositories migrated from raw SQL strings to `StorageAdapter` method calls

### Removed

- 4 full-table DynamoDB `Scan` operations replaced by GSI queries
- `paginatedScan` helper (no longer needed)
- 83 direct `console.*` calls across frontend repositories, services, hooks, and components
- `database.web.ts` (1035 lines) — SQL-string-parsing web database layer replaced by `LocalStorageAdapter`

## [2.8.1] - 2026-03-23

### Fixed

- Silent partial failure in `batchCheckExistence` now returns `{ found, complete }` so callers know when cache lookups are incomplete instead of silently re-processing articles
- Python earnings handler no longer leaks raw exception strings in HTTP error responses
- All admin handlers now use `sanitizeErrorMessage` instead of raw `error.message`
- Python Lambda returns 405 Method Not Allowed for known paths with wrong method (was 404)
- Sentiment job status handler extracts `jobId` from `rawPath` when `pathParameters` is empty
- Backend client clears cached axios instance on 401 response, preventing stale auth after token expiry
- `null as unknown as T` type lie in per-article sentiment fallback replaced with discriminated union
- Misleading `series!` non-null assertion in PriceChartDom replaced with proper `| undefined` initialization

### Changed

- Sentiment pipeline uses `mapWithConcurrency` (limit 10) for all batch operations instead of unbounded `Promise.allSettled`
- Article query guard tightened from `MAX_ARTICLES_PER_TICKER = 2000` to `MAX_ARTICLES_PER_QUERY = 500`
- Alpha Vantage circuit breaker uses dedicated thresholds (3 failures, 30min cooldown) instead of reusing Finnhub constants
- Event classification metrics reset per batch instead of accumulating across Lambda invocations
- Backend route table refactored from 30 verbose blocks to declarative `lazyHandler` format
- Frontend logger now filters by level (production defaults to WARN) with `unknown[]` params instead of `any[]`
- Python Lambda rejects request bodies larger than 1MB with 413
- Python retry delay renamed from `BACKOFF_BASE` to `RETRY_DELAY_SECONDS` to clarify fixed-interval behavior

### Added

- Python circuit breaker for yfinance calls (3-failure threshold, 60s cooldown)
- Python TypedDicts for all handler and service function signatures (15 type definitions)
- Admin workspace test infrastructure with Jest config and 16 tests across API client and auth
- `mapWithConcurrency` utility in `backend/src/utils/concurrency.util.ts`
- Backend coverage thresholds raised to 63/75/71/70 (from 55/60/65/65)
- Frontend coverage thresholds raised for functions/lines/statements (branches lowered to match actual 47.87%)

### Removed

- Deprecated legacy DynamoDB types (`StockHistoricalDataItem`, `ArticleAnalysisDataItem`, `DailySentimentAggregateItem`)
- `DynamoDBClientWrapper` class and `dynamodb.client.ts` — all data access now uses `dynamodb.util.ts` directly
- Dead `PREDICTION_FUNCTION_NAME` env var from SAM template
- `--forceExit` flag from backend test command
- Duplicate `USE_BROWSER_SENTIMENT` config in `environment.ts` (canonical source is `features.ts`)

### Documentation

- Updated CLAUDE.md: 6 Lambdas, 3 workspaces, 25 hooks, missing DynamoDB entities, directory trees
- Updated ARCHITECTURE.md: 22 feature gates, 6-Lambda architecture, admin dashboard, file maps
- Updated API.md: all watchlist/alert/annotation/admin/export endpoints, 22-feature tier response
- Updated .env.example: all backend, frontend, and admin env vars with defaults and descriptions
- Added v2.8.0 admin dashboard and tech debt remediation section to pro features roadmap
- Verified CHANGELOG.md format and fixed release.yml regex to skip `[Unreleased]`

## [2.8.0] - 2026-03-22

### Added

- **[Pro]** Admin metrics dashboard: standalone Vite/React SPA with Shadcn/ui and Recharts at `admin/`
- **[Pro]** Cognito admin group authorization with JWT `cognito:groups` claim enforcement
- **[Pro]** Operational metrics dashboard: Lambda invocations, errors, latency, DynamoDB capacity from CloudWatch
- **[Pro]** Per-endpoint breakdown: route-level latency, cache hit rates, and error rates from CloudWatch EMF metrics
- **[Pro]** Business metrics dashboard: user signups, tier distribution, DAU/WAU/MAU, feature adoption, quota usage
- **[Pro]** Cost estimates page via AWS Pricing API with per-service breakdowns
- **[Pro]** Admin user list with tier badges, sorting, and email search
- **[Pro]** Scheduled metrics aggregation Lambda (daily EventBridge) for pre-computed DynamoDB snapshots
- **[Pro]** S3/CloudFront hosting for admin SPA with OAC security
- **[Pro]** Admin deploy script with CloudFormation output integration

### Changed

- Backend build now produces five bundles (API, Reports, Alerts, Admin, Aggregation)
- Added `admin/` as third npm workspace in monorepo

## [2.7.0] - 2026-03-22

### Added

- **[Pro]** Chart annotation tools: horizontal support/resistance lines and two-point trendlines on price chart
- **[Pro]** Multi-ticker comparison: percentage-normalized overlay chart with portfolio ticker picker (max 4)
- **[Pro]** Portfolio CSV export: server-side CSV generation with platform-appropriate download
- **[Pro]** Prediction alerts: direction-flip detection integrated into alert sweep with email notifications
- **[Pro]** Sector sentiment analytics card: per-sector average sentiment with trend indicators on portfolio analytics tab
- **[Pro]** Alert badge navigation: tapping alert badge on portfolio card navigates to alert-settings screen with ticker context
- **[Pro]** Track record visualization: rolling accuracy, win/loss distribution, streak tracking, and confidence calibration charts for prediction analytics
- **[Pro]** News alerts: material event detection integrated into alert sweep with email notifications

### Fixed

- **[Pro]** Community sync: TrackRecordCard, PredictionHistory, and ComparativeSentimentCard no longer leak to community edition (replaced with pro teaser stubs)
- **[Pro]** Alert badge navigation now routes to alert-settings screen (was landing on stock sentiment tab where scrollTo had no effect)
- **[Pro]** Trendline annotations can now be deleted in delete mode (was silently skipping non-horizontal annotations)
- **[Pro]** Prediction flip alert emails no longer show irrelevant sparkline data or broken statistics row
- **[Pro]** Comparison chart date range now matches primary chart (was hardcoded to 30 calendar days)
- **[Pro]** Cross-device annotation deletion: annotations deleted on one device are now removed on sync from other devices
- **[Pro]** Delete mode auto-exits after successful annotation deletion
- **[Pro]** Sector sentiment handler now validates unknown ETFs with 400 response instead of returning empty 200
- **[Pro]** Sector sentiment route uses `lazyHandler` pattern consistent with all other routes
- **[Pro]** Track record calibration bar adapts to dark mode (was hardcoded light-mode color)
- **[Pro]** Sector sentiment ticker count uses most recent day instead of max over 7 days
- Community tier stub now includes `portfolio_export` and `real_time_alerts` feature keys

## [2.6.0] - 2026-03-22

### Added

- **[Pro]** Real-time sentiment alerts: email notifications when significant sentiment shifts or material event spikes are detected for watchlist stocks
- **[Pro]** Alert settings screen with per-type toggles (sentiment shifts, material events) and master opt-out
- **[Pro]** Watchlist badge indicator for stocks with recent alerts
- **[Pro]** Anomaly detection using z-score analysis against 90-day statistical baseline
- **[Pro]** 24-hour alert cooldown with early reset when conditions normalize

### Changed

- **[Pro]** Restructured Lambda architecture: weekly reports extracted to dedicated Lambda function
- **[Pro]** Added dedicated alerts Lambda function with independent memory/timeout configuration
- Backend build now produces three bundles (API, Reports, Alerts)

## [2.5.0] - 2026-03-22

### Added

- **[Pro]** Candlestick chart rendering via TradingView Lightweight Charts
- **[Pro]** Bollinger Bands overlay on candlestick chart (20-period SMA, 2 std dev)
- **[Pro]** RSI indicator pane below price chart (14-period Wilder's smoothing)
- **[Pro]** MACD indicator pane with signal line and color-coded histogram (12/26/9)
- **[Pro]** Indicator toggle chips (BB, RSI, MACD) with lock icon for free tier
- Built-in scroll, zoom, and crosshair navigation on price chart (replaces time range selector)
- Bidirectional time scale sync between price and indicator sub-charts
- Sentiment chart legend showing series labels with matching line styles
- Single-point sentiment data rendered as dots instead of being silently dropped

### Changed

- Replaced `react-native-svg-charts` (unmaintained, 6+ years) with TradingView Lightweight Charts for price chart
- Replaced SentimentChart with custom SVG implementation using `react-native-svg` directly
- Replaced MiniChart with simple SVG polyline sparkline
- Free tier price chart upgraded from area chart to Lightweight Charts line series
- Default time range changed from 1M to 5Y for maximum data availability
- MACD histogram uses HistogramSeries with green/red color coding instead of plain line
- Removed `react-native-svg-charts` and `d3-shape` dependencies

### Fixed

- Memory leak: time scale subscriptions now properly unsubscribe in useEffect cleanup
- NaN gaps in sentiment chart no longer produce misleading connecting lines
- Legend swatches use SVG dashed lines matching actual chart series style

## [2.4.1] - 2026-03-21

### Fixed

- Sentiment score field priority in portfolio analytics: use `avgAspectScore`/`avgMlScore` instead of `avgSignalScore` (wrong range)
- Prediction handler now respects caller's `days` parameter for direct Lambda invocations (warm-cache)
- Portfolio analytics tab distinguishes loading state from empty data state
- DELETE /watchlist endpoint now validates ticker format with Zod (matching POST)
- Truncation banner for `/sentiment/daily-history` — free tier heatmaps now show upgrade prompt and stop paginating into truncated range
- `useWatchlistSync` returns stable `useCallback`-wrapped references to prevent unnecessary effect re-registration
- `AggregateSentimentCard` uses `useAppTheme` for proper type safety
- EmptyState uses `variant="data"` instead of invalid `icon="chart-bar"`
- Removed unused pro TTL constants flagged by knip

### Changed

- Renamed `weightedScore` to `averageScore` in `AggregateSentiment` to reflect equal-weight arithmetic mean
- Renamed `isAuthenticated` to `syncEnabled` in watchlist sync service signatures
- DataTruncationBanner now includes "Upgrade" action linking to settings screen

## [2.4.0] - 2026-03-21

### Added

- **[Pro]** Cloud-synced watchlist via DynamoDB with optimistic local writes
- **[Pro]** Extended data retention (365 days for pro, 90 days for free)
- **[Pro]** Data truncation metadata and upgrade prompt for free tier
- Portfolio analytics tab with aggregate sentiment, sector exposure, and prediction confidence
- Three new feature flags: watchlist_sync, extended_date_range, portfolio_analytics

## [2.3.3] - 2026-03-14

### Added

- `CONTRIBUTING.md` with PR workflow, branch strategy, commit conventions, test discovery guide, and two-repo sync warning
- `make dev` target for one-command local setup
- API Gateway throttling parameters (`ThrottlingBurstLimit: 50`, `ThrottlingRateLimit: 25`) on both pro and community templates
- DynamoDB `LastEvaluatedKey` pagination in Python `query_stocks_by_date_range`
- `DynamoTable` Protocol type for ETF holdings service
- Community overlay for `CONTRIBUTING.md` (strips sync section)

### Changed

- Replaced 190-line switch statement router with declarative `RouteDefinition[]` route table in `backend/src/index.ts`
- Decomposed 340-line `analyzeArticles` into 5 named pipeline steps: `classifyEvents`, `calculateArticleSignalScores`, `analyzeAspectsBatch`, `analyzeMlSentimentBatch`, `buildCacheItems`
- Parallelized `analyzeAspectsBatch` and `analyzeMlSentimentBatch` via `Promise.all`
- Eliminated all `any` types in `frontend/src/database/database.web.ts` (25 instances replaced with 7 typed interfaces)
- Added `VALID_TABLES` allowlist for table name validation in both native and web database layers
- Replaced `console.error` with structured logger in `useSentimentData.ts`
- Replaced `hasOwnProperty` with `Object.hasOwn` in web database
- Moved `JSON.stringify` inside `requestIdleCallback` to prevent stale snapshot writes
- Pinned MiniStack image to `4.4.0` in `docker-compose.yml` and CI
- Lazy-loaded yfinance in `etf_holdings_service.py` to match `yfinance_service.py` cold-start pattern
- Added `@functools.wraps` to `retry_with_backoff` decorator
- Updated retry docstring from "exponential backoff" to "fixed-interval backoff"

### Fixed

- **Python stock cache using wrong DynamoDB key schema** — all operations now use `pk`/`sk` composite keys matching single-table design; cache was silently nonfunctional since deployment
- Python `batch_get_stocks` missing `UnprocessedKeys` retry handling — added exponential backoff matching Node.js pattern
- Python Lambda retry budget consuming 47% of timeout (14s/30s) — reduced to 7% (2s/30s) with `MAX_RETRIES=2`, `BACKOFF_BASE=1`
- Removed 3 deprecated `_`-prefixed parameters from `getStockPredictions` public API
- Mislabeled integration test (`complete-pipeline.test.ts`) now calls real `classifyEvent` and `analyzeAspects` services
- yfinance test mock targets patching nonexistent module attribute — fixed to patch `yfinance.Ticker` directly; removed CI `--ignore` exclusion
- Silent `except Exception: pass` in ETF holdings service — now logs at WARNING level
- Stale `STOCKS_CACHE_TABLE` env var removed from test fixtures
- Typed Python service functions: `fetch_stock_prices -> pd.DataFrame`, `table: DynamoTable` Protocol
- Backoff comment accuracy ("1s + 2s = 3s" corrected to "1s + 1s = 2s")

## [2.3.2] - 2026-03-12

### Added

- **[Pro]** Atomic quota enforcement — `checkAndRecordUsage` replaces non-atomic `checkQuota` + `recordUsage` with single DynamoDB `ConditionExpression` to eliminate TOCTOU race at quota boundary
- **[Pro]** `conditionalIncrementUsage` repository method using DynamoDB conditional writes
- DynamoDB `WriteThrottleEvents` CloudWatch alarm to detect batch write data loss risk
- Sync integrity verification step in `.sync/sync.sh` — scans for pro-only file leaks before pushing to community repo
- Backend CI coverage enforcement (`--coverage` flag on backend tests, `--cov-fail-under=70` on Python tests)
- Python type checking in CI via mypy
- Backend unit tests for dynamodb client, finnhub service, mlSentiment service, newsCache service, signalScore service, and 7 utility modules (cache, cacheTransform, dynamodb, error, hash, logger, metrics)

### Changed

- Migrated from deprecated `@testing-library/jest-native` to built-in matchers in `@testing-library/react-native`
- Pinned `react-test-renderer` as direct devDependency to keep in sync with React via Dependabot
- Moved Lambda `MemorySize`/`Timeout` from SAM `Globals` to per-function config for right-sized resources
- Scoped SES IAM policy from `Resource: '*'` to specific identity ARN
- Escalated `@typescript-eslint/no-explicit-any` from `warn` to `error`
- Routed `console.log` calls through logger utility
- Removed 14 unused type exports across frontend and backend
- Removed unused Python exports and whitelisted tested-but-uncalled functions

### Fixed

- Frontend CI failures on Dependabot PRs caused by `react-test-renderer` version mismatch
- `TierContext` defaulting `isFeatureEnabled` to `false` for unauthenticated users — now returns `true` per auth-optional design
- `MaterialityHeatmap` initializing to current month instead of data's month, causing time-dependent test failures
- Backend CI coverage thresholds lowered to match actual coverage (65% lines/statements, 60% functions, 55% branches)
- 9 npm audit vulnerabilities resolved
- Removed committed `__pycache__` bytecode from tracking

## [2.3.1] - 2026-02-22

### Fixed

- Fix race condition between release and sync workflows — sync now creates community repo tag and release directly instead of depending on pro repo tag propagation

## [2.3.0] - 2026-02-22

### Added

- **[Pro]** Model diagnostics — ML prediction feature importance percentages per horizon, converting raw ANOVA F-statistics into relative percentages grouped into Sentiment Signals and Price Signals
- **[Pro]** Materiality heatmap — calendar grid on portfolio cards showing daily sentiment intensity (color-coded) with material event dot markers, backwards pagination via `useInfiniteQuery`
- **[Pro]** Comparative sentiment — stock sentiment percentile ranking vs sector ETF top 10 holdings, with three-level ETF holdings fallback (DynamoDB cache → yfinance → static map)
- **[Pro]** Email reports — personalized HTML email digests via SES with portfolio summaries, predictions, sentiment, and track record; on-demand delivery + weekly EventBridge schedule (Monday 8 AM UTC)
- **[Pro]** `GET /etf-holdings` endpoint with ETF holdings cache (`ETF#` entity, 7-day TTL)
- **[Pro]** `GET /sentiment/peers` endpoint with peer sentiment cache (`PEERS#` entity, 24-hour TTL)
- **[Pro]** `GET /sentiment/daily-history` endpoint reading pre-aggregated `DAILY#` entities
- **[Pro]** `GET/PUT /reports/preferences` and `POST /reports/send` email report endpoints (auth + tier required)
- **[Pro]** `REPORT_PREFS` DynamoDB entity for weekly report opt-in and ticker list
- **[Pro]** 4 new feature flags: `model_diagnostics`, `materiality_heatmap`, `comparative_sentiment`, `email_reports`
- **[Pro]** `SES_FROM_EMAIL` environment variable for configurable sender address

### Fixed

- Peer sentiment `batchFetchAverageSentiment` reading nonexistent `sentimentScore` field — changed to `avgAspectScore ?? avgMlScore`
- Report handler missing tier enforcement — free-tier users now receive 403 on report endpoints
- Report handler error responses leaking raw exception messages — now uses `sanitizeErrorMessage()`
- Report HTML template missing escaping for user-derived strings (`escapeHtml()` applied)
- Report `priceChange` never populated — now fetches 2 price records and computes delta
- Report `peerPercentile` referenced but never populated — removed dead field from interface and template
- ETF holdings handler leaking raw Python exception in 500 responses
- ETF holdings handler not validating `etf` query parameter format — added `^[A-Z]{1,6}$` regex
- ETF holdings handler/service passing dead `table_name` argument — removed
- Peer sentiment handler missing `validateTicker()` — now validates both `ticker` and `sectorEtf`
- Peer sentiment handler `sectorName` unbounded — capped at 50 characters
- Daily-history handler missing `validateTicker()` — now uses shared validation
- Comparative sentiment bar width overflow — clamped to 100% max
- Heatmap prev-month button missing `disabled` state when no more data
- Weekly report processing changed from sequential to parallel batches of 10

## [2.2.2] - 2026-02-22

### Changed

- Updated ARCHITECTURE.md and API.md with v2.2 feature documentation (sentiment velocity, sector benchmarking, earnings calendar, notes, track record)
- Updated community overlay docs to include public features and reference pro for gated features
- Marked implemented features in feature roadmap

## [2.2.1] - 2026-02-22

### Changed

- Automated community repo GitHub release creation via sync workflow

## [2.2.0] - 2026-02-22

### Added

- **[Pro]** Sentiment velocity indicator — shows rate of change in daily sentiment scores with directional arrows and magnitude badges
- **[Pro]** Stock notes — per-stock notes with DynamoDB primary storage and local SQLite fallback for offline use; full CRUD with cloud sync on app open
- **[Pro]** Sector ETF benchmarking — GICS sector-to-SPDR ETF mapping (11 sectors), sector/industry metadata enrichment via yfinance, relative performance comparison on price screen
- **[Pro]** Earnings calendar — upcoming earnings dates with BMO/AMC/TNS timing, EPS estimates, batch endpoint, DynamoDB cache with 24-hour TTL and empty sentinel for ETFs
- **[Pro]** Prediction track record — immutable prediction snapshots (`PRED#` DynamoDB entity), on-demand resolution against actual prices, per-horizon accuracy gauges (1d/14d/30d), prediction history with correct/incorrect/pending indicators
- **[Pro]** `POST /predictions/snapshot` endpoint for browser-side prediction tracking
- **[Pro]** `GET /predictions/track-record` endpoint with stats aggregation and recent predictions
- **[Pro]** Notes CRUD endpoints (`GET/POST /notes`, `PUT/DELETE /notes/:noteId`)
- **[Pro]** Earnings endpoints (`GET /earnings`, `POST /batch/earnings`)
- Trading day utility functions (weekend-aware date arithmetic, UTC-anchored)
- SQLite migrations v5 (notes table) and v6 (sector columns on symbol_details)
- 5 new feature flags: `sentiment_velocity`, `stock_notes`, `sector_benchmarking`, `earnings_calendar`, `prediction_track_record`
- Implementation plan documentation in `docs/plans/` (Phase 0-3)

### Fixed

- Notes sync: PUT→404 fallback to POST for notes edited before first sync
- Notes sync: ID mismatch causing duplicate notes after sync (frontend now sends local ID to backend)
- Notes sync: `createBackendClient()` moved outside sync loop
- Earnings cache: deferred `DYNAMODB_TABLE_NAME` check for testability
- Track record: parallel DynamoDB resolution via `Promise.all()`
- Track record: per-horizon recent predictions (7 per horizon, merged by date)
- Prediction snapshots: ticker validated against real stock data; basePriceClose required

### Changed

- ESLint upgraded to v9 with flat config
- Sync config updated to exclude notes and track record backend files from community edition
- Community sync boundary documented: earnings, sector, and velocity intentionally available in community (public data, no auth required)

## [2.1.0] - 2026-02-20

### Added

- **[Pro]** Cognito authentication (sign up, sign in, email verification, password reset)
- **[Pro]** Tier system with free and pro tiers (feature flags, daily quotas)
- **[Pro]** `POST /auth/tier` endpoint with JWT authorization and auto-provisioning
- **[Pro]** Auth middleware for JWT claim extraction (`requireAuth`/`optionalAuth`)
- **[Pro]** User repository for `USER#` DynamoDB entities (tier info + daily quota counters with TTL)
- **[Pro]** Tier, quota, and feature flag backend services
- **[Pro]** `<FeatureGate>` component for conditional pro content rendering
- **[Pro]** `TierContext` and `AuthContext` React providers
- **[Pro]** Authentication screens (login, signup, email confirm, forgot password)
- **[Pro]** Account/Settings screen with tier badge, usage meters, sign-out
- **[Pro]** JWT token injection via shared `backendClient.ts` axios interceptor
- **[Pro]** Two-repo sync infrastructure (rsync + file overlays + GitHub Actions)
- **[Pro]** Community edition overlay stubs maintaining identical interfaces
- Shared `backendClient.ts` factory replacing 3 duplicate client implementations
- `CORS Authorization` header support for cross-origin JWT requests
- Doc linting in CI via markdownlint-cli2

### Fixed

- 7 UI component rendering issues (context providers, null guards, data transforms)
- Bash arithmetic errors in `scripts/code-hygiene.sh` (`grep -c` double output)
- Documentation drift between code and docs

### Changed

- Project rebranded from "react-stocks" / "Stock Tracker" to "NewsInvestor"
- Package names updated (`news-investor-pro`, `news-investor-frontend`, `news-investor-backend`)
- Hardened type safety with stricter build guardrails
- Removed dead code, unused exports, and debug logging

### Dependencies

- Bump yfinance 0.2.66 → 1.2.0
- Bump boto3 1.42.1 → 1.42.53
- Bump AWS SDK (2 packages)
- Bump typescript-eslint 8.48.1 → 8.56.0
- Bump @types/node 20.19.25 → 25.3.0
- Bump pytest 9.0.1 → 9.0.2, moto 5.1.17 → 5.1.21
- Bump babel-preset-expo 54.0.9 → 54.0.10
- Bump @types/aws-lambda 8.10.159 → 8.10.160
- Bump GitHub Actions: setup-node 4 → 6, setup-python 5 → 6, markdownlint-cli2-action 19 → 22

## [2.0.0] - 2026-02-15

Initial version under the NewsInvestor name. Three-signal sentiment pipeline, browser-based ensemble prediction model, and full stock data browsing.
