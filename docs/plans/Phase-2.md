# Phase 2: Backend Cognito Auth + Tier/Quota Services

## Phase Goal

Add AWS Cognito authentication infrastructure to the backend SAM template, create auth middleware for extracting user identity from JWTs, and build the tier/quota/feature-flag services that enforce pro vs free limits. All existing endpoints remain public. New auth-required endpoints are added for tier lookups. The community overlay for `template.yaml` and `backend/src/index.ts` are updated to exclude Cognito resources and auth routes.

**Success criteria:**
- Cognito User Pool and Client deploy via `sam build && sam deploy`
- JWT Authorizer validates tokens on `/auth/*` routes
- `POST /auth/tier` returns user tier info (auto-provisions free tier)
- Tier, quota, and feature flag services work with unit tests
- Auth middleware extracts user identity from JWT claims
- Community overlay `template.yaml` has no Cognito resources
- Community overlay `index.ts` has no `/auth/*` routes
- `npm run check` passes (all existing tests still pass)

**Estimated tokens:** ~40,000

## Prerequisites

- Phase 1 complete (repos set up, sync pipeline working)
- AWS SAM CLI installed
- Familiarity with API Gateway v2 JWT authorizer pattern

---

## Task 1: Add Cognito Resources to SAM Template

**Goal:** Add a Cognito User Pool, User Pool Client, and JWT Authorizer to the existing SAM template so they deploy alongside the current infrastructure.

**Files to Modify/Create:**
- `backend/template.yaml` - Modify (add Cognito resources, auth routes, outputs, parameters)

**Prerequisites:**
- Read `backend/template.yaml` thoroughly before editing

**Implementation Steps:**

Add a new parameter after the existing `DistilFinBERTApiUrl` parameter:

```yaml
CognitoCallbackUrl:
  Type: String
  Description: Cognito callback URL for frontend
  Default: 'http://localhost:8081'
```

Add the following resources after the `ReactStocksTable` resource definition (before the API Gateway section):

**Cognito User Pool:**
```yaml
NewsInvestorUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: !Sub '${AWS::StackName}-users'
    AutoVerifiedAttributes:
      - email
    UsernameAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireLowercase: true
        RequireNumbers: true
        RequireUppercase: true
        RequireSymbols: false
    Schema:
      - Name: email
        Required: true
        Mutable: true
      - Name: name
        Required: false
        Mutable: true
```

**Cognito User Pool Client:**
```yaml
NewsInvestorUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: !Sub '${AWS::StackName}-client'
    UserPoolId: !Ref NewsInvestorUserPool
    ExplicitAuthFlows:
      - ALLOW_USER_SRP_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
    GenerateSecret: false
    PreventUserExistenceErrors: ENABLED
    AccessTokenValidity: 1
    IdTokenValidity: 1
    RefreshTokenValidity: 30
    TokenValidityUnits:
      AccessToken: hours
      IdToken: hours
      RefreshToken: days
```

**JWT Authorizer** (add after the API Gateway Stage):
```yaml
NewsInvestorJwtAuthorizer:
  Type: AWS::ApiGatewayV2::Authorizer
  Properties:
    ApiId: !Ref ReactStocksApi
    AuthorizerType: JWT
    Name: CognitoJWT
    IdentitySource: '$request.header.Authorization'
    JwtConfiguration:
      Audience:
        - !Ref NewsInvestorUserPoolClient
      Issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${NewsInvestorUserPool}'
```

**Auth route** (add after existing routes):
```yaml
AuthTierRoute:
  Type: AWS::ApiGatewayV2::Route
  Properties:
    ApiId: !Ref ReactStocksApi
    RouteKey: 'POST /auth/tier'
    Target: !Sub 'integrations/${ReactStocksIntegration}'
    AuthorizerId: !Ref NewsInvestorJwtAuthorizer
    AuthorizationType: JWT
```

**Outputs** (add to existing Outputs section):
```yaml
CognitoUserPoolId:
  Description: Cognito User Pool ID
  Value: !Ref NewsInvestorUserPool
  Export:
    Name: !Sub '${AWS::StackName}-UserPoolId'

CognitoUserPoolClientId:
  Description: Cognito User Pool Client ID
  Value: !Ref NewsInvestorUserPoolClient
  Export:
    Name: !Sub '${AWS::StackName}-UserPoolClientId'
```

**Add COGNITO_USER_POOL_ID env var to ReactStocksFunction:**

In the `ReactStocksFunction` `Environment.Variables` section, add:
```yaml
COGNITO_USER_POOL_ID: !Ref NewsInvestorUserPool
```

This lets the Lambda handler know the User Pool ID for any server-side validation needs.

**Verification Checklist:**
- [ ] `sam validate` passes on the updated template
- [ ] `sam build` succeeds
- [ ] All existing routes are unchanged
- [ ] New `AuthTierRoute` has `AuthorizationType: JWT`
- [ ] All existing routes do NOT have an AuthorizationType (remain public)
- [ ] CORS config already includes `Authorization` in `AllowHeaders` (verify -- it's already there in the current template)

**Testing Instructions:**
- Run `sam validate --template backend/template.yaml`
- Run `sam build` from `backend/`
- Run `npm run test:backend` to confirm existing tests pass

**Commit Message Template:**
```
feat(auth): add Cognito User Pool and JWT authorizer to SAM template

- Add User Pool with email auth and password policy
- Add User Pool Client (SRP auth, no secret)
- Add JWT Authorizer for API Gateway v2
- Add POST /auth/tier route with JWT auth
- Add Cognito outputs for frontend config
```

---

## Task 2: Update CORS Response Headers

**Goal:** Ensure the `Authorization` header is included in CORS `Access-Control-Allow-Headers` so browsers can send JWT tokens in requests.

**Files to Modify/Create:**
- `backend/src/utils/response.util.ts` - Modify

**Prerequisites:**
- Read `backend/src/utils/response.util.ts`

**Implementation Steps:**

In the `getCorsHeadersInternal()` function, update the `Access-Control-Allow-Headers` value from `'Content-Type'` to `'Content-Type, Authorization'`.

The current line:
```typescript
'Access-Control-Allow-Headers': 'Content-Type',
```

Should become:
```typescript
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
```

Note: The SAM template's API Gateway CORS config (`AllowHeaders`) already includes `Authorization`. This change makes the Lambda responses consistent with it.

**Verification Checklist:**
- [ ] `getCorsHeadersInternal()` returns `Authorization` in `Access-Control-Allow-Headers`
- [ ] `npm run test:backend` passes

**Testing Instructions:**
- Run `npm run test:backend`
- If there are tests that assert on CORS headers, update them to include `Authorization`

**Commit Message Template:**
```
fix(api): add Authorization to CORS allowed headers

- Ensure browsers can send JWT tokens in cross-origin requests
```

---

## Task 3: Create Auth Middleware

**Goal:** Create middleware functions that extract user identity from API Gateway JWT claims, with both required and optional variants.

**Files to Modify/Create:**
- `backend/src/middleware/auth.middleware.ts` - New file
- `backend/src/middleware/__tests__/auth.middleware.test.ts` - New test file

**Prerequisites:**
- Understand API Gateway v2 JWT authorizer claim structure

**Implementation Steps:**

Create `backend/src/middleware/auth.middleware.ts`:

The middleware needs three exports:

1. `AuthUser` interface:
   ```typescript
   export interface AuthUser {
     sub: string;      // Cognito user ID
     email: string;    // User email
   }
   ```

2. `extractUserFromEvent(event: APIGatewayProxyEventV2): AuthUser | null` -- Extracts user from JWT claims. API Gateway v2 puts validated JWT claims at `event.requestContext.authorizer?.jwt?.claims`. Return `null` if claims are missing or `sub` is absent.

3. `requireAuth(event: APIGatewayProxyEventV2): AuthUser` -- Calls `extractUserFromEvent`. If null, throws an error (import or create a simple error class) that results in a 401 response. The caller (handler) catches this.

4. `optionalAuth(event: APIGatewayProxyEventV2): AuthUser | null` -- Alias for `extractUserFromEvent`. Exists for readability at call sites.

**Testing:**

Create `backend/src/middleware/__tests__/auth.middleware.test.ts`:

Test cases:
- `extractUserFromEvent` returns user when JWT claims present with `sub` and `email`
- `extractUserFromEvent` returns null when no authorizer in event
- `extractUserFromEvent` returns null when claims missing `sub`
- `requireAuth` returns user when claims present
- `requireAuth` throws when no claims
- `optionalAuth` returns null gracefully when no claims

Construct mock events as plain objects matching the `APIGatewayProxyEventV2` shape with `requestContext.authorizer.jwt.claims` populated or absent.

**Verification Checklist:**
- [ ] `auth.middleware.ts` compiles without errors (`cd backend && npm run type-check`)
- [ ] All test cases pass (`npm run test:backend -- --testPathPattern=middleware/__tests__/auth.middleware`)
- [ ] Exports: `AuthUser`, `extractUserFromEvent`, `requireAuth`, `optionalAuth`

**Testing Instructions:**
- `cd backend && npm test -- --testPathPattern=middleware/__tests__/auth.middleware`

**Commit Message Template:**
```
feat(auth): add JWT auth middleware

- Extract user identity from API Gateway JWT claims
- requireAuth throws on missing auth, optionalAuth returns null
- Add comprehensive unit tests
```

---

## Task 4: Create User Repository

**Goal:** Create the DynamoDB repository for USER# entities (tier info and daily quota tracking).

**Files to Modify/Create:**
- `backend/src/repositories/user.repository.ts` - New file
- `backend/src/repositories/__tests__/user.repository.test.ts` - New test file

**Prerequisites:**
- Read existing repository files in `backend/src/repositories/` to follow the established pattern (e.g., `newsCache.repository.ts`, `sentimentCache.repository.ts`)
- Read `backend/src/utils/dynamodb.util.ts` to understand the shared utility functions available
- Understand the DynamoDB single-table schema (PK/SK pattern)

**Implementation Steps:**

Create `backend/src/repositories/user.repository.ts`:

**Import the shared DynamoDB utilities** following the pattern in existing repositories (see `newsCache.repository.ts` line 8-14):
```typescript
import { getItem, putItemConditional, updateItem } from '../utils/dynamodb.util.js';
```

Do NOT create a new DynamoDB client or read `process.env.DYNAMODB_TABLE_NAME` directly -- the shared utility handles this.

The repository manages two entity types:

**USER#sub | TIER** -- User tier record:
```typescript
interface UserTierRecord {
  pk: string;           // USER#{sub}
  sk: string;           // TIER
  tier: string;         // 'free' | 'pro'
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}
```

**USER#sub | QUOTA#YYYY-MM-DD** -- Daily usage record:
```typescript
interface UsageRecord {
  pk: string;           // USER#{sub}
  sk: string;           // QUOTA#YYYY-MM-DD
  searches: number;     // Daily search count
  sentimentAnalyses: number; // Daily sentiment analysis count
  ttl: number;          // Unix timestamp, 2 days from creation
}
```

Export these functions:

1. `getUserTier(userSub: string): Promise<UserTierRecord | null>` -- Use `getItem<UserTierRecord>('USER#${userSub}', 'TIER')`
2. `createUserTier(userSub: string, tier: string): Promise<void>` -- Use `putItemConditional(record, 'attribute_not_exists(pk)')` to avoid overwriting existing
3. `updateUserTier(userSub: string, tier: string): Promise<void>` -- Use `updateItem('USER#${userSub}', 'TIER', { tier })`
4. `getDailyUsage(userSub: string, date: string): Promise<UsageRecord | null>` -- Use `getItem<UsageRecord>('USER#${userSub}', 'QUOTA#${date}')`
5. `incrementUsage(userSub: string, operation: 'searches' | 'sentimentAnalyses'): Promise<UsageRecord>` -- This requires a custom `UpdateCommand` because the shared `updateItem` uses SET expressions, but incrementing needs ADD + conditional SET for TTL.

**`incrementUsage` DynamoDB pattern (non-obvious -- spell out for engineer):**

The upsert must atomically increment a counter AND set TTL/PK/SK on first write. Use `UpdateCommand` directly (import from `@aws-sdk/lib-dynamodb`):

```typescript
UpdateExpression: 'ADD #op :inc SET #ttl = if_not_exists(#ttl, :ttl), #pk = if_not_exists(#pk, :pk), #sk = if_not_exists(#sk, :sk), #updatedAt = :now'
```

- `ADD #op :inc` -- Atomically increments the counter field (creates as 0 + inc if not exists)
- `SET #ttl = if_not_exists(#ttl, :ttl)` -- Sets TTL only on first write (2 days from now as Unix timestamp)
- `SET #pk = if_not_exists(#pk, :pk)` -- Sets PK on first write
- `SET #sk = if_not_exists(#sk, :sk)` -- Sets SK on first write

This is a single atomic operation that handles both the create (upsert) and update cases. The `if_not_exists` ensures TTL and keys are only set on the initial creation, while `ADD` always increments.

For the TTL value: `Math.floor(Date.now() / 1000) + (2 * 24 * 60 * 60)` (2 days from now as Unix epoch seconds).

**Testing:**

Create `backend/src/repositories/__tests__/user.repository.test.ts`:

Mock the shared DynamoDB utilities (`jest.mock('../utils/dynamodb.util.js')`) following the mocking pattern in existing repository tests (e.g., `newsCache.repository.test.ts`). Test:
- `getUserTier` returns record when exists
- `getUserTier` returns null when not found
- `createUserTier` calls PutItem with correct key structure
- `createUserTier` does not overwrite existing record (`putItemConditional` with `attribute_not_exists`)
- `incrementUsage` calls UpdateCommand with ADD expression for counter
- `incrementUsage` sets TTL 2 days from now using `if_not_exists`
- `incrementUsage` upsert: creates record on first call, increments on subsequent
- `getDailyUsage` returns record for today's date

**Verification Checklist:**
- [ ] Type-checks: `cd backend && npm run type-check`
- [ ] All tests pass: `npm run test:backend -- --testPathPattern=repositories/__tests__/user.repository`
- [ ] PK format is `USER#${sub}`, SK format is `TIER` or `QUOTA#YYYY-MM-DD`

**Commit Message Template:**
```
feat(auth): add user repository for tier and quota tracking

- DynamoDB operations for USER# entities
- Tier storage (free/pro) and daily usage counters
- Usage records auto-expire via 2-day TTL
```

---

## Task 5: Create Tier Service

**Goal:** Define the tier definitions (features and quotas for free vs pro) and provide lookup functions.

**Files to Modify/Create:**
- `backend/src/services/tier.service.ts` - New file
- `backend/src/services/__tests__/tier.service.test.ts` - New test file

**Prerequisites:**
- Task 4 complete (user repository)
- Read `docs/PRO_FEATURES_ROADMAP.md` for the feature list

**Implementation Steps:**

Create `backend/src/services/tier.service.ts`:

Define tier configurations as plain objects:

```typescript
export interface TierFeatures {
  full_article_body: boolean;
  advanced_charting: boolean;
  portfolio_export: boolean;
  real_time_alerts: boolean;
  custom_models: boolean;
  api_access: boolean;
}

export interface TierQuotas {
  daily_search_limit: number;
  daily_sentiment_analyses: number;
  max_portfolio_size: number;
}

export interface TierDefinition {
  features: TierFeatures;
  quotas: TierQuotas;
}
```

Define the tier map:

```typescript
const TIER_DEFINITIONS: Record<string, TierDefinition> = {
  free: {
    features: {
      full_article_body: false,
      advanced_charting: false,
      portfolio_export: false,
      real_time_alerts: false,
      custom_models: false,
      api_access: false,
    },
    quotas: {
      daily_search_limit: 50,
      daily_sentiment_analyses: 10,
      max_portfolio_size: 20,
    },
  },
  pro: {
    features: {
      full_article_body: true,
      advanced_charting: true,
      portfolio_export: true,
      real_time_alerts: true,
      custom_models: true,
      api_access: true,
    },
    quotas: {
      daily_search_limit: 999999,
      daily_sentiment_analyses: 999999,
      max_portfolio_size: 999999,
    },
  },
};
```

Export:
1. `getTierDefinition(tier: string): TierDefinition` -- Lookup by tier name, default to `free` if unknown
2. `isFeatureEnabled(tier: string, feature: keyof TierFeatures): boolean` -- Check if a specific feature is enabled for a tier
3. `getTierQuotas(tier: string): TierQuotas` -- Get quotas for a tier

**Testing:**

Test cases:
- `getTierDefinition('free')` returns free config with all features disabled
- `getTierDefinition('pro')` returns pro config with all features enabled
- `getTierDefinition('unknown')` defaults to free
- `isFeatureEnabled('pro', 'full_article_body')` returns true
- `isFeatureEnabled('free', 'full_article_body')` returns false
- `getTierQuotas('free').daily_search_limit` returns 50
- `getTierQuotas('pro').daily_search_limit` returns 999999

**Verification Checklist:**
- [ ] Type-checks
- [ ] All tests pass
- [ ] Unknown tier defaults to free (defensive)

**Commit Message Template:**
```
feat(tier): add tier service with feature and quota definitions

- Define free and pro tier configurations
- Feature flags and quota limits per tier
- Unknown tiers default to free for safety
```

---

## Task 6: Create Quota Service

**Goal:** Create a service that checks and records usage against tier quotas.

**Files to Modify/Create:**
- `backend/src/services/quota.service.ts` - New file
- `backend/src/services/__tests__/quota.service.test.ts` - New test file

**Prerequisites:**
- Task 4 complete (user repository)
- Task 5 complete (tier service)

**Implementation Steps:**

Create `backend/src/services/quota.service.ts`:

Export:

1. `checkQuota(userSub: string, operation: 'searches' | 'sentimentAnalyses'): Promise<{ allowed: boolean; used: number; limit: number }>` -- Looks up user tier, gets quotas, gets today's usage, returns whether the operation is allowed.

2. `recordUsage(userSub: string, operation: 'searches' | 'sentimentAnalyses'): Promise<void>` -- Increments the daily usage counter (calls `incrementUsage` from user repository).

3. `getUsageSummary(userSub: string): Promise<{ searches: { used: number; limit: number }; sentimentAnalyses: { used: number; limit: number } }>` -- Returns current usage and limits for display.

The flow for `checkQuota`:
1. Get user tier from `getUserTier(userSub)` (default to `free` if no record)
2. Get tier quotas from `getTierQuotas(tier)`
3. Get today's usage from `getDailyUsage(userSub, todayDateString)`
4. Compare usage against limit
5. Return result

Use `new Date().toISOString().slice(0, 10)` for today's date string (YYYY-MM-DD format).

**Testing:**

Mock both user repository and tier service. Test:
- `checkQuota` returns allowed=true when under limit
- `checkQuota` returns allowed=false when at or over limit
- `checkQuota` defaults to free tier when no user record exists
- `recordUsage` calls `incrementUsage` on user repository
- `getUsageSummary` combines usage and limits correctly

**Verification Checklist:**
- [ ] Type-checks
- [ ] All tests pass
- [ ] Defaults to free tier when user not found (not an error)

**Commit Message Template:**
```
feat(tier): add quota service for usage tracking and enforcement

- Check quotas before operations
- Record usage increments
- Summary endpoint for UI display
```

---

## Task 7: Create Feature Flag Service

**Goal:** Create a service that resolves feature flags for a given user.

**Files to Modify/Create:**
- `backend/src/services/featureFlag.service.ts` - New file
- `backend/src/services/__tests__/featureFlag.service.test.ts` - New test file

**Prerequisites:**
- Task 4 complete (user repository)
- Task 5 complete (tier service)

**Implementation Steps:**

Create `backend/src/services/featureFlag.service.ts`:

Export:

1. `getFeatureFlags(userSub: string): Promise<{ tier: string; features: TierFeatures; quotas: TierQuotas }>` -- Looks up user tier, returns full feature flag and quota configuration.

2. `isFeatureEnabled(userSub: string, feature: keyof TierFeatures): Promise<boolean>` -- Convenience function for single feature check.

Both functions should:
- Get user tier from `getUserTier(userSub)`
- If no user record exists, default to `'free'`
- Look up tier definition from tier service
- Return the result

**Testing:**

Mock user repository. Test:
- Returns pro features when user has `tier: 'pro'`
- Returns free features when user has `tier: 'free'`
- Defaults to free when user not found
- `isFeatureEnabled` returns correct boolean for specific features

**Verification Checklist:**
- [ ] Type-checks
- [ ] All tests pass
- [ ] Graceful default to free tier

**Commit Message Template:**
```
feat(tier): add feature flag service

- Resolve feature flags based on user tier
- Defaults to free tier for unknown users
```

---

## Task 8: Create Auth Handler

**Goal:** Create the handler for `POST /auth/tier` that returns user tier info and auto-provisions free tier for new users.

**Files to Modify/Create:**
- `backend/src/handlers/auth.handler.ts` - New file
- `backend/src/handlers/__tests__/auth.handler.test.ts` - New test file

**Prerequisites:**
- Task 3 complete (auth middleware)
- Task 7 complete (feature flag service)
- Task 4 complete (user repository)

**Implementation Steps:**

Create `backend/src/handlers/auth.handler.ts`:

Export `handleTierRequest(event: APIGatewayProxyEventV2): Promise<APIGatewayResponse>`:

Flow:
1. Call `requireAuth(event)` to extract the authenticated user (JWT is already validated by API Gateway's JWT authorizer)
2. Call `getFeatureFlags(user.sub)` to get current tier info
3. If the underlying `getUserTier` returned null (new user), call `createUserTier(user.sub, 'free')` to provision them
4. Return `successResponse(tierInfo)` with the full tier/features/quotas object

The response shape:
```json
{
  "data": {
    "tier": "free",
    "features": {
      "full_article_body": false,
      "advanced_charting": false,
      ...
    },
    "quotas": {
      "daily_search_limit": 50,
      "daily_sentiment_analyses": 10,
      "max_portfolio_size": 20
    }
  }
}
```

Use the existing `successResponse` and `errorResponse` from `backend/src/utils/response.util.ts`.

**Auto-provisioning logic:** Check if `getUserTier(user.sub)` returns null. If so, create the free tier record first, then return free tier info. This happens once per user on their first authenticated request.

**Testing:**

Mock auth middleware, feature flag service, and user repository. Test:
- Returns tier info for existing user
- Auto-provisions free tier for new user (calls `createUserTier`)
- Returns 401 when auth fails (requireAuth throws)
- Response body matches expected shape

**Verification Checklist:**
- [ ] Type-checks
- [ ] All tests pass
- [ ] New users are auto-provisioned as free tier
- [ ] Uses existing `successResponse`/`errorResponse` utilities

**Commit Message Template:**
```
feat(auth): add tier info handler with auto-provisioning

- POST /auth/tier returns user tier, features, quotas
- Auto-provisions free tier for new authenticated users
- Requires JWT authentication
```

---

## Task 9: Register Auth Route in Lambda Router

**Goal:** Add the `/auth/tier` route to the Lambda request router.

**Files to Modify/Create:**
- `backend/src/index.ts` - Modify (add route case)

**Prerequisites:**
- Task 8 complete (auth handler)
- Read `backend/src/index.ts` thoroughly

**Implementation Steps:**

Add a new case in the `switch (path)` block, before the `default` case:

```typescript
case '/auth/tier': {
  if (method !== 'POST') {
    response = errorResponse(`Method ${method} not allowed for /auth/tier`, 405);
    break;
  }
  const { handleTierRequest } = await import('./handlers/auth.handler');
  response = await handleTierRequest(event);
  break;
}
```

Follow the exact same pattern as the existing route cases (method check, dynamic import, break).

**Verification Checklist:**
- [ ] `npm run test:backend` passes (no existing tests broken)
- [ ] Route follows same pattern as existing routes (dynamic import, method check)
- [ ] `cd backend && npm run type-check` passes

**Testing Instructions:**
- Run full backend test suite: `npm run test:backend`
- The handler test from Task 8 validates the handler logic; this task just wires it up

**Commit Message Template:**
```
feat(api): register /auth/tier route in Lambda router

- Add POST /auth/tier case to main switch
- Dynamic import for auth handler (lazy loading)
```

---

## Task 10: Update Community Overlays

**Goal:** Update the community edition overlay files to exclude Cognito resources and auth routes that were added in this phase.

**Files to Modify/Create:**
- `.sync/overlays/backend/template.yaml` - Update (copy current pro version, then remove Cognito)
- `.sync/overlays/backend/src/index.ts` - Update (copy current pro version, then remove auth route)

**Prerequisites:**
- All previous tasks in this phase complete
- Read both pro source files and their current overlay versions

**Implementation Steps:**

**For `.sync/overlays/backend/template.yaml`:**

Copy the current `backend/template.yaml` (which now has Cognito resources), then remove:
- The `CognitoCallbackUrl` parameter
- The `NewsInvestorUserPool` resource
- The `NewsInvestorUserPoolClient` resource
- The `NewsInvestorJwtAuthorizer` resource
- The `AuthTierRoute` resource
- The `CognitoUserPoolId` output
- The `CognitoUserPoolClientId` output
- The `COGNITO_USER_POOL_ID` environment variable from `ReactStocksFunction`

Keep everything else identical to the pro version.

**For `.sync/overlays/backend/src/index.ts`:**

Copy the current `backend/src/index.ts` (which now has the auth route), then remove the `/auth/tier` case from the switch block.

**Verification Checklist:**
- [ ] Overlay template.yaml has no Cognito resources (`grep -i cognito` returns nothing)
- [ ] Overlay template.yaml has no `/auth/tier` route
- [ ] Overlay index.ts has no `/auth/tier` case
- [ ] Both overlays are valid (no syntax errors from partial removal)

**Testing Instructions:**
- Run sync dry-run: `.sync/sync.sh --public-repo ~/projects/news-investor --dry-run`
- If possible, run full sync and `npm run check` in public repo to verify

**Commit Message Template:**
```
build(sync): update community overlays for Cognito exclusion

- Remove Cognito resources from template overlay
- Remove auth route from index.ts overlay
```

---

## Phase Verification

After completing all tasks in this phase:

1. **Backend builds and tests pass:**
   ```
   cd backend && npm run type-check && npm test
   ```

2. **Full monorepo check passes:**
   ```
   npm run check
   ```

3. **SAM template validates:**
   ```
   sam validate --template backend/template.yaml
   ```

4. **New test files all pass:**
   ```
   npm run test:backend -- --testPathPattern="auth.middleware|auth.handler|tier.service|quota.service|featureFlag.service|user.repository"
   ```

5. **Sync pipeline still works:**
   ```
   .sync/sync.sh --public-repo ~/projects/news-investor --dry-run
   ```
   Verify no auth/tier files appear in public repo.

6. **Community overlay verification:**
   - `grep -i cognito .sync/overlays/backend/template.yaml` returns nothing
   - `grep "auth/tier" .sync/overlays/backend/src/index.ts` returns nothing

**Known limitations:**
- Cognito resources are defined but not yet consumed by the frontend (Phase 3)
- Tier auto-provisioning creates `free` records but no way to upgrade to `pro` yet (manual DynamoDB update or future Stripe integration)
- Quota enforcement is available as a service but not wired into existing endpoints yet (Phase 3 wires frontend, backend enforcement is optional until rate limiting is needed)
