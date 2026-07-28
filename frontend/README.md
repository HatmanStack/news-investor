# frontend

The Expo / React Native app: iOS, Android and web from one codebase. It gathers
and renders data. It does not train models — predictions come from the backend's
`POST /predict`.

Run every command from the repo root unless noted; this is an npm workspace and
dependencies are hoisted.

## Run it

```bash
npm start          # Expo dev server, then press a / i / w
npm run android
npm run ios
npm run web
```

Needs `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env`. `backend/scripts/deploy.sh`
and `backend/scripts/update-env.sh` write it from the stack outputs; see
[`.env.example`](../.env.example) for the full set.

## Test it

```bash
npm test                                                   # from the repo root
npm test -- frontend/src/hooks/__tests__/useChartData.test.ts
npm run lint                                               # ESLint + tsc
cd frontend && npm run test:watch                          # TDD loop
```

Tests are Jest + React Native Testing Library, co-located in `__tests__/`
directories. Shared mocks live in `frontend/__mocks__/`.

## Layout

`app/` is Expo Router file-based routing; `src/` is everything else. The
platform seam is `src/database/`: a `StorageAdapter` interface with a SQLite
implementation for native and a localStorage one for web, behind repositories.
`@/` resolves to `src/`.

## Sync

This file ships to the community edition, as does most of this workspace. Auth
screens, the tier system and the pro-only sync services are in
`.sync/config.json`'s `exclude_paths`; a handful of files (`app/_layout.tsx`,
`src/config/environment.ts`, `src/features/tier/index.ts` and others) have
community replacements under `.sync/overlays/`. **Change an overlaid file and
you must change its overlay in the same commit** — `./scripts/overlay-staleness.sh
--changed-since $(git merge-base origin/main HEAD)` enforces it.

## More

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — data flow, prediction model, file map
- [docs/API.md](../docs/API.md) — the endpoints this app calls
- [CONTRIBUTING.md](../CONTRIBUTING.md) — setup, the local gate, PR flow
