# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Features marked with **[Pro]** are available in the pro edition only and are excluded from the community sync.

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
