# Contributing

## Getting Started

### Prerequisites

- Node.js 24+ (via nvm)
- Python 3.13 (via uv)
- Docker (for E2E tests and MiniStack)

### Quick Setup

```bash
make dev
```

`make dev` runs `make setup` (which runs `make setup-python`, then
`npm install --legacy-peer-deps`) and starts MiniStack for local DynamoDB.

`make setup-python` installs the Python toolchain into an already-active
virtualenv, or creates `./.venv` if none is active. Without it, every Python
command below fails on a fresh clone with `No module named pytest`.

### Running Tests

```bash
npm run check          # The local gate — see below for what it does and does not cover
npm test               # Frontend tests only
npm run test:backend   # Backend TS tests only
npm run test:python    # Python tests (picks the right interpreter for you)
```

To run `pytest` directly, activate the virtualenv first:

```bash
source .venv/bin/activate
PYTHONPATH=backend/python pytest backend/python_tests/
```

### What `npm run check` covers

In order, from the `check` script in the root `package.json`:

`format:check` → `lint` (frontend ESLint + tsc) → `lint:backend` → `lint:ml` →
`lint:docs` → `lint:python-types` → `knip` → frontend tests with coverage →
backend tests with coverage → `test:python` → `verify:bundles` →
`check-console-calls.sh`.

The script also calls `check:admin` and `check:sync`; both guard on a directory
that does not exist in this edition, so both print a skip message and pass.

**Four things it deliberately does not run**, because each fails for
environmental rather than code reasons: E2E (needs Docker), the lychee link
check (external binary and network), shellcheck (external binary), and vulture
(a Python tool `npm run hygiene` skips when absent). **CI runs all four.**

```bash
make check-full   # npm run check plus those four
```

## Branch Strategy

- Create feature branches from `main`: `feat/description`, `fix/description`, `refactor/description`
- PRs target `main`
- Squash merge to keep history clean

## PR Process

1. Run `npm run check` before opening a PR, and `make check-full` if you have
   Docker — see "What `npm run check` covers" above for the four things CI runs
   that `check` does not
2. Write descriptive PR titles using conventional commit format
3. Include test coverage for new code

## Commit Messages

Follow conventional commits:

- `feat(scope):` -- new feature
- `fix(scope):` -- bug fix
- `refactor(scope):` -- code restructuring
- `test(scope):` -- adding or updating tests
- `chore(scope):` -- maintenance tasks

Enforced by commitlint on the Husky **`commit-msg`** hook (`.husky/commit-msg`).
The `pre-commit` hook runs lint-staged instead — Prettier on TS/JSON/Markdown and
ruff on Python. If a commit is rejected for its message, `commit-msg` is the file
to look at; if it is rejected for formatting, `pre-commit` is.

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
# Backend
cd backend && npm test -- --testPathPatterns=sentiment

# Python
source .venv/bin/activate
PYTHONPATH=backend/python pytest backend/python_tests/ -k "test_name"
```

Note the **plural** `--testPathPatterns`. Jest 30 renamed the flag and this repo
is on 30.3.0; the jest-29 singular spelling exits 1. The `source` line is not
optional either — a bare `pytest` picks whatever is on `PATH`.

## Code Quality

- **Dead code detection**: `npm run hygiene` (runs knip + vulture)
- **Formatting**: Automatic via Prettier (TS/JSON/MD) and ruff (Python) on commit
- **Linting**: `npm run lint` (frontend), `npm run lint:backend` (backend TS), `npm run lint:ml` (Python)

## Logging Discipline

Frontend code routes through `frontend/src/utils/logger.ts`. Backend uses
`backend/src/utils/logger.util.ts`. Raw `console.*` calls are budget-capped
per `scripts/check-console-calls.sh` -- new calls fail CI.

To lower the baseline:

1. Replace some `console.*` with the logger utility and verify locally.
1. Run `./scripts/check-console-calls.sh`; capture the new count.
1. Update the `BASELINE` constant in the script header.
1. Commit with `chore(hygiene): lower console-call baseline to N`.
