# Phase 0: Foundation

This phase establishes architecture decisions, conventions, and strategies that apply across all implementation phases. Every engineer should read this document before starting any phase.

---

## Architecture Decision Records (ADRs)

### ADR-001: Two-Repo Sync Pattern (rsync + overlays)

**Context:** We need a free community edition and a paid pro edition sharing 95%+ of the same codebase.

**Decision:** Use a one-way sync from the private `news-investor-pro` repo to the public `news-investor` repo via rsync, file exclusions, and file overlays. This is the same pattern used by `warmreach-pro` -> `warmreach`.

**Rationale:**
- Single codebase for all shared logic (no feature branches, no conditional compilation)
- Pro-only files are excluded from sync entirely
- Files that differ between editions (e.g., SAM template, app layout) are replaced with "overlay" versions during sync
- Community overlays use no-op stubs with identical interfaces (e.g., `TierProvider` that returns `tier: 'community'` with all features enabled)
- Automated via GitHub Actions on every push to `main`

**Alternatives rejected:**
- Feature branches: Drift over time, merge conflicts
- Runtime feature flags only: Pro code still ships to community users
- Separate codebases: Maintenance nightmare

### ADR-002: AWS Cognito for Authentication

**Context:** We need user identity to track tiers and enforce usage quotas.

**Decision:** AWS Cognito User Pools with email-based authentication, deployed via SAM template alongside existing infrastructure.

**Rationale:**
- Already proven in warmreach-pro
- Deploys alongside existing SAM stack (no separate infrastructure)
- API Gateway v2 has native JWT authorizer support for Cognito
- `amazon-cognito-identity-js` is pure JS and works with Expo on all platforms (web, iOS, Android) without native modules
- Free tier: 50,000 MAU included

**Alternatives rejected:**
- API keys: No user management, no password reset, no email verification
- Firebase Auth: Mixes AWS and Google infrastructure
- Auth0: Additional vendor dependency and cost

### ADR-003: Auth-Optional Architecture

**Context:** Current app has zero authentication. Adding auth should not break the existing experience.

**Decision:** Authentication is optional. All existing endpoints remain public. Auth is only required for new `/auth/*` endpoints. When a JWT is present on existing endpoints, the backend uses it to look up tier for quota enforcement; when absent, the request proceeds without tier checks.

**Rationale:**
- Zero-friction for existing and community edition users
- Community edition overlay simply removes auth providers; app works identically
- Pro users who aren't logged in still get the full free experience
- Gradual adoption: users can explore before creating an account

### ADR-004: Tier Infrastructure Without Billing

**Context:** We want to separate the tier/feature-flag system from payment processing.

**Decision:** Implement tier tracking (DynamoDB `USER#` entities), feature flags, and quota enforcement now. Defer Stripe integration to a future phase.

**Rationale:**
- Tier system is the prerequisite for all pro features
- Can manually upgrade users during beta/testing
- Stripe webhook integration follows the warmreach-pro pattern exactly when ready
- Keeps this implementation focused and shippable

### ADR-005: DynamoDB Single-Table Extension for User Entities

**Context:** Need to store user tiers and daily usage quotas.

**Decision:** Add `USER#` entity types to the existing single-table design.

**New entities:**

| PK | SK | Purpose | TTL |
|----|-----|---------|-----|
| `USER#{cognitoSub}` | `TIER` | User tier info + feature flags | None |
| `USER#{cognitoSub}` | `QUOTA#YYYY-MM-DD` | Daily usage counters | 2 days |

**Rationale:**
- Extends existing single-table pattern (no new tables)
- Quota records auto-expire via TTL
- User sub (Cognito ID) is the universal identifier

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Expo Router + React Native Paper | Existing |
| Backend | AWS SAM (Node.js 24 + Python 3.13 Lambdas) | Existing |
| Database | DynamoDB (single-table design) | Existing, extended with USER# entities |
| Auth | AWS Cognito User Pools | New |
| Auth (frontend) | `amazon-cognito-identity-js` | Pure JS, Expo-compatible |
| API Auth | API Gateway v2 JWT Authorizer | New, Cognito-issued tokens |
| Sync | rsync + bash + GitHub Actions | New, mirrors warmreach-pro |

---

## Shared Patterns and Conventions

### Import Paths

Frontend uses `@/` path alias mapping to `src/`:
```
import { useTier } from '@/features/tier';
import { AuthProvider } from '@/contexts/AuthContext';
```

### Service Pattern (Backend)

All backend services follow this pattern (see `backend/src/services/` for examples):
```typescript
// Export named functions, not classes (unless stateful)
export function getTierForUser(userSub: string): Promise<TierInfo> { ... }
```

### Repository Pattern (Backend)

DynamoDB access goes through repository files (see `backend/src/repositories/` for examples). All repositories import shared utilities from `backend/src/utils/dynamodb.util.ts` which provides:
- A shared `DynamoDBDocumentClient` instance (reused across Lambda invocations)
- Helper functions: `getItem`, `putItem`, `putItemConditional`, `queryItems`, `updateItem`, `batchGetItemsSingleTable`, `batchPutItemsSingleTable`
- Table name resolution via `getTableName()` (reads `DYNAMODB_TABLE_NAME` env var)

```typescript
// Example: import shared utilities (see newsCache.repository.ts for reference)
import { getItem, putItem, putItemConditional, updateItem } from '../utils/dynamodb.util.js';
```

Never initialize a DynamoDB client directly in repository files -- always use the shared utility.

### Handler Pattern (Backend)

Each handler file exports named async functions matching the route (see `backend/src/handlers/`):
```typescript
export async function handleTierRequest(event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> { ... }
```

### Context Pattern (Frontend)

React contexts follow the pattern in `frontend/src/contexts/StockContext.tsx`:
- Provider component wrapping children
- Custom hook for consuming context
- Types exported from the same file

### Overlay Pattern (Sync)

When a file needs to differ between pro and community editions:
1. The pro version lives at its normal path (e.g., `frontend/app/_layout.tsx`)
2. The community version lives at `.sync/overlays/frontend/app/_layout.tsx`
3. During sync, the overlay replaces the pro version in the public repo
4. Community overlays must maintain identical exports/interfaces

### Feature Gate Pattern (Frontend)

```tsx
import { FeatureGate } from '@/features/tier';

// Renders children if feature enabled, otherwise shows UpgradePrompt
<FeatureGate feature="full_article_body">
  <FullArticleView article={article} />
</FeatureGate>
```

Community edition stub: `FeatureGate` always renders children (all features enabled).

---

## Deployment Strategy

### Backend Deployment

Uses existing `sam build && sam deploy` pipeline. The Cognito resources are added to `backend/template.yaml` and deploy alongside existing Lambda functions, DynamoDB table, and API Gateway.

New SAM outputs after deployment:
- `CognitoUserPoolId`
- `CognitoUserPoolClientId`

These values must be added to `frontend/.env` as `EXPO_PUBLIC_COGNITO_USER_POOL_ID` and `EXPO_PUBLIC_COGNITO_CLIENT_ID`.

### Sync Deployment

After setting up the GitHub Actions workflow and deploy key:
- Every push to `main` in `news-investor-pro` triggers the sync
- The sync script runs in CI, not locally
- Local testing: `.sync/sync.sh --public-repo <path> --dry-run`

---

## Testing Strategy

### Frontend Tests

- **Framework:** Jest + React Native Testing Library (existing)
- **Config:** `frontend/jest.config.js`
- **Run:** `npm test` (from monorepo root) or `npm test -- <path>` for single file
- **Mocking:** All external services mocked. Cognito service mocked via `jest.mock('@/services/auth/cognito.service')`. TierContext mocked by wrapping test components in a test `TierProvider` with controlled values.
- **New test files follow existing pattern:** `frontend/src/<module>/__tests__/<name>.test.ts`

### Backend Tests

- **Framework:** Jest with ESM support
- **Config:** `backend/jest.config.ts`
- **Run:** `npm run test:backend` or `cd backend && npm test -- --testPathPattern=<pattern>`
- **Mocking:** DynamoDB mocked via `jest.mock` on the DynamoDB client. No live AWS resources in unit tests.
- **New test files follow colocated pattern:** `backend/src/<module>/__tests__/<name>.test.ts` (e.g., `backend/src/services/__tests__/tier.service.test.ts`, `backend/src/handlers/__tests__/auth.handler.test.ts`)

### Sync Testing

- **Manual:** Run `.sync/sync.sh --public-repo <local-clone> --dry-run` and inspect output
- **Verification:** After sync, run `cd <public-clone> && npm install --legacy-peer-deps && npm run check` to confirm the community edition builds, lints, and passes all tests
- **CI:** The GitHub Actions workflow handles this automatically after setup

### Integration Testing

No live cloud resources in tests. All Cognito interactions are mocked. DynamoDB interactions use mocked client calls. The auth middleware is tested by constructing mock API Gateway events with/without JWT claims in `event.requestContext.authorizer.jwt.claims`.

---

## Commit Message Format

Conventional commits enforced by commitlint (already configured in the repo):

```
type(scope): brief description

- Detail 1
- Detail 2
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`, `ci`

**Scopes for this project:**
- `auth` - Cognito authentication
- `tier` - Tier/feature-flag system
- `sync` - Sync infrastructure
- `rebrand` - Naming/branding changes
- `api` - Backend API changes
- `ui` - Frontend UI changes

**Do NOT include `Co-Authored-By` or `Generated-By` lines.**

---

## File Organization Reference

```
news-investor-pro/
├── .sync/
│   ├── config.json              # Excluded paths + overlay mappings
│   ├── sync.sh                  # Sync script
│   └── overlays/                # Community edition file replacements
│       ├── frontend/
│       │   ├── app/_layout.tsx
│       │   ├── app/(tabs)/_layout.tsx
│       │   └── src/
│       │       ├── config/environment.ts
│       │       └── features/tier/index.ts
│       ├── backend/
│       │   ├── template.yaml
│       │   └── src/index.ts
│       ├── docs/
│       │   ├── ARCHITECTURE.md
│       │   └── API.md
│       ├── CLAUDE.md
│       └── README.md
├── .github/workflows/
│   └── sync-public.yml          # Auto-sync on push to main
├── frontend/
│   ├── app/
│   │   ├── (auth)/              # Pro only (excluded from sync)
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx
│   │   │   ├── signup.tsx
│   │   │   ├── confirm.tsx
│   │   │   └── forgot-password.tsx
│   │   └── (tabs)/
│   │       └── settings.tsx     # Pro only (excluded from sync)
│   └── src/
│       ├── contexts/
│       │   └── AuthContext.tsx   # Pro only (excluded from sync)
│       ├── features/tier/
│       │   ├── index.ts         # Barrel export (overlayed in community)
│       │   ├── contexts/        # Pro only (excluded from sync)
│       │   ├── components/      # Pro only (excluded from sync)
│       │   └── hooks/           # Pro only (excluded from sync)
│       └── services/auth/
│           └── cognito.service.ts  # Pro only (excluded from sync)
├── backend/src/
│   ├── middleware/
│   │   ├── auth.middleware.ts           # Pro only (excluded from sync)
│   │   └── __tests__/
│   │       └── auth.middleware.test.ts  # Pro only (excluded from sync)
│   ├── handlers/
│   │   ├── auth.handler.ts             # Pro only (excluded from sync)
│   │   └── __tests__/
│   │       └── auth.handler.test.ts    # Pro only (excluded from sync)
│   ├── services/
│   │   ├── tier.service.ts             # Pro only (excluded from sync)
│   │   ├── quota.service.ts            # Pro only (excluded from sync)
│   │   ├── featureFlag.service.ts      # Pro only (excluded from sync)
│   │   └── __tests__/
│   │       ├── tier.service.test.ts          # Pro only
│   │       ├── quota.service.test.ts         # Pro only
│   │       └── featureFlag.service.test.ts   # Pro only
│   └── repositories/
│       ├── user.repository.ts           # Pro only (excluded from sync)
│       └── __tests__/
│           └── user.repository.test.ts  # Pro only (excluded from sync)
└── docs/
    └── PRO_FEATURES_ROADMAP.md  # Pro only (excluded from sync)
```
