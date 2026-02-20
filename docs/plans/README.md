# NewsInvestor: Free/Pro Split Implementation Plan

## Overview

The `react-stocks` application is being rebranded to **NewsInvestor** and split into a two-repository architecture: a public community edition (`news-investor`) and a private pro edition (`news-investor-pro`). This follows the exact pattern already established by `warmreach` / `warmreach-pro` in this organization.

All current features (sentiment analysis, ML predictions, charts, portfolio, news browsing) remain free in both editions. The pro edition adds premium content access (full-length article bodies), higher usage quotas (unlimited searches and sentiment analyses), and a roadmap of future paid features. Authentication is handled by AWS Cognito user pools deployed via the existing SAM template, with a tier/feature-flag system controlling what authenticated users can access.

A one-way sync pipeline (GitHub Actions + rsync + file overlays) keeps the public repo automatically updated from the pro repo on every push to `main`. Pro-only code (auth services, tier management, billing stubs) is excluded or replaced with no-op stubs in the community edition.

## Prerequisites

- **Node.js >= 24** (managed via nvm)
- **Python 3.13** (managed via uv)
- **AWS SAM CLI** for backend deployment
- **GitHub CLI (`gh`)** for repo creation and deploy key management
- **jq** and **rsync** (required by sync script)
- Access to the `HatmanStack` GitHub organization
- Familiarity with the warmreach-pro sync pattern (reference: `~/projects/warmreach-pro/.sync/`)

## Phase Summary

| Phase | Goal | Est. Tokens |
|-------|------|-------------|
| [Phase 0](Phase-0.md) | Foundation: ADRs, conventions, testing strategy, deployment | ~8,000 |
| [Phase 1](Phase-1.md) | Repo setup, rebrand, sync infrastructure | ~35,000 |
| [Phase 2](Phase-2.md) | Backend Cognito auth + tier/quota services | ~40,000 |
| [Phase 3](Phase-3.md) | Frontend auth, tier system, feature gates, settings screen | ~45,000 |

## Important

Commit messages must NOT include `Co-Authored-By` or `Generated-By` attribution lines.
