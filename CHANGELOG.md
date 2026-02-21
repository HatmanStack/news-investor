# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Features marked with **[Pro]** are available in the pro edition only and are excluded from the community sync.

## [2.1.0] - 2026-02-21

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

### Fixed

- Bash arithmetic errors in `scripts/code-hygiene.sh` (`grep -c` double output)

### Changed

- Project rebranded from "react-stocks" / "Stock Tracker" to "NewsInvestor"
- Package names updated (`news-investor-pro`, `news-investor-frontend`, `news-investor-backend`)

## [2.0.0] - 2026-02-15

Initial version under the NewsInvestor name. Three-signal sentiment pipeline, browser-based ensemble prediction model, and full stock data browsing.
