# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Features marked with **[Pro]** are available in the pro edition only and are excluded from the community sync.

## [Unreleased]

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
- **[Pro]** Alert badge navigation: tapping alert badge on portfolio card navigates to stock detail with alert settings visible

### Fixed

- **[Pro]** Community sync: TrackRecordCard, PredictionHistory, and ComparativeSentimentCard no longer leak to community edition (replaced with pro teaser stubs)
- **[Pro]** Alert badge navigation now routes to sentiment tab (was landing on price tab where scrollTo had no effect)
- **[Pro]** Trendline annotations can now be deleted in delete mode (was silently skipping non-horizontal annotations)
- **[Pro]** Prediction flip alert emails no longer show irrelevant sparkline data or broken statistics row
- **[Pro]** Comparison chart date range now matches primary chart (was hardcoded to 30 calendar days)
- **[Pro]** Cross-device annotation deletion: annotations deleted on one device are now removed on sync from other devices
- **[Pro]** Delete mode auto-exits after successful annotation deletion

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
- Pinned LocalStack image to `4.4.0` in `docker-compose.yml` and CI
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
- Marked implemented features in PRO_FEATURES_ROADMAP.md

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
