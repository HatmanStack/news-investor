# backend

AWS Lambda functions and one DynamoDB table, deployed as a single SAM stack.
Two runtimes: Node.js under `src/` (news, sentiment, predictions, and in the pro
edition every per-user endpoint) and Python under `python/` (stock data, search,
earnings via yfinance).

`grep -c 'Type: AWS::Serverless::Function' template.yaml` tells you how many
functions this checkout declares — nine in the pro edition, three in the
community one.

Run commands from `backend/` unless noted.

## Build and test

```bash
npm run build            # esbuild, one bundle per Lambda entry point
npm run type-check
npm run lint
npm test                 # Jest with ESM support
npm test -- --testPathPatterns=sentiment    # PLURAL flag; jest 30 renamed it
npm run test:integration
```

From the repo root: `npm run test:python` (run `make setup-python` once first, or
you get `No module named pytest`), and
`make ministack && make test-e2e && make ministack-stop` for E2E against a real
DynamoDB.

## Deploy

```bash
npm run deploy           # scripts/deploy.sh — SAM build + deploy
npm run logs
npm run warm-cache
```

`deploy.sh` reads `backend/.env.deploy` and writes the resulting API and Cognito
values into `frontend/.env`. Two settings are optional and fail **silently** when
omitted: `ALARM_EMAIL`, without which every CloudWatch alarm in the stack changes
state and notifies nobody, and (pro only) `FINNHUB_WEBHOOK_SECRET`, without which
the ingestion webhook answers 503 to every event until Finnhub disables the
endpoint. Both are documented in [`.env.example`](../.env.example).

## Layout

`*.entry.ts` at the top of `src/` is a Lambda entry point, one per
`AWS::Serverless::Function` in `template.yaml`. The layering conventions below
that — handlers, services, repositories — are written down in
[docs/ARCHITECTURE.md's file map](../docs/ARCHITECTURE.md#file-map).

## Sync

This file ships to the community edition, so it avoids stating anything true of
only one of them. Pro-only handlers, services and repositories are excluded from
the community edition; `template.yaml`, `index.ts`, `package.json` and a few
handlers have community replacements under `.sync/overlays/`. **Change an
overlaid file and you must change its overlay in the same commit** —
`./scripts/overlay-staleness.sh --changed-since $(git merge-base origin/main HEAD)`
enforces it.

## More

- [docs/API.md](../docs/API.md) — endpoints with auth and entitlements, DynamoDB schema, env vars
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — sentiment pipeline, prediction model, per-Lambda detail
- [docs/FINNHUB_WEBHOOK.md](../docs/FINNHUB_WEBHOOK.md) — the ingestion webhook
