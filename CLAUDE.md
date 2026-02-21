# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Community Edition** — This is the open-source NewsInvestor community edition.
> The pro edition with additional features is at [news-investor-pro](https://github.com/HatmanStack/news-investor-pro).

## Build & Development Commands

```bash
# Root monorepo commands
npm install --legacy-peer-deps  # Install all dependencies
npm test                         # Run frontend tests
npm run test:backend             # Run backend tests
npm run lint                     # Lint frontend (expo lint + tsc)
npm run lint:backend             # Lint backend TypeScript
npm run lint:ml                  # Lint Python ML code (ruff)
npm run check                    # Full CI check (all lint + all tests)
npm run hygiene                  # Dead code detection (knip + vulture)

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
make localstack                  # Start LocalStack DynamoDB
make localstack-stop             # Stop LocalStack
make test-e2e                    # Run E2E tests against LocalStack
make setup                       # npm install --legacy-peer-deps
make test                        # Full check (lint + tests)
```

### Running Single Tests

```bash
# Frontend - run single test file
npm test -- frontend/src/hooks/__tests__/useChartData.test.ts

# Backend - run single test file
cd backend && npm test -- --testPathPattern=sentiment

# Python tests
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
│   ├── hooks/           # Custom hooks (useStockData, usePortfolio, useSentimentData)
│   ├── services/api/    # API client layer
│   ├── database/        # Platform abstraction (SQLite native, localStorage web)
│   │   ├── database.ts      # Native SQLite implementation
│   │   ├── database.web.ts  # Web localStorage implementation
│   │   └── repositories/    # Repository pattern for data access
│   ├── ml/              # Browser-side ML (sentiment analysis, predictions)
│   └── components/      # Reusable UI components
```

**Key Patterns**:

- **Platform Abstraction**: `database.ts` vs `database.web.ts` - bundler resolves `.web.ts` for web builds
- **Repository Pattern**: All data access through `src/database/repositories/`
- **TanStack Query**: Used for API caching and data synchronization
- **Path Aliases**: `@/` maps to `src/` (configured in tsconfig.json)

### Backend (AWS SAM + Lambda)

Two Lambda functions sharing API Gateway and a single DynamoDB table (composite keys):

1. **Node.js** (`ReactStocksFunction`): News, sentiment, prediction - built via esbuild
2. **Python** (`PythonStocksFunction`): Stock data, search - uses yfinance

```text
backend/
├── src/                 # Node.js Lambda
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

## Testing Notes

- **Frontend tests**: Jest + React Native Testing Library, mocks in `frontend/__mocks__/`
- **Backend tests**: Jest with ESM support (`--experimental-vm-modules`)
- **Backend E2E tests**: Real DynamoDB via LocalStack (`make localstack && make test-e2e`)
- **Python tests**: pytest in `backend/python_tests/`
- **Coverage thresholds**: Frontend 50% (branches/functions/lines/statements), Backend 60% branches / 70% functions/lines/statements
- **Pre-commit hooks**: Husky runs Prettier (TS/JSON/MD) and ruff (Python) via lint-staged
- **Commit messages**: Enforced conventional commits via commitlint

## Environment Variables

Frontend `.env` (auto-updated by backend deploy):

```dotenv
EXPO_PUBLIC_BACKEND_URL=https://xxx.execute-api.region.amazonaws.com
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

### Development Instrumentation

The prediction service includes ANOVA F-test diagnostics (`computeFeatureFStats` in `frontend/src/ml/prediction/prediction.service.ts`):

- **Purpose**: Feature importance analysis during model development
- **Output**: Console logging for developer inspection, NOT shown to end users
- **Control**: Logging verbosity controlled by `LOG_LEVEL` environment variable
