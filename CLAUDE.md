# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Community Edition** — This is the open-source NewsInvestor community edition.
> The pro edition with additional features is at [news-investor-pro](https://github.com/HatmanStack/news-investor-pro).

## Build & Development Commands

```bash
# Root monorepo commands
make setup                       # Python toolchain + npm install --legacy-peer-deps
npm install --legacy-peer-deps  # Install JS dependencies only
npm test                         # Run frontend tests
npm run test:backend             # Run backend tests
npm run lint                     # Lint frontend (expo lint + tsc)
npm run lint:backend             # Lint backend TypeScript
npm run lint:ml                  # Lint Python ML code (ruff)
npm run lint:python-types        # Type-check Python code (mypy)
npm run lint:docs                # Lint markdown files (markdownlint)
npm run lint:docs:links          # Check links in markdown files (requires lychee)
npm run format                   # Format all files (Prettier)
npm run check                    # The local gate (see below for what it omits)
npm run hygiene                  # Dead code detection (knip + vulture)
npm run test:python              # Python tests via the right interpreter

# Frontend (cd frontend)
npm start                        # Expo dev server
npm run android                  # Run on Android
npm run ios                      # Run on iOS
npm run web                      # Run on web browser
npm run test:watch               # TDD mode
npm run test:coverage            # Coverage report

# Backend (cd backend)
npm run build                    # Build with esbuild
npm run type-check               # TypeScript check
npm run test:integration         # Integration tests
npm run deploy                   # Deploy via SAM
npm run logs                     # View Lambda logs
npm run warm-cache               # Pre-populate DynamoDB cache

# Local development (Docker required)
make ministack                  # Start MiniStack DynamoDB
make ministack-stop             # Stop MiniStack
make test-e2e                    # Run E2E tests against MiniStack
make setup                       # setup-python + npm install --legacy-peer-deps
make setup-python                # Python toolchain into ./.venv (or the active venv)
make dev                         # setup + ministack
make test                        # npm run check
make check-full                  # npm run check + E2E, lychee, shellcheck, vulture
```

`npm run check` deliberately omits four things CI runs, each of which fails for
environmental rather than code reasons: E2E (Docker), the lychee link check
(external binary + network), shellcheck (external binary), and vulture (skipped
gracefully when absent). `make check-full` runs `npm run check` plus all four.

### Running Single Tests

```bash
# Frontend - run single test file
npm test -- frontend/src/hooks/__tests__/useChartData.test.ts

# Backend - run single test file (PLURAL flag; jest 30 renamed it)
cd backend && npm test -- --testPathPatterns=sentiment

# Python tests - run `make setup-python` once, then activate the virtualenv
source .venv/bin/activate
PYTHONPATH=backend/python pytest backend/python_tests/ -k "test_name"
```

## Architecture Overview

**Monorepo Structure**: npm workspaces with `frontend/` (Expo/React Native) and `backend/` (AWS Lambda).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the sentiment pipeline, prediction model, and detailed file map.
See [docs/API.md](docs/API.md) for endpoints, DynamoDB schema, environment variables, and CloudWatch metrics.

### Frontend (Expo Router + React Native Paper)

```text
frontend/
├── app/(tabs)/          # File-based routing (Expo Router)
│   ├── index.tsx        # Market overview screen
│   ├── portfolio.tsx    # Watchlist screen
│   └── stock/           # Stock detail screens
├── src/
│   ├── contexts/        # React Context providers (StockContext, StockDetailContext)
│   ├── hooks/           # Custom hooks (see hooks/index.ts barrel export)
│   ├── services/api/    # API client layer
│   ├── database/        # Platform abstraction (StorageAdapter with SqliteAdapter/LocalStorageAdapter)
│   │   └── repositories/    # Repository pattern for data access
│   ├── ml/              # Browser-side sentiment analysis (predictions are server-side)
│   └── components/      # Reusable UI components
```

**Key Patterns**:

- **Platform Abstraction**: `StorageAdapter` interface with `SqliteAdapter` (native) and `LocalStorageAdapter` (web) implementations in `src/database/`
- **Repository Pattern**: All data access through `src/database/repositories/`
- **TanStack Query**: Used for API caching and data synchronization
- **Path Aliases**: `@/` maps to `src/` (configured in tsconfig.json)

### Backend (AWS SAM + Lambda)

Three Lambda functions sharing a single DynamoDB table (composite keys):

1. **Node.js API** (`ReactStocksFunction`): News, sentiment, prediction - API Gateway, built via esbuild
2. **Python API** (`PythonStocksFunction`): Stock data, search, earnings, ETF holdings - API Gateway, uses yfinance
3. **Signal Calibration** (`SignalCalibrationFunction`): Weekly publisher reliability scoring - EventBridge scheduled (Sunday midnight UTC), no API Gateway route

```text
backend/
├── src/                 # Node.js Lambdas
│   ├── index.ts         # API Lambda entry point
│   ├── calibration.entry.ts # Signal Calibration Lambda entry point
│   ├── handlers/        # Route handlers
│   ├── services/        # Business logic
│   ├── repositories/    # DynamoDB data access
│   └── ml/              # Server-side ML components
├── python/              # Python Lambda
│   ├── handlers/
│   ├── services/
│   └── repositories/
└── template.yaml        # SAM CloudFormation template
```

**DynamoDB Entity Types**:

| PK          | SK                | Purpose                      |
| ----------- | ----------------- | ---------------------------- |
| `STOCK#XYZ` | `DATE#YYYY-MM-DD` | Stock price cache            |
| `NEWS#XYZ`  | `HASH#abc123`     | News articles                |
| `SENT#XYZ`  | `HASH#abc123`     | Sentiment analysis cache     |
| `DAILY#XYZ` | `DATE#YYYY-MM-DD` | Daily sentiment aggregates   |
| `HIST#XYZ`  | `DATE#YYYY-MM-DD` | Historical price data (ML)   |
| `EARN#XYZ`  | `DATE#YYYY-MM-DD` | Earnings calendar (24h TTL)  |
| `ETF#XLK`   | `HOLDINGS`        | Top 10 ETF holdings (7d TTL) |
| `MODEL#XYZ` | `WEIGHTS#d{days}` | ML model weights cache       |

## Testing Notes

- **Frontend tests**: Jest + React Native Testing Library, mocks in `frontend/__mocks__/`
- **Backend tests**: Jest with ESM support (`--experimental-vm-modules`)
- **Backend E2E tests**: Real DynamoDB via MiniStack (`make ministack && make test-e2e`)
- **Python tests**: pytest in `backend/python_tests/`
- **Coverage thresholds**: Frontend 49% branches / 57% functions / 55% lines / 55% statements (`frontend/jest.config.js`), Backend 76% branches / 91% functions / 87% lines / 87% statements (`backend/jest.config.js`). The jest configs are the source of truth; each carries the measured actuals it was ratcheted from in a comment above the block.
- **Hooks**: `.husky/pre-commit` runs lint-staged (Prettier on TS/JSON/MD, ruff on Python). `.husky/commit-msg` runs commitlint. A rejected commit message comes from `commit-msg`, not `pre-commit`.
- **Commit messages**: Enforced conventional commits via commitlint

## Environment Variables

Frontend `.env` (auto-updated by backend deploy):

```dotenv
EXPO_PUBLIC_BACKEND_URL=https://xxx.execute-api.region.amazonaws.com
EXPO_PUBLIC_BROWSER_SENTIMENT=true
EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true
EXPO_PUBLIC_LOG_LEVEL=warn
```

Backend `.env.deploy`:

```dotenv
FINNHUB_API_KEY=your_key
ALLOWED_ORIGINS=*
```

Full list with all optional variables: [docs/API.md — Environment Variables](docs/API.md#environment-variables)

## Code Quality Tools

- **knip**: TypeScript dead code detection
- **vulture**: Python dead code detection (whitelist in `backend/vulture_whitelist.py`)
- **ruff**: Python linting (use `uvx ruff check`)
- **ESLint**: TypeScript linting (via Expo config)

## Security Decisions

Intentional design choices. Automated reviewers may flag these — this documents the rationale.

### No API Authentication (Intentional)

The API has no authentication by design. This is a community application with:

- **No user accounts or private data** - All data is publicly available stock information
- **Read-only/compute-only endpoints** - No destructive operations possible
- **Cost bounded** - Lambda concurrency limits and CloudWatch alarms prevent abuse

### CORS AllowedOrigins Parameterization

The default `AllowedOrigins: '*'` in `template.yaml` is intentional:

- Configurable via `ALLOWED_ORIGINS` in `.env.deploy` for production lockdown
- With no authentication, CORS provides no security benefit (nothing to protect via same-origin policy)
- The wildcard default simplifies local development and demo deployments

### Prediction Claims

Predictions are computed **server-side only** (`POST /predict`). The browser-side
predictor was removed: it trained a second model per stock view that labelled a
different target than the backend, so the model and the UI disagreed about what
was being predicted.

Do not reintroduce client-side training. The backend caches trained weights per
ticker, so its cost amortises across requests; browser training is repeated in
full by every user on every view and none of it is reusable.

A horizon the model cannot stand behind is withheld, not filled in. A horizon
below the walk-forward cross-validation floor, or with too few labelled rows to
validate, is absent from the `/predict` response rather than defaulted to a coin
flip. On a 90-day history window the 30-day horizon is unvalidatable by
arithmetic and is routinely absent, so callers must treat a missing horizon as
normal rather than as an error.

Model output is labelled experimental and carries a disclaimer wherever it
renders (`PredictionDisclaimer`). Measured out-of-sample accuracy is near chance
on price-only features, so presenting it as a price forecast is not
supportable.
