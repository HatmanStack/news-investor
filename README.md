# NewsInvestor - React Native

Cross-platform news-driven stock sentiment analysis and market predictions. React Native + Expo frontend, AWS Lambda backend.

> **Active Development** — This repo changes frequently. Expect breaking changes.

> **Community Edition** — All core features are free and open-source.
> [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro) adds premium content access, higher usage quotas, and advanced features.

## Quick Start

```bash
git clone https://github.com/HatmanStack/news-investor.git
cd news-investor
npm install --legacy-peer-deps
make localstack            # Start LocalStack DynamoDB
make test-e2e              # Verify setup
npm start                  # Expo dev server
```

Press `a` (Android), `i` (iOS), or `w` (Web) in the terminal, or scan the QR code with Expo Go.

## Prerequisites

- Node.js v24 LTS (see `.nvmrc`)
- Python 3.13 (backend Lambda + linting)
- Docker (LocalStack for local DynamoDB)
- AWS CLI v2+ and SAM CLI v1.70.0+ (deployment only)

## Commands

### Development

| Command           | Description     |
| ----------------- | --------------- |
| `npm start`       | Expo dev server |
| `npm run android` | Run on Android  |
| `npm run ios`     | Run on iOS      |
| `npm run web`     | Run on Web      |

### Testing

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `npm test`             | Frontend tests                  |
| `npm run test:backend` | Backend unit tests (Jest + ESM) |
| `npm run test:e2e`     | E2E tests (requires LocalStack) |
| `npm run check`        | Full CI: all lint + all tests   |

### Code Quality

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run lint`         | Frontend lint (strict, 0 warnings)   |
| `npm run lint:backend` | Backend lint + type-check            |
| `npm run lint:ml`      | Python lint (ruff)                   |
| `npm run format`       | Format all files (Prettier)          |
| `npm run hygiene`      | Dead code detection (knip + vulture) |

### Makefile

| Target                 | Description                      |
| ---------------------- | -------------------------------- |
| `make setup`           | `npm install --legacy-peer-deps` |
| `make localstack`      | Start LocalStack DynamoDB        |
| `make localstack-stop` | Stop LocalStack                  |
| `make test-e2e`        | Run E2E tests                    |
| `make lint`            | Run all linters                  |
| `make test`            | Full check (`npm run check`)     |

### Backend Deployment

```bash
cd backend
npm run deploy             # SAM deployment (prompts for API keys)
npm run logs               # View Lambda logs
npm run warm-cache         # Pre-populate DynamoDB cache
```

## Architecture

Monorepo (npm workspaces): `frontend/` (Expo/React Native) + `backend/` (AWS Lambda).

- **Frontend**: Expo Router file-based routing, React Native Paper UI, TanStack Query, SQLite (native) / localStorage (web)
- **Backend**: Node.js Lambda (news, sentiment, predictions) + Python Lambda (stock data via yfinance), DynamoDB single-table design, API Gateway

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the sentiment pipeline and prediction model.
See [docs/API.md](docs/API.md) for endpoints, DynamoDB schema, and environment variables.

## Tech Stack

| Layer      | Technology                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| Core       | React Native 0.81.5, Expo ~54.0.23, TypeScript 5.9.2                         |
| Navigation | Expo Router ~6.0.14 (file-based)                                             |
| UI         | React Native Paper 5.14.5 (Material Design 3)                                |
| State      | React Context + TanStack Query 5.90.7                                        |
| Database   | Expo SQLite 16.0.9 (native) / localStorage (web)                             |
| Backend    | AWS Lambda (Node.js 24.x, Python 3.13) + API Gateway + DynamoDB              |
| APIs       | yfinance (stock data), Finnhub (news) via Lambda                             |
| ML         | Browser-based ensemble logistic regression + three-signal sentiment pipeline |
| Testing    | Jest 30.2.0 + React Native Testing Library + pytest                          |

## License

Apache License 2.0. See [LICENSE](LICENSE).
