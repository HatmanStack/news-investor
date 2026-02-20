# Phase 1: Repo Setup, Rebrand, and Sync Infrastructure

## Phase Goal

Set up the two-repository structure (`news-investor-pro` private, `news-investor` public), rebrand all project references from "react-stocks" / "Stock Tracker" to "NewsInvestor", and build the sync pipeline that keeps the community edition in sync with the pro repo. This phase is done before any auth/tier code exists, so the first sync validates the pipeline works with an identical codebase.

**Success criteria:**
- `news-investor-pro` repo exists (private) with all git history preserved
- `news-investor` repo exists (public) with synced code
- All branding references updated
- Sync script runs successfully (dry-run and full)
- `npm run check` passes in both repos
- GitHub Actions workflow triggers sync on push to main

**Estimated tokens:** ~35,000

## Prerequisites

- GitHub CLI (`gh`) authenticated with access to `HatmanStack` org
- `jq` and `rsync` installed locally
- SSH key pair for deploy key (generated in this phase)
- Both repos cloned locally in `~/projects/`

---

## Task 1: Rename Repository on GitHub

**Goal:** Rename `HatmanStack/react-stocks` to `HatmanStack/news-investor-pro` and set it to private. GitHub automatically redirects old URLs.

**Files to Modify/Create:**
- None (GitHub web UI / CLI operation)

**Prerequisites:**
- Admin access to `HatmanStack/react-stocks`

**Implementation Steps:**
- Use `gh` CLI or GitHub web UI to rename the repository from `react-stocks` to `news-investor-pro`
- Set the repository visibility to private
- Update the local git remote URL to point to the new name
- Verify the remote is correct by running `git remote -v`

**Verification Checklist:**
- [ ] `git remote -v` shows `HatmanStack/news-investor-pro`
- [ ] Repository is private on GitHub
- [ ] Old URL `HatmanStack/react-stocks` redirects to new name

**Commit Message Template:**
```
chore(rebrand): rename repository to news-investor-pro
```

> **Note:** No commit needed for this task -- it's a GitHub-level operation. Just update the local remote.

---

## Task 2: Create Public Community Repository

**Goal:** Create the empty `HatmanStack/news-investor` public repository that will receive synced code.

**Files to Modify/Create:**
- None (GitHub CLI operation)

**Prerequisites:**
- Task 1 complete

**Implementation Steps:**
- Use `gh repo create` to create `HatmanStack/news-investor` as a public repository with a description like "NewsInvestor - News-driven stock sentiment analysis and market predictions"
- Initialize with a minimal README (the sync will replace it)
- Clone it locally to `~/projects/news-investor`

**Verification Checklist:**
- [ ] `HatmanStack/news-investor` exists and is public
- [ ] Repository is cloned locally
- [ ] Has at least one commit (initial README)

**Commit Message Template:**
```
chore: initialize news-investor community repository
```

---

## Task 3: Set Up Deploy Key for Sync

**Goal:** Create an SSH deploy key that the GitHub Actions sync workflow uses to push to the public repo.

**Files to Modify/Create:**
- None (GitHub settings operation)

**Prerequisites:**
- Task 1 and Task 2 complete

**Implementation Steps:**
- Generate a new SSH keypair dedicated to the sync bot (e.g., `ssh-keygen -t ed25519 -C "news-investor-sync-bot" -f news-investor-deploy-key`)
- Add the **public** key to `HatmanStack/news-investor` as a deploy key with **write access** (Settings > Deploy keys)
- Add the **private** key to `HatmanStack/news-investor-pro` as a repository secret named `NEWS_INVESTOR_PUBLIC_DEPLOY_KEY` (Settings > Secrets and variables > Actions)
- Delete the local keypair files after uploading

**Verification Checklist:**
- [ ] Deploy key visible in `news-investor` repo settings
- [ ] Secret `NEWS_INVESTOR_PUBLIC_DEPLOY_KEY` exists in `news-investor-pro` repo settings
- [ ] Local keypair files deleted

**Testing Instructions:**
- No automated test. Verification is manual via GitHub UI.

---

## Task 4: Rebrand Project Files

**Goal:** Update all "react-stocks" and "Stock Tracker" references to "NewsInvestor" / "news-investor" across the codebase.

**Files to Modify/Create:**
- `/package.json` - Change `name` to `news-investor-pro`
- `/frontend/package.json` - Change `name` to `news-investor-frontend`
- `/backend/package.json` - Change `name` to `news-investor-backend`
- `/frontend/app/_layout.tsx` - Update all meta tags: title, og:title, og:site_name, apple-mobile-web-app-title, application-name, twitter:title from "Stock Tracker" to "NewsInvestor"
- `/backend/template.yaml` - Update `Description` field. Update `Tags` from `react-stocks` to `news-investor` on `ReactStocksTable`, `ReactStocksApi`, `CostAnomalySNSTopic`. Update `DisplayName` on SNS topic.
- `/README.md` - Full rebrand (new project name, description). Note: this file will also have a community overlay later.
- `/CLAUDE.md` - Update project name references
- `/docs/ARCHITECTURE.md` - Update project name references
- `/docs/API.md` - Update project name references

**Prerequisites:**
- Tasks 1-3 complete
- Read all files listed above before editing

**Implementation Steps:**

For `/package.json`:
- Change `"name": "react-stocks-monorepo"` to `"name": "news-investor-pro"`

For `/frontend/package.json`:
- Change `"name"` value to `"news-investor-frontend"`

For `/backend/package.json`:
- Change `"name"` value to `"news-investor-backend"`

For `/frontend/app/_layout.tsx`:
- Replace all occurrences of "Stock Tracker" with "NewsInvestor" in the `<Head>` section
- The meta description content should reference "NewsInvestor" instead of "stock tracking application"
- Update keywords meta to include "newsinvestor"
- Update og:site_name, apple-mobile-web-app-title, application-name

For `/backend/template.yaml`:
- Change `Description:` to reference "NewsInvestor Backend"
- Change all `Value: react-stocks` tags to `Value: news-investor`
- Change SNS `DisplayName` from `'React Stocks Cost Alerts'` to `'NewsInvestor Cost Alerts'`
- Do NOT rename resource logical IDs (e.g., keep `ReactStocksTable`, `ReactStocksFunction`) -- these are internal CloudFormation references and renaming them would cause resource replacement on deploy

For documentation files (`README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`):
- Replace "react-stocks" with "news-investor" and "React Stocks" / "Stock Tracker" with "NewsInvestor" where they appear in prose
- Be careful not to change paths or technical identifiers that still reference old resource names

**Verification Checklist:**
- [ ] `npm run check` passes from monorepo root (lint + tests)
- [ ] `grep -ri "react-stocks" package.json frontend/package.json backend/package.json` returns no results
- [ ] `grep -r "Stock Tracker" frontend/app/_layout.tsx` returns no results
- [ ] All test suites pass unchanged

**Testing Instructions:**
- Run `npm run check` from monorepo root
- Visually verify `frontend/app/_layout.tsx` meta tags reference "NewsInvestor"
- Run `npm run format:check` to ensure formatting is preserved

**Commit Message Template:**
```
chore(rebrand): rename project to NewsInvestor

- Update package.json names across monorepo
- Rebrand meta tags in frontend root layout
- Update backend template description and tags
- Update documentation references
```

---

## Task 5: Create Sync Configuration

**Goal:** Create the `.sync/config.json` file that defines which paths to exclude from the public repo and which files to replace with community overlays.

**Files to Modify/Create:**
- `.sync/config.json` - New file

**Prerequisites:**
- Task 4 complete

**Implementation Steps:**

Create `.sync/config.json` with this content:

```json
{
  "exclude_paths": [
    ".sync",
    ".github/workflows/sync-public.yml",
    "backend/src/services/tier.service.ts",
    "backend/src/services/quota.service.ts",
    "backend/src/services/featureFlag.service.ts",
    "backend/src/handlers/auth.handler.ts",
    "backend/src/middleware/auth.middleware.ts",
    "backend/src/repositories/user.repository.ts",
    "backend/src/services/__tests__/tier.service.test.ts",
    "backend/src/services/__tests__/quota.service.test.ts",
    "backend/src/services/__tests__/featureFlag.service.test.ts",
    "backend/src/handlers/__tests__/auth.handler.test.ts",
    "backend/src/middleware/__tests__/auth.middleware.test.ts",
    "backend/src/repositories/__tests__/user.repository.test.ts",
    "frontend/src/features/tier/contexts",
    "frontend/src/features/tier/components",
    "frontend/src/features/tier/hooks",
    "frontend/src/services/auth",
    "frontend/src/contexts/AuthContext.tsx",
    "frontend/src/contexts/__tests__/AuthContext.test.tsx",
    "frontend/app/(auth)",
    "frontend/app/(tabs)/settings.tsx",
    "docs/PRO_FEATURES_ROADMAP.md"
  ],
  "overlay_mappings": {
    ".sync/overlays/frontend/src/features/tier/index.ts": "frontend/src/features/tier/index.ts",
    ".sync/overlays/frontend/app/_layout.tsx": "frontend/app/_layout.tsx",
    ".sync/overlays/frontend/app/(tabs)/_layout.tsx": "frontend/app/(tabs)/_layout.tsx",
    ".sync/overlays/frontend/src/config/environment.ts": "frontend/src/config/environment.ts",
    ".sync/overlays/frontend/src/services/api/backendClient.ts": "frontend/src/services/api/backendClient.ts",
    ".sync/overlays/backend/template.yaml": "backend/template.yaml",
    ".sync/overlays/backend/src/index.ts": "backend/src/index.ts",
    ".sync/overlays/docs/ARCHITECTURE.md": "docs/ARCHITECTURE.md",
    ".sync/overlays/docs/API.md": "docs/API.md",
    ".sync/overlays/CLAUDE.md": "CLAUDE.md",
    ".sync/overlays/README.md": "README.md"
  }
}
```

**Key design decisions:**
- `exclude_paths` lists files that only exist in pro (auth, tier services, pro docs). These are never copied to the public repo.
- `overlay_mappings` lists files that exist in both editions but have different content. During sync, the overlay version replaces the pro version.
- Overlay files for this initial phase are **copies of the current files** (they'll diverge in Phase 2-3 when auth/tier code is added to the pro versions).

**Verification Checklist:**
- [ ] `.sync/config.json` is valid JSON (`jq . .sync/config.json` succeeds)
- [ ] All overlay source paths exist (or will exist after overlay files are created in Task 7)

**Commit Message Template:**
```
build(sync): add sync configuration

- Define excluded paths for pro-only files
- Define overlay mappings for edition-specific files
```

---

## Task 6: Create Sync Script

**Goal:** Create `.sync/sync.sh` that performs the actual sync from pro to public repo.

**Files to Modify/Create:**
- `.sync/sync.sh` - New file (make executable)

**Prerequisites:**
- Task 5 complete
- Reference: `~/projects/warmreach-pro/.sync/sync.sh`

**Implementation Steps:**

Create `.sync/sync.sh` adapted from the warmreach-pro version. The script must:

1. Accept `--public-repo <path>`, `--dry-run`, and `--message <msg>` arguments
2. Validate the public repo path exists and is a git repo
3. Require `jq` and `rsync` commands
4. Parse `config.json` for exclude paths and overlay mappings
5. Build rsync exclude list (always exclude `.git`, `node_modules`, `.sync`, `__pycache__`, `.aws-sam`, `.venv`, `*.pyc`, plus all config exclude paths)
6. **Step 1:** Clean public repo working tree (preserve `.git/`): use `git ls-files -z | xargs -0 rm -f`, then `git clean -fdx --exclude='.git'`, then remove empty directories
7. **Step 2:** rsync from private to public with `--delete` and all excludes
8. **Step 3:** Apply overlay files by iterating `overlay_mappings` from config, copying each overlay source to its destination (creating parent dirs with `mkdir -p`)
9. **Step 4:** Remove excluded paths that rsync may have copied (iterate `exclude_paths`, `rm -rf` each in public repo)
10. **Step 5:** Special case -- remove tier subdirectories: `find "$PUBLIC_REPO/frontend/src/features/tier" -mindepth 1 -not -name 'index.ts' -delete 2>/dev/null || true`
11. **Step 6:** If not dry-run, `git add -A`, check if changes exist with `git diff --cached --quiet`, commit with message, and push. If dry-run, show `git status --short` instead.

Set the default commit message to `"sync: update public repo from news-investor-pro"`.

Make the file executable: `chmod +x .sync/sync.sh`

The script header should be:
```bash
#!/usr/bin/env bash
set -euo pipefail
```

**Verification Checklist:**
- [ ] Script is executable (`ls -la .sync/sync.sh` shows `x` permission)
- [ ] Script parses config correctly (`bash -n .sync/sync.sh` shows no syntax errors)
- [ ] Dry run succeeds: `.sync/sync.sh --public-repo ~/projects/news-investor --dry-run`

**Testing Instructions:**
- Run `bash -n .sync/sync.sh` to check syntax
- Run with `--dry-run` against the local public repo clone
- Verify the dry-run output shows expected file list

**Commit Message Template:**
```
build(sync): add sync script

- Adapt warmreach-pro sync pattern for news-investor
- rsync with exclusions, overlay application, tier cleanup
- Supports --dry-run for local testing
```

---

## Task 7: Create Initial Overlay Files

**Goal:** Create the community edition overlay files. For this initial phase (before auth/tier code exists), most overlays are copies of the current source files. They establish the overlay structure and will diverge in Phase 2-3.

**Files to Modify/Create:**
- `.sync/overlays/frontend/src/features/tier/index.ts` - New (tier stub)
- `.sync/overlays/frontend/app/_layout.tsx` - New (copy of current)
- `.sync/overlays/frontend/app/(tabs)/_layout.tsx` - New (copy of current)
- `.sync/overlays/frontend/src/config/environment.ts` - New (copy of current)
- `.sync/overlays/backend/template.yaml` - New (copy of current)
- `.sync/overlays/backend/src/index.ts` - New (copy of current)
- `.sync/overlays/docs/ARCHITECTURE.md` - New (copy of current, with "Pro" callout)
- `.sync/overlays/docs/API.md` - New (copy of current, with "Pro" callout)
- `.sync/overlays/CLAUDE.md` - New (community-specific CLAUDE.md)
- `.sync/overlays/README.md` - New (community-specific README)

**Prerequisites:**
- Task 5 complete (config.json exists)
- Read all source files before creating overlays

**Implementation Steps:**

**Tier stub** (`.sync/overlays/frontend/src/features/tier/index.ts`):

This is the one overlay that is NOT a copy. It's a no-op stub that makes the community edition work without any tier infrastructure. All exports must match the pro edition's barrel export interface.

Create a single file that exports:
- `TierProvider` - React component that wraps children, providing a context value with `tier: 'community'`, `isFeatureEnabled: () => true`, all features enabled, empty quotas, `loading: false`, `error: null`
- `useTier()` - Hook returning the context value
- `FeatureGate` - Component that always renders children (ignores `feature` prop)
- `UpgradePrompt` - Returns `null`
- `QuotaUsage` - Returns `null`
- `useCheckout()` - Returns `{ checkout: () => {}, loading: false, error: null }`

Use `React.createElement` instead of JSX (this is a `.ts` file, not `.tsx`) OR name it `.tsx` and update the config path accordingly. Recommendation: use `.ts` with `React.createElement` to match warmreach-pro's pattern.

**Copy overlays** (all other files):

For the initial phase, these are exact copies of the current source files after the rebrand in Task 4. Copy each source file to its overlay location:

| Source | Overlay Destination |
|--------|-------------------|
| `frontend/app/_layout.tsx` | `.sync/overlays/frontend/app/_layout.tsx` |
| `frontend/app/(tabs)/_layout.tsx` | `.sync/overlays/frontend/app/(tabs)/_layout.tsx` |
| `frontend/src/config/environment.ts` | `.sync/overlays/frontend/src/config/environment.ts` |
| `backend/template.yaml` | `.sync/overlays/backend/template.yaml` |
| `backend/src/index.ts` | `.sync/overlays/backend/src/index.ts` |

For documentation overlays (`ARCHITECTURE.md`, `API.md`), copy the current docs and add a note at the bottom:
```markdown
---
*Some features described here are available exclusively in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro).*
```

For `CLAUDE.md` overlay, create a version that:
- References the community edition repo name
- Removes any pro-specific sections (none exist yet)
- Notes that this is the community edition

For `README.md` overlay, create a version that:
- Describes NewsInvestor community edition
- Links to pro edition for additional features
- Includes current setup/build instructions

**Verification Checklist:**
- [ ] All overlay paths listed in `config.json` have corresponding files in `.sync/overlays/`
- [ ] Tier stub exports match the expected interface (TierProvider, useTier, FeatureGate, UpgradePrompt, QuotaUsage, useCheckout)
- [ ] Tier stub TypeScript compiles: `npx tsc --noEmit .sync/overlays/frontend/src/features/tier/index.ts` (may need tsconfig adjustment)

**Testing Instructions:**
- Verify the tier stub is valid TypeScript by reading it and checking for obvious errors
- The full sync test in Task 9 will validate these files work end-to-end

**Commit Message Template:**
```
build(sync): add community edition overlay files

- Create tier stub with no-op implementations
- Copy current source files as initial overlays
- Add community-specific README and CLAUDE.md
- Add pro callout notes to doc overlays
```

---

## Task 8: Create GitHub Actions Workflow

**Goal:** Create the CI workflow that automatically syncs the public repo on every push to main.

**Files to Modify/Create:**
- `.github/workflows/sync-public.yml` - New file

**Prerequisites:**
- Task 3 complete (deploy key set up)
- Task 6 complete (sync script exists)

**Implementation Steps:**

Create `.github/workflows/sync-public.yml`:

```yaml
name: Sync Public Repo

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout news-investor-pro
        uses: actions/checkout@v4
        with:
          path: news-investor-pro

      - name: Clone news-investor (public)
        env:
          DEPLOY_KEY: ${{ secrets.NEWS_INVESTOR_PUBLIC_DEPLOY_KEY }}
        run: |
          mkdir -p ~/.ssh
          echo "$DEPLOY_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
          GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy_key" \
            git clone git@github.com:HatmanStack/news-investor.git news-investor

      - name: Run sync
        env:
          GIT_SSH_COMMAND: "ssh -i ~/.ssh/deploy_key"
        run: |
          cd news-investor
          git config user.name "NewsInvestor Sync Bot"
          git config user.email "sync-bot@newsinvestor.dev"
          cd ..
          news-investor-pro/.sync/sync.sh \
            --public-repo "$GITHUB_WORKSPACE/news-investor" \
            --message "sync: update from news-investor-pro@${{ github.sha }}"

      - name: Cleanup deploy key
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

**Verification Checklist:**
- [ ] YAML is valid (use `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sync-public.yml'))"`)
- [ ] Workflow references correct secret name `NEWS_INVESTOR_PUBLIC_DEPLOY_KEY`
- [ ] Workflow references correct repo names

**Commit Message Template:**
```
ci(sync): add GitHub Actions workflow for public repo sync

- Triggers on push to main and manual dispatch
- Uses deploy key for authenticated push to public repo
- Cleans up deploy key on completion
```

---

## Task 9: Create Pro Features Roadmap

**Goal:** Create the pro features roadmap document that's excluded from the public sync.

**Files to Modify/Create:**
- `docs/PRO_FEATURES_ROADMAP.md` - New file

**Prerequisites:**
- None

**Implementation Steps:**

Create `docs/PRO_FEATURES_ROADMAP.md` with the following content structure:

**Header:** "NewsInvestor Pro -- Feature Roadmap"

**Confirmed features (Phase 1):**
- `full_article_body` -- Full-length article text in sentiment view. Free sees headline + 100-char preview.
- `extended_date_range` -- 365 days of history vs free tier's 90-day limit.
- `unlimited_search` -- Remove 50 searches/day cap.
- `unlimited_sentiment` -- Remove 10 sentiment analyses/day cap.

**Future features (Phase 2 -- Advanced Charting & Portfolio):**
- `advanced_charting` -- Candlestick charts, Bollinger Bands, RSI, MACD overlays
- `chart_annotations` -- User-placed trendlines and support/resistance levels
- `multi_ticker_comparison` -- Overlay multiple tickers on one chart
- `portfolio_export` -- Export to CSV/Excel (price history, sentiment, predictions)
- `portfolio_analytics` -- Aggregate sentiment, sector exposure, correlation matrix
- `watchlist_sync` -- Cloud-synced watchlists via DynamoDB (currently local-only)

**Future features (Phase 3 -- Alerts & ML):**
- `real_time_alerts` -- Push notifications on significant sentiment shifts
- `prediction_alerts` -- Notifications when prediction model flips direction
- `news_alerts` -- Instant notifications for material events (earnings, M&A, guidance)
- `custom_models` -- User-adjustable prediction model parameters
- `backtesting` -- Historical accuracy tracking for predictions
- `sector_sentiment` -- Aggregate sentiment by sector

**Future features (Phase 4 -- Developer Access):**
- `api_access` -- REST API with personal API key
- `webhook_integration` -- Configurable webhooks for external tool integration

Include an "Implementation Notes" section explaining how to add a new pro feature:
1. Add feature flag key to `backend/src/services/tier.service.ts`
2. Add key to community stub overlay with value `true`
3. Gate frontend with `<FeatureGate feature="key">`
4. Gate backend with `featureFlagService.isEnabled()`
5. Update documentation overlays

Use `[ ]` checkboxes for tracking completion status.

**Verification Checklist:**
- [ ] File exists at `docs/PRO_FEATURES_ROADMAP.md`
- [ ] Path is listed in `.sync/config.json` `exclude_paths`

**Commit Message Template:**
```
docs: add pro features roadmap

- Document confirmed and planned premium features
- Include implementation checklist for adding new features
```

---

## Task 10: Validate Full Sync Pipeline

**Goal:** Run the sync end-to-end locally and verify the community edition builds and passes all checks.

**Files to Modify/Create:**
- None (validation only)

**Prerequisites:**
- All previous tasks complete
- `news-investor` repo cloned locally

**Implementation Steps:**

1. Run dry-run first:
   ```
   .sync/sync.sh --public-repo ~/projects/news-investor --dry-run
   ```
   Inspect the output. Verify no pro-only files appear in the status.

2. Run full sync:
   ```
   .sync/sync.sh --public-repo ~/projects/news-investor
   ```

3. Verify the community edition:
   ```
   cd ~/projects/news-investor
   npm install --legacy-peer-deps
   npm run check
   ```

4. Verify excluded files are absent:
   ```
   # These should NOT exist in the public repo:
   ls -la .sync/                           # Should not exist
   ls -la .github/workflows/sync-public.yml # Should not exist
   ls -la docs/PRO_FEATURES_ROADMAP.md     # Should not exist
   ```

5. Verify the tier stub is in place:
   ```
   # Should be a single file (the stub), not the full directory structure:
   ls -la frontend/src/features/tier/
   # Should show only index.ts
   ```

**Verification Checklist:**
- [ ] Dry run completes without errors
- [ ] Full sync commits and pushes to public repo
- [ ] `npm install --legacy-peer-deps` succeeds in public repo
- [ ] `npm run check` passes in public repo (lint + tests)
- [ ] No `.sync/` directory in public repo
- [ ] No `sync-public.yml` in public repo
- [ ] No `PRO_FEATURES_ROADMAP.md` in public repo
- [ ] `frontend/src/features/tier/` contains only `index.ts` in public repo
- [ ] No auth-related files in public repo (no `(auth)/`, no `AuthContext.tsx`, no `cognito.service.ts`)

**Testing Instructions:**
- This task IS the test. Run all verification steps above.
- If `npm run check` fails in the public repo, debug by comparing the synced files against the pro version and checking overlay application.

**Commit Message Template:**
No commit for this task -- it's validation only.

---

## Phase Verification

After completing all tasks in this phase:

1. **Pro repo (`news-investor-pro`):**
   - `npm run check` passes
   - All branding references updated
   - `.sync/` directory exists with config, script, and overlays
   - `.github/workflows/sync-public.yml` exists
   - `docs/PRO_FEATURES_ROADMAP.md` exists

2. **Public repo (`news-investor`):**
   - `npm run check` passes
   - No pro-only files present
   - Tier stub is a single no-op `index.ts`
   - README references community edition

3. **Sync pipeline:**
   - `sync.sh --dry-run` works locally
   - Full sync produces a working public repo
   - GitHub Actions workflow file is in place (will activate when pushed to main)

**Known limitations:**
- Overlay files are currently copies of pro files (they'll diverge in Phase 2-3)
- The tier stub exports interfaces that nothing imports yet (imports added in Phase 3)
- GitHub Actions workflow won't run until code is pushed to main on the renamed repo
