# Contributing

## Getting Started

### Prerequisites

- Node.js 24+ (via nvm)
- Python 3.13 (via uv)
- Docker (for E2E tests and LocalStack)

### Quick Setup

```bash
make dev
```

This installs dependencies and starts LocalStack for local DynamoDB.

### Running Tests

```bash
npm run check    # Full CI check (lint + all tests)
npm test         # Frontend tests only
npm run test:backend   # Backend TS tests only
PYTHONPATH=backend/python pytest backend/python_tests/   # Python tests
```

## Branch Strategy

- Create feature branches from `main`: `feat/description`, `fix/description`, `refactor/description`
- PRs target `main`
- Squash merge to keep history clean

## PR Process

1. Run `npm run check` before opening a PR (CI runs the same checks)
2. Write descriptive PR titles using conventional commit format
3. Include test coverage for new code

## Commit Messages

Follow conventional commits:

- `feat(scope):` -- new feature
- `fix(scope):` -- bug fix
- `refactor(scope):` -- code restructuring
- `test(scope):` -- adding or updating tests
- `chore(scope):` -- maintenance tasks

Enforced by commitlint via Husky pre-commit hook.

## Finding Tests

Tests use the `__tests__/` co-location pattern (next to the code they test):

| Area           | Pattern                                     |
| -------------- | ------------------------------------------- |
| Frontend       | `frontend/src/**/__tests__/*.test.{ts,tsx}` |
| Backend TS     | `backend/src/**/__tests__/*.test.ts`        |
| Backend Python | `backend/python_tests/*.py`                 |
| E2E            | `backend/e2e/*.test.ts`                     |

Run a single test file:

```bash
# Frontend
npm test -- frontend/src/hooks/__tests__/useChartData.test.ts

# Backend
cd backend && npm test -- --testPathPattern=sentiment

# Python
PYTHONPATH=backend/python pytest backend/python_tests/ -k "test_name"
```

## Code Quality

- **Dead code detection**: `npm run hygiene` (runs knip + vulture)
- **Formatting**: Automatic via Prettier (TS/JSON/MD) and ruff (Python) on commit
- **Linting**: `npm run lint` (frontend), `npm run lint:backend` (backend TS), `npm run lint:ml` (Python)
