# Phase 3: Frontend Auth, Tier System, Feature Gates, and Settings

## Phase Goal

Add Cognito authentication to the frontend (login, signup, token management), build the tier/feature-gate system that controls pro vs free content, apply feature gates to existing UI, add an Account/Settings screen, and update all community overlays so the public edition works without any auth or tier infrastructure.

**Success criteria:**
- Users can sign up, log in, verify email, and reset password
- JWT tokens are automatically attached to API requests
- TierContext provides feature flags and quotas to all components
- `<FeatureGate>` component conditionally renders pro content
- Settings screen shows user info, tier, and usage
- Auth is optional -- unauthenticated users get full free experience
- Community overlays produce a working edition without auth screens
- `npm run check` passes in both pro and community editions

**Estimated tokens:** ~45,000

## Prerequisites

- Phase 2 complete (backend Cognito + tier services deployed)
- Cognito User Pool ID and Client ID from SAM deploy output
- Frontend `.env` updated with `EXPO_PUBLIC_COGNITO_USER_POOL_ID` and `EXPO_PUBLIC_COGNITO_CLIENT_ID`

---

## Task 1: Install Cognito Dependency

**Goal:** Add `amazon-cognito-identity-js` to the frontend. This is a pure JS library (no native modules) that works with Expo on all platforms.

**Files to Modify/Create:**
- `frontend/package.json` - Modify (add dependency)

**Prerequisites:**
- None

**Implementation Steps:**

Run from the monorepo root:
```
cd frontend && npm install amazon-cognito-identity-js --legacy-peer-deps
```

Verify it's added to `frontend/package.json` dependencies.

**Verification Checklist:**
- [ ] `amazon-cognito-identity-js` appears in `frontend/package.json` dependencies
- [ ] `npm install --legacy-peer-deps` from monorepo root succeeds
- [ ] `npm run lint` still passes (no import errors)

**Commit Message Template:**
```
build(auth): add amazon-cognito-identity-js dependency

- Pure JS Cognito SDK for Expo-compatible auth
```

---

## Task 2: Add Cognito Environment Variables

**Goal:** Extend the environment configuration to include Cognito settings.

**Files to Modify/Create:**
- `frontend/src/config/environment.ts` - Modify

**Prerequisites:**
- Read `frontend/src/config/environment.ts`

**Implementation Steps:**

Add two new properties to the `Environment` object:

```typescript
/**
 * Cognito User Pool ID
 * Set via EXPO_PUBLIC_COGNITO_USER_POOL_ID in .env file
 * Required for user authentication (optional - app works without auth)
 */
COGNITO_USER_POOL_ID: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || '',

/**
 * Cognito User Pool Client ID
 * Set via EXPO_PUBLIC_COGNITO_CLIENT_ID in .env file
 * Required for user authentication (optional - app works without auth)
 */
COGNITO_CLIENT_ID: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '',
```

Do NOT add these to the `validateEnvironment()` function's required checks -- auth is optional, so missing Cognito config should not prevent the app from starting.

**Verification Checklist:**
- [ ] `Environment.COGNITO_USER_POOL_ID` and `Environment.COGNITO_CLIENT_ID` are accessible
- [ ] `validateEnvironment()` does NOT throw when these are empty
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run `npm test` to confirm existing tests pass
- The values default to empty string, so no env setup needed for tests

**Commit Message Template:**
```
feat(auth): add Cognito environment variables

- COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID
- Optional -- app works without auth config
```

---

## Task 3: Create Cognito Auth Service

**Goal:** Create the service layer that wraps `amazon-cognito-identity-js` with async/await.

**Files to Modify/Create:**
- `frontend/src/services/auth/cognito.service.ts` - New file
- `frontend/src/services/auth/__tests__/cognito.service.test.ts` - New test file

**Prerequisites:**
- Task 1 and 2 complete

**Implementation Steps:**

Create `frontend/src/services/auth/cognito.service.ts`:

Initialize the CognitoUserPool using `Environment.COGNITO_USER_POOL_ID` and `Environment.COGNITO_CLIENT_ID`. If either is empty, the service should return null/throw gracefully on method calls (auth is optional).

Export these async functions:

1. `signUp(email: string, password: string, name?: string): Promise<void>` -- Register new user. Uses `userPool.signUp()` with email and optional name attribute. Wraps callback in Promise.

2. `confirmSignUp(email: string, code: string): Promise<void>` -- Verify email with confirmation code. Creates `CognitoUser`, calls `confirmRegistration()`.

3. `signIn(email: string, password: string): Promise<CognitoUserSession>` -- Authenticate user with SRP. Creates `AuthenticationDetails` and `CognitoUser`, calls `authenticateUser()`. Wraps callback in Promise.

4. `signOut(): Promise<void>` -- Signs out current user. Gets `userPool.getCurrentUser()`, calls `signOut()`.

5. `getSession(): Promise<CognitoUserSession | null>` -- Get current session if valid. Gets `userPool.getCurrentUser()`, calls `getSession()`. Returns null if no current user or session expired.

6. `getIdToken(): Promise<string | null>` -- Convenience function. Calls `getSession()`, returns `session.getIdToken().getJwtToken()` or null.

7. `forgotPassword(email: string): Promise<void>` -- Initiate password reset. Creates `CognitoUser`, calls `forgotPassword()`.

8. `confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>` -- Complete password reset with code and new password.

All callback-based Cognito methods should be wrapped in Promises. Handle the `onSuccess`/`onFailure` callback pattern.

If `COGNITO_USER_POOL_ID` or `COGNITO_CLIENT_ID` is empty, `getSession` and `getIdToken` should return null. Other methods should throw a descriptive error ("Authentication not configured").

**Testing:**

Create `frontend/src/services/auth/__tests__/cognito.service.test.ts`:

Mock `amazon-cognito-identity-js` module. Test:
- `signUp` calls `userPool.signUp` with correct params
- `signIn` calls `authenticateUser` and resolves with session
- `signIn` rejects on failure callback
- `getSession` returns null when no current user
- `getSession` returns session when user exists
- `getIdToken` returns token string from valid session
- `getIdToken` returns null when no session
- `signOut` calls signOut on current user
- Service handles missing Cognito config gracefully

**Verification Checklist:**
- [ ] All functions exported
- [ ] All tests pass
- [ ] Handles missing config (no Cognito pool ID) without crashing
- [ ] `npm run lint` passes

**Commit Message Template:**
```
feat(auth): add Cognito auth service

- Sign up, confirm, sign in, sign out, password reset
- Promise wrappers around callback-based Cognito SDK
- Graceful handling of missing auth config
```

---

## Task 4: Create AuthContext

**Goal:** Create a React context that manages auth state and exposes auth methods to the entire app.

**Files to Modify/Create:**
- `frontend/src/contexts/AuthContext.tsx` - New file
- `frontend/src/contexts/__tests__/AuthContext.test.tsx` - New test file

**Prerequisites:**
- Task 3 complete (Cognito service)
- Read existing context pattern: `frontend/src/contexts/StockContext.tsx`

**Implementation Steps:**

Create `frontend/src/contexts/AuthContext.tsx`:

**Interface:**
```typescript
interface AuthUser {
  sub: string;
  email: string;
  name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  getToken: () => Promise<string | null>;
}
```

**AuthProvider component:**

On mount (`useEffect`):
1. Call `getSession()` from the Cognito service
2. If a valid session exists, extract user info from the ID token payload (`session.getIdToken().decodePayload()`) and set `user` state
3. Set `isLoading` to false after check completes
4. If no session or error, user stays null (unauthenticated state)

Methods should wrap the Cognito service calls and update state:
- `signIn`: Call `cognitoService.signIn()`, then extract user from returned session, set state
- `signOut`: Call `cognitoService.signOut()`, set user to null
- `signUp`, `confirmSignUp`, `forgotPassword`, `confirmForgotPassword`: Forward to Cognito service (no state changes -- user isn't logged in yet)
- `getToken`: Forward to `cognitoService.getIdToken()`

Export `AuthProvider` component and `useAuth()` custom hook.

**Testing:**

Mock the Cognito service module. Test:
- `AuthProvider` sets `isLoading` to true initially, then false after session check
- When session exists, `user` is populated and `isAuthenticated` is true
- When no session, `user` is null and `isAuthenticated` is false
- `signIn` updates user state on success
- `signOut` clears user state
- `getToken` returns token from service

**Verification Checklist:**
- [ ] Exports: `AuthProvider`, `useAuth`
- [ ] Tests pass
- [ ] Follows same context pattern as `StockContext`
- [ ] `isLoading` is true during initial session check (prevents flash)

**Commit Message Template:**
```
feat(auth): add AuthContext for app-wide auth state

- AuthProvider checks for existing session on mount
- Exposes auth methods and user state via useAuth hook
- isLoading prevents render flash during session check
```

---

## Task 5: Create Auth Screens

**Goal:** Create the authentication screens (login, signup, email confirmation, forgot password) using Expo Router file-based routing.

**Files to Modify/Create:**
- `frontend/app/(auth)/_layout.tsx` - New file (auth group layout)
- `frontend/app/(auth)/login.tsx` - New file
- `frontend/app/(auth)/signup.tsx` - New file
- `frontend/app/(auth)/confirm.tsx` - New file
- `frontend/app/(auth)/forgot-password.tsx` - New file

**Prerequisites:**
- Task 4 complete (AuthContext)
- Read existing screen patterns in `frontend/app/(tabs)/`

**Implementation Steps:**

**`(auth)/_layout.tsx`:**
A simple Stack navigator layout for the auth flow. No tabs, just a stack. Use `expo-router`'s `Stack` component. Set `headerShown: false` for a clean full-screen experience. Background color should use the theme.

**`(auth)/login.tsx`:**
- Email and password text inputs
- "Sign In" button that calls `useAuth().signIn(email, password)`
- "Create Account" link navigating to `/(auth)/signup`
- "Forgot Password?" link navigating to `/(auth)/forgot-password`
- "Continue without account" link navigating to `/(tabs)` (skip auth)
- Show error messages on failed login
- Use React Native Paper components (`TextInput`, `Button`, `Text`) for consistency
- Loading state on submit button

**`(auth)/signup.tsx`:**
- Email, password, confirm password, and optional name inputs
- Password validation (min 8 chars, uppercase, lowercase, number)
- "Create Account" button that calls `useAuth().signUp(email, password, name)`
- On success, navigate to `/(auth)/confirm` passing email as parameter
- "Already have an account?" link to login
- Error display

**`(auth)/confirm.tsx`:**
- 6-digit confirmation code input
- Email display (passed via route params or state)
- "Verify" button that calls `useAuth().confirmSignUp(email, code)`
- On success, navigate to `/(auth)/login` with success message
- "Resend Code" button
- Error display

**`(auth)/forgot-password.tsx`:**
- Two states: (1) enter email to request code, (2) enter code + new password
- State 1: Email input + "Send Reset Code" button
- State 2: Code input + new password input + "Reset Password" button
- On success, navigate to `/(auth)/login` with success message
- Error display

**Design notes:**
- Center content vertically on screen
- Use theme colors consistently
- Add "NewsInvestor" branding/title at the top of each screen
- Keep it simple -- no animations or complex UI
- All inputs should have `autoCapitalize="none"` for email, `secureTextEntry` for password

**Verification Checklist:**
- [ ] All four screens render without errors
- [ ] Navigation between screens works (login <-> signup, login -> forgot-password)
- [ ] "Continue without account" link navigates to main tabs
- [ ] Error states display correctly
- [ ] `npm run lint` passes

**Testing Instructions:**
- These are UI screens that are best tested manually or with snapshot tests
- Ensure `npm run lint` passes (TypeScript + ESLint)
- The auth flow depends on a real Cognito pool, so integration testing is manual

**Commit Message Template:**
```
feat(ui): add authentication screens

- Login, signup, email confirmation, password reset
- Expo Router (auth) group with stack navigation
- Continue without account option for optional auth
```

---

## Task 6: Integrate AuthProvider into App Layout

**Goal:** Add `AuthProvider` to the root layout's provider hierarchy so auth state is available throughout the app.

**Files to Modify/Create:**
- `frontend/app/_layout.tsx` - Modify

**Prerequisites:**
- Task 4 complete (AuthContext)
- Read `frontend/app/_layout.tsx`

**Implementation Steps:**

Import `AuthProvider` from `@/contexts/AuthContext`.

Add it to the provider hierarchy. Place it inside `QueryClientProvider` but wrapping `StockProvider`:

```tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <StockProvider>
      <ToastProvider>
        <Slot />
        <StatusBar style="light" />
      </ToastProvider>
    </StockProvider>
  </AuthProvider>
</QueryClientProvider>
```

The `AuthProvider` needs to be inside `QueryClientProvider` because it may use TanStack Query for tier data fetching (in TierProvider, added later). It wraps `StockProvider` so stock-related hooks can access auth if needed.

**Important:** Auth is optional. The `Slot` renders whichever route group the user navigates to. Unauthenticated users go directly to `/(tabs)`. The `(auth)` screens are accessible but not forced. You can add a redirect from the app root to `/(auth)/login` OR `/(tabs)` based on `useAuth().isAuthenticated`, but this is optional -- users can also navigate manually.

Recommended approach: Add a simple root `index.tsx` (or modify existing navigation) that checks auth state and offers the login option, but does NOT force authentication.

**Verification Checklist:**
- [ ] `AuthProvider` wraps `StockProvider` in the layout
- [ ] App still renders correctly without Cognito env vars configured
- [ ] `npm run lint` passes
- [ ] `npm test` passes (existing tests unaffected)

**Commit Message Template:**
```
feat(auth): integrate AuthProvider into root layout

- Add AuthProvider to provider hierarchy
- Auth is optional, app works without Cognito config
```

---

## Task 7: Add JWT Token to API Requests

**Goal:** Attach the user's JWT token to outgoing API requests when authenticated. All three API service files have independent `createBackendClient()` functions that need the interceptor.

**Files to Modify/Create:**
- `frontend/src/services/api/backendClient.ts` - New file (shared client factory)
- `frontend/src/services/api/tiingo.service.ts` - Modify (use shared client)
- `frontend/src/services/api/finnhub.service.ts` - Modify (use shared client)
- `frontend/src/services/api/lambdaSentiment.service.ts` - Modify (use shared client)

**Prerequisites:**
- Task 3 complete (Cognito service with `getIdToken`)
- Read all three service files -- each has its own `createBackendClient()` at:
  - `tiingo.service.ts:27`
  - `finnhub.service.ts:18`
  - `lambdaSentiment.service.ts:144`

**Implementation Steps:**

**Step 1: Extract shared client factory**

Create `frontend/src/services/api/backendClient.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';
import { Environment } from '@/config/environment';
import { getIdToken } from '@/services/auth/cognito.service';

const BACKEND_TIMEOUT = 30000;

export function createBackendClient(): AxiosInstance {
  if (!Environment.BACKEND_URL) {
    throw new Error('Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.');
  }

  const client = axios.create({
    baseURL: Environment.BACKEND_URL,
    timeout: BACKEND_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  // Attach JWT token when user is authenticated
  client.interceptors.request.use(async (config) => {
    const token = await getIdToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
}
```

**Step 2: Update each service file**

In `tiingo.service.ts`, `finnhub.service.ts`, and `lambdaSentiment.service.ts`:
- Remove the local `createBackendClient()` function
- Import from the shared module: `import { createBackendClient } from './backendClient';`
- All existing calls to `createBackendClient()` remain unchanged

This reduces duplication from 3 copies to 1 and makes JWT injection a single-file concern.

The interceptor is safe for unauthenticated users: `getIdToken()` returns null when not logged in, and the `if (token)` check skips the header.

**Verification Checklist:**
- [ ] `Authorization` header is set when user is authenticated
- [ ] No header is set when user is not authenticated (no error, just skipped)
- [ ] Existing tests pass (mock `getIdToken` to return null in test environment)
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run `npm test` -- existing tests should pass because `getIdToken` will return null in test env
- If tests mock axios, verify the interceptor doesn't break the mocks

**Commit Message Template:**
```
feat(auth): add JWT token injection to API requests

- Axios interceptor attaches Bearer token when authenticated
- Gracefully skips when user is not logged in
```

---

## Task 8: Create Frontend Tier System

**Goal:** Build the tier context, feature gate, and supporting components that gate pro features in the UI.

**Files to Modify/Create:**
- `frontend/src/features/tier/index.ts` - New file (barrel export)
- `frontend/src/features/tier/contexts/TierContext.tsx` - New file
- `frontend/src/features/tier/components/FeatureGate.tsx` - New file
- `frontend/src/features/tier/components/UpgradePrompt.tsx` - New file
- `frontend/src/features/tier/components/QuotaUsage.tsx` - New file
- `frontend/src/features/tier/hooks/useCheckout.ts` - New file (placeholder)

**Prerequisites:**
- Task 4 complete (AuthContext)
- Phase 2 complete (backend /auth/tier endpoint)

**Implementation Steps:**

**`contexts/TierContext.tsx`:**

Create a context with this interface:
```typescript
interface TierContextValue {
  tier: string;
  features: Record<string, boolean>;
  quotas: Record<string, number>;
  isFeatureEnabled: (feature: string) => boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

`TierProvider` component:
1. Uses `useAuth()` to check if user is authenticated
2. If authenticated, calls `POST /auth/tier` using the backend client (or fetch with `getToken()`)
3. Stores the returned tier/features/quotas in state
4. If not authenticated, defaults to `tier: 'community'` with ALL features enabled (unauthenticated users get full free experience -- gating happens server-side via quotas, not client-side)
5. Provides `isFeatureEnabled(feature)` that looks up the features map
6. Exposes `refetch` for refreshing after a tier change

Use `useEffect` or `useQuery` (TanStack Query) for the API call. TanStack Query is preferred since the project already uses it.

**`components/FeatureGate.tsx`:**

```typescript
interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
```

- If `isFeatureEnabled(feature)` returns true, render `children`
- If false, render `fallback` prop if provided, otherwise render `<UpgradePrompt feature={feature} />`
- While `loading` is true, render nothing (or a subtle skeleton)

**`components/UpgradePrompt.tsx`:**

A compact card/banner that tells the user this feature requires Pro. Include:
- Brief description of the feature
- "Upgrade to Pro" button (placeholder for now -- logs to console or shows a toast)
- Use theme colors, keep it visually subtle (not a modal popup)

**`components/QuotaUsage.tsx`:**

Displays usage meters. Props: `quotas` and `usage` (both from tier context or passed explicitly). Show:
- Searches: used / limit (with a progress bar)
- Sentiment analyses: used / limit
- Use React Native Paper `ProgressBar` component

**`hooks/useCheckout.ts`:**

Placeholder for future Stripe integration:
```typescript
export function useCheckout() {
  return {
    checkout: () => console.log('Stripe checkout not yet implemented'),
    loading: false,
    error: null,
  };
}
```

**`index.ts` (barrel export):**

Re-export everything:
```typescript
export { TierProvider, useTier } from './contexts/TierContext';
export { FeatureGate } from './components/FeatureGate';
export { UpgradePrompt } from './components/UpgradePrompt';
export { QuotaUsage } from './components/QuotaUsage';
export { useCheckout } from './hooks/useCheckout';
```

**Verification Checklist:**
- [ ] All components render without errors
- [ ] `isFeatureEnabled` returns correct values for tier
- [ ] Unauthenticated users get all features enabled (community behavior)
- [ ] `npm run lint` passes
- [ ] Barrel export matches the community stub interface from Phase 1

**Testing Instructions:**
- Unit test `TierContext` with mocked auth and API responses
- Unit test `FeatureGate` rendering with feature enabled/disabled
- Run `npm run lint`

**Commit Message Template:**
```
feat(tier): add frontend tier system

- TierContext fetches tier info from backend
- FeatureGate conditionally renders pro content
- UpgradePrompt and QuotaUsage components
- Placeholder checkout hook for future Stripe
```

---

## Task 9: Integrate TierProvider into App Layout

**Goal:** Add `TierProvider` to the root layout so tier state is available throughout the app.

**Files to Modify/Create:**
- `frontend/app/_layout.tsx` - Modify

**Prerequisites:**
- Task 6 and 8 complete

**Implementation Steps:**

Import `TierProvider` from `@/features/tier`.

Add it inside `AuthProvider`, wrapping `StockProvider`:

```tsx
<AuthProvider>
  <TierProvider>
    <StockProvider>
      <ToastProvider>
        <Slot />
        <StatusBar style="light" />
      </ToastProvider>
    </StockProvider>
  </TierProvider>
</AuthProvider>
```

`TierProvider` must be inside `AuthProvider` (it uses `useAuth()` to check authentication status).

**Verification Checklist:**
- [ ] Provider hierarchy: `AuthProvider` > `TierProvider` > `StockProvider`
- [ ] App renders correctly
- [ ] `npm test` passes

**Commit Message Template:**
```
feat(tier): integrate TierProvider into root layout

- TierProvider wraps StockProvider inside AuthProvider
```

---

## Task 10: Apply Feature Gates to Existing UI

**Goal:** Gate the confirmed pro features (full article body, search limits) in the existing UI components.

**Files to Modify/Create:**
- `frontend/src/components/sentiment/SingleWordItem.tsx` - Modify (article body gating)
- Search hook or component (likely `frontend/src/hooks/useSymbolSearch.ts` or the search screen) - Modify

**Prerequisites:**
- Task 8 and 9 complete (tier system integrated)
- Read `frontend/src/components/sentiment/SingleWordItem.tsx` -- the article body is rendered at line 186: `{item.body || 'No description available'}`

**Implementation Steps:**

**Full article body gating:**

The component to modify is `SingleWordItem.tsx`. Currently at line 181-187, the article body is rendered as:
```tsx
<Text variant="bodySmall" style={[styles.body, ...]} numberOfLines={2}>
  {item.body || 'No description available'}
</Text>
```

Note: The current UI already truncates to 2 lines (`numberOfLines={2}`). The backend provides full article bodies via the sentiment/articles endpoint. The gating changes the behavior:
- **Free tier:** Keep `numberOfLines={2}` (current behavior, no change needed -- this is already truncated)
- **Pro tier:** Remove `numberOfLines` limit and show full article text

Wrap with `<FeatureGate>`:
```tsx
<FeatureGate
  feature="full_article_body"
  fallback={
    <Text variant="bodySmall" style={[styles.body, ...]} numberOfLines={2}>
      {item.body || 'No description available'}
    </Text>
  }
>
  <Text variant="bodySmall" style={[styles.body, ...]}>
    {item.body || 'No description available'}
  </Text>
</FeatureGate>
```

The practical difference: free users stay at the current 2-line truncation. Pro users see the complete article body without line limits. No backend changes needed -- the body data is already being returned.

**Search rate limiting:**

In the search hook or component, check quota before making API calls. Use `useTier()`:

```tsx
const { quotas } = useTier();
// If quotas has a daily_search_limit, check against it
// For now, just log when quota is low -- actual enforcement happens server-side
```

The server-side enforcement is more important than client-side (can't be bypassed). Client-side is for UX -- showing a message before the API rejects the request.

**Note:** Be conservative with gating. Only gate what's been confirmed:
1. Full article body -- gate with `<FeatureGate>`
2. Search limits -- informational only on frontend (server enforces)

Do NOT gate sentiment analysis, predictions, charts, or portfolio features -- these remain free.

**Verification Checklist:**
- [ ] Article body gating renders truncated text for free tier
- [ ] Article body gating renders full text for pro tier (or community/unauthenticated)
- [ ] `npm run lint` passes
- [ ] `npm test` passes (update any affected component tests)

**Commit Message Template:**
```
feat(tier): gate full article body behind pro tier

- Free users see truncated article preview
- Pro users see full article text
- Search quota awareness (informational)
```

---

## Task 11: Add Settings/Account Screen

**Goal:** Create a settings screen showing user info, tier status, quota usage, and sign-out.

**Files to Modify/Create:**
- `frontend/app/(tabs)/settings.tsx` - New file
- `frontend/app/(tabs)/_layout.tsx` - Modify (add tab)

**Prerequisites:**
- Tasks 4, 8, 9 complete (auth and tier contexts)

**Implementation Steps:**

**`(tabs)/settings.tsx`:**

Create a screen with these sections:

1. **Account section** (if authenticated):
   - User email
   - Tier badge (e.g., "Free" or "Pro" with different colors)
   - Sign Out button

2. **Account section** (if not authenticated):
   - "Sign in for more features" message
   - Sign In button (navigates to `/(auth)/login`)

3. **Usage section** (if authenticated):
   - `<QuotaUsage>` component showing daily search and sentiment limits

4. **Upgrade section** (if authenticated and free tier):
   - `<UpgradePrompt>` component

5. **About section:**
   - App version
   - "NewsInvestor" branding

Use `useAuth()` for auth state and `useTier()` for tier info.

**`(tabs)/_layout.tsx` modification:**

Add a new `Tabs.Screen` for settings after the portfolio tab:

```tsx
<Tabs.Screen
  name="settings"
  options={{
    title: 'Account',
    tabBarIcon: ({ focused, color, size }) => (
      <Ionicons
        name={focused ? 'person' : 'person-outline'}
        size={size}
        color={color}
      />
    ),
  }}
/>
```

**Verification Checklist:**
- [ ] Settings tab appears in tab bar
- [ ] Authenticated state shows user email and tier
- [ ] Unauthenticated state shows sign-in prompt
- [ ] Sign Out button works (user state clears, navigates appropriately)
- [ ] `npm run lint` passes

**Commit Message Template:**
```
feat(ui): add account/settings screen

- Show user info, tier badge, usage quotas
- Sign in/out functionality
- Upgrade prompt for free tier users
- New Account tab in bottom navigation
```

---

## Task 12: Update All Community Overlays

**Goal:** Update every overlay file to reflect the auth/tier changes made in this phase. Community overlays must produce a working app without auth screens, auth context, tier management, or settings screen.

**Files to Modify/Create:**
- `.sync/overlays/frontend/app/_layout.tsx` - Update
- `.sync/overlays/frontend/app/(tabs)/_layout.tsx` - Update
- `.sync/overlays/frontend/src/config/environment.ts` - Update
- `.sync/overlays/frontend/src/services/api/backendClient.ts` - New overlay (no auth import)
- `.sync/overlays/frontend/src/features/tier/index.ts` - Verify (should already be correct from Phase 1)

**Prerequisites:**
- All previous tasks in this phase complete
- Read each pro source file and its overlay

**Implementation Steps:**

**`_layout.tsx` overlay:**

Copy the current pro `frontend/app/_layout.tsx` (which now has `AuthProvider` and `TierProvider`), then:
- Remove the `AuthProvider` import and wrapping
- Replace the `TierProvider` import to come from `@/features/tier` (the community stub)
- Keep `TierProvider` in the hierarchy (the stub is a passthrough)
- Remove any references to auth screens or navigation

The result: community edition has `TierProvider` (stub, all features enabled) but no `AuthProvider`.

**`(tabs)/_layout.tsx` overlay:**

Copy the current pro version (which now has the Settings tab), then:
- Remove the Settings `Tabs.Screen` entry

Community edition has no Account/Settings tab.

**`environment.ts` overlay:**

Copy the current pro version, then:
- Remove `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` properties

Community edition has no Cognito config.

**`backendClient.ts` overlay:**

The pro version imports `getIdToken` from `@/services/auth/cognito.service` (which is excluded from the community edition). Create a community overlay that removes the auth import and JWT interceptor:

```typescript
import axios, { AxiosInstance } from 'axios';
import { Environment } from '@/config/environment';

const BACKEND_TIMEOUT = 30000;

export function createBackendClient(): AxiosInstance {
  if (!Environment.BACKEND_URL) {
    throw new Error('Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.');
  }
  return axios.create({
    baseURL: Environment.BACKEND_URL,
    timeout: BACKEND_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Add the overlay mapping to `.sync/config.json`:
```json
".sync/overlays/frontend/src/services/api/backendClient.ts": "frontend/src/services/api/backendClient.ts"
```

**Tier stub verification:**

The `.sync/overlays/frontend/src/features/tier/index.ts` from Phase 1 should already have the correct interface. Verify its exports match what the pro `index.ts` barrel exports:
- `TierProvider`, `useTier`, `FeatureGate`, `UpgradePrompt`, `QuotaUsage`, `useCheckout`

If the pro barrel added any new exports in Task 8, add matching no-op stubs to the overlay.

**Verification Checklist:**
- [ ] Overlay `_layout.tsx` has no `AuthProvider` import
- [ ] Overlay `_layout.tsx` still has `TierProvider` (from stub)
- [ ] Overlay `(tabs)/_layout.tsx` has no `settings` tab
- [ ] Overlay `environment.ts` has no Cognito variables
- [ ] Tier stub exports match pro barrel exports

**Testing Instructions:**
- Run full sync: `.sync/sync.sh --public-repo ~/projects/news-investor`
- In public repo: `npm install --legacy-peer-deps && npm run check`
- Verify no auth-related files in public repo

**Commit Message Template:**
```
build(sync): update community overlays for auth and tier

- Remove AuthProvider from layout overlay
- Remove Settings tab from tabs layout overlay
- Remove Cognito env vars from environment overlay
- Verify tier stub interface matches pro exports
```

---

## Task 13: Final Sync Validation

**Goal:** Run the complete sync and verify the community edition works end-to-end.

**Files to Modify/Create:**
- None (validation only)

**Prerequisites:**
- All previous tasks complete

**Implementation Steps:**

1. Run sync:
   ```
   .sync/sync.sh --public-repo ~/projects/news-investor
   ```

2. Verify community edition:
   ```
   cd ~/projects/news-investor
   npm install --legacy-peer-deps
   npm run check
   ```

3. Verify file exclusions:
   ```
   # These should NOT exist:
   test ! -d frontend/app/'(auth)' && echo "PASS: no auth screens"
   test ! -f frontend/src/contexts/AuthContext.tsx && echo "PASS: no AuthContext"
   test ! -d frontend/src/services/auth && echo "PASS: no auth service"
   test ! -f frontend/app/'(tabs)'/settings.tsx && echo "PASS: no settings"
   test ! -f backend/src/middleware/auth.middleware.ts && echo "PASS: no auth middleware"
   test ! -f backend/src/handlers/auth.handler.ts && echo "PASS: no auth handler"
   test ! -f backend/src/services/tier.service.ts && echo "PASS: no tier service"
   test ! -f docs/PRO_FEATURES_ROADMAP.md && echo "PASS: no roadmap"
   ```

4. Verify tier stub:
   ```
   # Should be a single file:
   ls frontend/src/features/tier/
   # Expected: only index.ts
   ```

5. Verify overlay application:
   ```
   # No Cognito in template:
   grep -i cognito backend/template.yaml && echo "FAIL" || echo "PASS: no Cognito"
   # No auth route in index:
   grep "auth/tier" backend/src/index.ts && echo "FAIL" || echo "PASS: no auth route"
   # No Cognito in environment:
   grep "COGNITO" frontend/src/config/environment.ts && echo "FAIL" || echo "PASS: no Cognito env"
   ```

**Verification Checklist:**
- [ ] Full sync completes without errors
- [ ] `npm run check` passes in community edition
- [ ] All file exclusions verified
- [ ] All overlay applications verified
- [ ] No auth/tier/Cognito references leak into community edition

---

## Phase Verification

After completing all tasks in this phase:

1. **Pro edition (`news-investor-pro`):**
   - `npm run check` passes
   - Auth screens render (login, signup, confirm, forgot-password)
   - Settings screen shows in tab bar
   - `AuthProvider` and `TierProvider` in root layout
   - JWT tokens attached to API requests
   - Feature gates working

2. **Community edition (`news-investor`):**
   - `npm run check` passes after sync
   - No auth screens, no settings tab
   - `TierProvider` stub passes through all features
   - No Cognito references anywhere
   - App works identically to pre-auth experience

3. **Sync pipeline:**
   - Full sync produces working community edition
   - All exclusions and overlays correct
   - GitHub Actions will sync automatically on push to main

**Known limitations:**
- No way to upgrade from free to pro in the UI (requires manual DynamoDB update or future Stripe integration)
- Quota enforcement is server-side only for now (client shows informational usage, doesn't block)
- Auth is optional -- the app doesn't force login, which means some quota evasion is possible by using the app unauthenticated (acceptable for this stage)
- `useCheckout` is a placeholder returning no-op
