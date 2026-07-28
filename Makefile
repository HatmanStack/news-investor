.PHONY: setup setup-python test check-full test-e2e lint ministack ministack-stop dev build-admin deploy-admin sync-check

setup: setup-python
	npm install --legacy-peer-deps

# Installs the Python toolchain the tests and linters need. There was no
# documented way to do this anywhere in the repo, while CONTRIBUTING documents a
# pytest command that fails on a fresh clone with "No module named pytest".
#
# The logic lives in the script because it has to branch: an active virtualenv
# is used as-is, and otherwise ./.venv is created. The recipe that stood here
# assumed an environment and failed on the clean machine it existed for.
setup-python:
	./scripts/setup-python.sh

test:
	npm run check

# Everything `npm run check` deliberately leaves out, because each of these
# fails for environmental rather than code reasons and a local gate that fails
# for environmental reasons is one contributors learn to skip:
#   - E2E needs Docker
#   - the link check needs the lychee binary and network access
#   - shellcheck is an external binary
#   - vulture is a Python tool `npm run hygiene` skips gracefully when absent
# CI runs all four. This target is how you run them before opening a PR.
check-full: test
	shellcheck --severity=warning scripts/*.sh backend/scripts/*.sh admin/scripts/*.sh .sync/*.sh backend/localstack-init/*.sh
	npm run hygiene
	npm run lint:docs:links
	$(MAKE) ministack
	$(MAKE) test-e2e
	$(MAKE) ministack-stop

test-e2e:
	cd backend && npm run test:e2e

lint:
	npm run lint && npm run lint:backend && npm run lint:ml

# The pro/community boundary audit. Both guards also run in `npm run check` and
# in CI, in their default (structural) mode.
#
# This target adds --strict, which promotes warnings to a failure. It exits 1
# today, on purpose: as of 2026-07-28 there are 11 overlays whose source moved
# after them and 51 markdown headings the reduced community docs omit. The
# second group is largely deliberate — see the header of overlay-staleness.sh —
# so this is a backlog to read, not a gate to satisfy. Both counts move; the
# script prints the current ones. CI deliberately does not run --strict.
# Guarded on .sync/ because this Makefile syncs verbatim to the community
# edition, where none of these scripts have a config to read. A target that can
# only fail is worse than one that says why it did nothing.
#
# One shell for the whole recipe, and that is the point rather than a style
# choice. Make runs each recipe LINE in its own shell, so a guard on its own
# line can only `exit 0` out of that line -- Make then runs the rest anyway.
# Measured in a staged community tree before this was joined up: the target
# printed "nothing to check" and then ran all four scripts, dying on
# `KeyError: 'changes'` with exit 2. `set -e` restores the stop-on-first-failure
# that separate lines gave for free.
sync-check:
	@if [ ! -d .sync ]; then \
		echo '.sync/ absent (community edition) - nothing to check'; \
		exit 0; \
	fi; \
	set -e; \
	echo '==> check-sync-filter-coverage.py';    ./scripts/check-sync-filter-coverage.py; \
	echo '==> sync-leak-audit.sh';               ./scripts/sync-leak-audit.sh; \
	echo '==> check-overlay-autofix-safety.sh';  ./scripts/check-overlay-autofix-safety.sh; \
	echo '==> overlay-staleness.sh --strict';    ./scripts/overlay-staleness.sh --strict

ministack:
	docker compose up -d
	@echo "Waiting for MiniStack..."
	@timeout 60 bash -c 'until curl -s http://localhost:4566/_ministack/health | grep -qE "\"(running|available)\""; do sleep 1; done'
	@echo "MiniStack ready at http://localhost:4566"

ministack-stop:
	docker compose down

dev: setup ministack  ## One-step local development setup
	@echo "Ready. Run 'npm start' to start the Expo dev server."

build-admin:
	cd admin && npm run build

deploy-admin:
	cd admin && npm run deploy
