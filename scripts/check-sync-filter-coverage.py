#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Check that CI's sync-guards job is actually triggered for every overlaid file.

The two sync guards can be correct and still watch nothing, because a CI job has
two halves and only one of them is the script. `overlay-staleness.sh` was proven
to bite by mutating `.github/workflows/ci.yml` and watching it exit 1 -- and the
job that runs it was gated on `sync || backend || frontend || docs`, none of
whose globs match `.github/workflows/ci.yml`. A pull request changing only that
file skipped the job, and `status-check` counted the skip as a pass. Three of the
thirty overlay mappings were in that position, including the one the
demonstration used.

That is not a mistake you find by reading globs. It is found by matching the
mappings against the globs mechanically, which is what this does:

  1. parse the `changes` job's dorny/paths-filter `filters` input,
  2. read which of those filters the `sync-guards` job's `if:` consults,
  3. union their globs into the set of paths that trigger the job,
  4. assert every path in `.sync/config.json` `overlay_mappings` -- both the
     source and the overlay -- is in that set.

`sync-guards` now carries no `if:` at all, so step 4 passes trivially and this
script's live job is step 2: it fails loudly if someone puts a condition back
and that condition does not cover every overlay-mapped path. Widening a filter
was the wrong fix for that class -- the PR that edits the configuration an
assertion is about is the PR a filter is most likely to exempt -- so the job is
unconditional and this script guards the decision rather than the globs. Keep it
wired: an unconditional job is a choice someone can undo in one line.

Exit codes:
  0 - every overlay-mapped path triggers the job
  1 - at least one does not, or the workflow could not be read as expected
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
CONFIG = REPO_ROOT / ".sync/config.json"

# The job whose trigger must cover the overlay mappings.
GUARD_JOB = "sync-guards"
# The job that computes the paths filters the guard job consults.
FILTER_JOB = "changes"


def glob_to_regex(glob: str) -> re.Pattern[str]:
    """Translate a picomatch-style glob to a regex.

    dorny/paths-filter matches with picomatch. Only the subset this repo's
    filters use is handled, and unsupported syntax is rejected loudly rather
    than silently mistranslated -- a glob this function gets wrong would make
    the whole check report false coverage, which is the failure mode it exists
    to prevent.
    """
    if any(ch in glob for ch in "{}[]()!+@|"):
        raise SystemExit(
            f"Unsupported glob syntax in a paths filter: {glob!r}. "
            "Extend glob_to_regex before using it."
        )

    out: list[str] = []
    i = 0
    while i < len(glob):
        if glob.startswith("**/", i):
            # Zero or more leading directories.
            out.append("(?:[^/]+/)*")
            i += 3
        elif glob.startswith("**", i):
            out.append(".*")
            i += 2
        elif glob[i] == "*":
            out.append("[^/]*")
            i += 1
        elif glob[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(glob[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def load_filters() -> dict[str, list[str]]:
    workflow = yaml.safe_load(WORKFLOW.read_text())
    steps = workflow["jobs"][FILTER_JOB]["steps"]
    for step in steps:
        with_ = step.get("with") or {}
        if "filters" in with_:
            filters = yaml.safe_load(with_["filters"])
            return {name: list(globs) for name, globs in filters.items()}
    raise SystemExit(f"No paths-filter step found in the '{FILTER_JOB}' job.")


def guard_job_filter_names() -> list[str]:
    workflow = yaml.safe_load(WORKFLOW.read_text())
    job = workflow["jobs"].get(GUARD_JOB)
    if job is None:
        raise SystemExit(f"No '{GUARD_JOB}' job in {WORKFLOW}.")
    condition = job.get("if")
    if condition is None:
        # No condition means the job always runs, which trivially covers
        # everything. Report it rather than treating it as an error.
        return []
    names = re.findall(r"needs\.changes\.outputs\.([A-Za-z0-9_-]+)", condition)
    if not names:
        raise SystemExit(
            f"The '{GUARD_JOB}' job has an if: that consults no paths filter: {condition!r}"
        )
    return sorted(set(names))


def main() -> int:
    filters = load_filters()
    names = guard_job_filter_names()

    if not names:
        print(f"'{GUARD_JOB}' has no if: condition, so it runs for every change.")
        return 0

    unknown = [n for n in names if n not in filters]
    if unknown:
        raise SystemExit(
            f"'{GUARD_JOB}' consults filters that the '{FILTER_JOB}' job does not "
            f"define: {', '.join(unknown)}"
        )

    covered = [
        (name, glob, glob_to_regex(glob)) for name in names for glob in filters[name]
    ]

    config = json.loads(CONFIG.read_text())
    mappings = config["overlay_mappings"]
    # Both sides matter. The source is what goes stale; the overlay is what a
    # contributor updates to fix it, and a PR containing only the overlay must
    # also run the guard.
    paths = sorted(set(mappings.keys()) | set(mappings.values()))

    uncovered: list[str] = []
    for path in paths:
        if not any(pattern.match(path) for _, _, pattern in covered):
            uncovered.append(path)

    print(f"==> sync-guards trigger coverage over {len(paths)} overlay-mapped paths")
    print(f"    filters consulted: {', '.join(names)}")
    print()

    if uncovered:
        print("Overlay-mapped paths that do NOT trigger the sync-guards job:")
        for path in uncovered:
            print(f"  {path}   [matched filters: (none)]")
        print()
        print(f"FAIL: {len(uncovered)} of {len(paths)} uncovered.")
        print()
        print("      The guards themselves can be perfectly correct and still")
        print("      never run. Add a glob to one of the filters the job")
        print(f"      consults ({', '.join(names)}), or widen the job's if:.")
        return 1

    print(f"PASS: 0 of {len(paths)} uncovered.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
