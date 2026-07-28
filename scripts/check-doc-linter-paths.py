#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Check that every doc-linter path argument still resolves in the COMMUNITY tree.

The two doc linters disagree about missing inputs, and the disagreement is the
whole problem:

  markdownlint-cli2 tolerates both. Measured on a staged community tree:
      markdownlint-cli2 'nosuchdir/**/*.md'   -> Linting: 0 file(s), exit 0
      markdownlint-cli2 'docs/GONE.md'        -> Linting: 0 file(s), exit 0

  lychee does not. A path that does not exist is not treated as an empty input;
  it falls back to treating the argument as a URL, and the run then fails on DNS
  resolution. So a glob that matches nothing is harmless, and a LITERAL path
  that the sync removes lands the community docs gate permanently red -- in the
  community repository, where nobody working in this one sees it.

Every path argument here is a glob today, which is why nothing is broken. That
is a property of how the scripts happen to be written, and one literal
`docs/plans/some-plan.md` added to `lint:docs:links` would be enough. This makes
it a property of the repository instead.

What it checks: every non-flag path argument of every markdownlint / lychee
invocation, in package.json scripts and in the `args:` of every
lycheeverse/lychee-action step, in BOTH the pro workflow and the overlay that
becomes the community workflow. Literals must exist in the staged tree. Globs
are reported and not required to match -- the linters tolerate that.

Usage:
  ./scripts/check-doc-linter-paths.py <staged-community-tree>

Give it a tree produced by `.sync/sync.sh --stage-only`, not the pro checkout.
Checking the pro tree proves nothing: the paths the sync removes are exactly the
ones that still exist here.

Exit codes:
  0 - every literal path argument resolves in the given tree
  1 - one or more do not, or no invocations were found at all
"""

from __future__ import annotations

import json
import re
import shlex
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

# Files whose doc-linter invocations must hold in the community edition.
# package.json syncs verbatim (it has no overlay), so its scripts run there as
# written. ci.yml has an overlay, and both sides are checked: the pro workflow
# because it gates this repository, the overlay because it *is* the community
# workflow.
PACKAGE_JSON = REPO_ROOT / "package.json"
WORKFLOWS = [
    REPO_ROOT / ".github/workflows/ci.yml",
    REPO_ROOT / ".sync/overlays/.github/workflows/ci.yml",
]

LINTER_RE = re.compile(r"\b(markdownlint-cli2|lychee)\b")
GLOB_CHARS = set("*?[{")


def path_arguments(command: str) -> tuple[list[str], bool]:
    """Path-looking arguments of a shell command, and whether a linter was located.

    A token counts as a path argument when it does not start with `-` and
    contains a `/` or a `.`. That drops flags (`--no-progress`), flag values
    that are bare numbers (`--max-concurrency 8`), and shell keywords, while
    keeping anything that could name a file. Deliberately generous: a false
    positive here is a token that has to exist, which is a loud and obvious
    failure, whereas a false negative is the silent one.
    """
    try:
        tokens = shlex.split(command)
    except ValueError:
        # Unbalanced quoting -- report rather than guess.
        raise SystemExit(f"Could not parse as a shell command: {command!r}")

    args: list[str] = []
    seen_linter = False
    found_linter = False
    for token in tokens:
        # Match the BASENAME, because the linter is not always a bare token:
        # `./node_modules/.bin/lychee docs/X.md` and `pnpm exec lychee@0.15 ...`
        # both name it with a prefix. invocations() selects a command with
        # LINTER_RE.search over the whole string, so those were selected and then
        # yielded zero arguments -- the command was counted as inspected while
        # its literal paths went unchecked. Exactly the silent false negative
        # this docstring calls the dangerous one.
        if LINTER_RE.fullmatch(token.rsplit("/", 1)[-1].split("@", 1)[0]):
            seen_linter = True
            found_linter = True
            continue
        if not seen_linter:
            continue
        # `&&`, `||`, `;`, `|` and any redirection end the linter's own
        # argument list. The redirect cases are not hypothetical: lint:docs:links
        # opens with `command -v lychee > /dev/null 2>&1 && lychee ...`, and
        # without this the redirect target was collected as a path argument of a
        # probe that is not an invocation at all.
        if (
            token in {"&&", "||", ";", "|"}
            or token.startswith((">", "<"))
            or token.endswith(">")
        ):
            seen_linter = False
            continue
        if token.startswith("-"):
            continue
        if "/" in token or "." in token:
            args.append(token)
    return args, found_linter


def invocations() -> list[tuple[str, str]]:
    """(source description, command) for every doc-linter invocation."""
    found: list[tuple[str, str]] = []

    scripts = json.loads(PACKAGE_JSON.read_text()).get("scripts", {})
    for name, command in scripts.items():
        if LINTER_RE.search(command):
            found.append((f"package.json scripts.{name}", command))

    for workflow_path in WORKFLOWS:
        if not workflow_path.exists():
            raise SystemExit(f"Expected workflow not found: {workflow_path}")
        workflow = yaml.safe_load(workflow_path.read_text())
        rel = workflow_path.relative_to(REPO_ROOT)
        for job_name, job in (workflow.get("jobs") or {}).items():
            for step in job.get("steps") or []:
                uses = str(step.get("uses") or "")
                run = str(step.get("run") or "")
                with_ = step.get("with") or {}
                if "lycheeverse/lychee-action" in uses:
                    args = str(with_.get("args") or "")
                    # The action's args are lychee's own argv.
                    found.append(
                        (f"{rel} {job_name} lychee-action args", f"lychee {args}")
                    )
                elif LINTER_RE.search(run):
                    found.append((f"{rel} {job_name} run", run))
    return found


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <staged-community-tree>")
    tree = Path(sys.argv[1]).resolve()
    if not tree.is_dir():
        raise SystemExit(f"Not a directory: {tree}")

    found = invocations()

    print(f"==> doc-linter path arguments against {tree}")
    print()

    # A guard that inspected nothing is indistinguishable from a passing one.
    if not found:
        print("FAIL: no markdownlint or lychee invocation found at all.")
        print("      Either the linters were removed, or this script's sources")
        print("      list is stale. Both need a human.")
        return 1

    missing: list[tuple[str, str]] = []
    unparsed: list[str] = []
    literal_count = 0
    glob_count = 0

    for source, command in found:
        args, found_linter = path_arguments(command)
        print(f"  {source}")
        # A command that matched LINTER_RE but whose argv could not be located
        # is not a clean bill of health, it is a parse this script got wrong.
        # Reported as a failure rather than as "(no path arguments)", which
        # reads identically to a genuinely argument-free invocation.
        if not found_linter:
            print("      COULD NOT LOCATE THE LINTER'S ARGUMENTS")
            unparsed.append(source)
            continue
        if not args:
            print("      (no path arguments)")
        for arg in args:
            if GLOB_CHARS & set(arg):
                glob_count += 1
                print(f"      glob     {arg}")
                continue
            literal_count += 1
            if (tree / arg).exists():
                print(f"      literal  {arg}   present")
            else:
                print(f"      literal  {arg}   MISSING")
                missing.append((source, arg))
    print()
    print(
        f"    {len(found)} invocation(s), {literal_count} literal path(s), "
        f"{glob_count} glob(s)"
    )
    print()

    if unparsed:
        print("Invocations whose arguments could not be located:")
        for source in unparsed:
            print(f"  {source}")
        print()
        print(f"FAIL: {len(unparsed)} invocation(s) matched a doc linter but this")
        print("      script could not find where its arguments start, so their")
        print("      paths went unchecked. Extend path_arguments() rather than")
        print("      letting it report an unparsed command as clean.")
        return 1

    if missing:
        print("Literal path arguments that do not exist in the community tree:")
        for source, arg in missing:
            print(f"  {arg}   [{source}]")
        print()
        print(f"FAIL: {len(missing)} literal path argument(s) the sync removes.")
        print()
        print("      lychee treats a missing local path as a URL and fails the")
        print("      run on DNS resolution, so this lands the community docs")
        print("      gate permanently red. Use a glob, which both linters")
        print("      tolerate matching nothing, or stop excluding the path.")
        return 1

    print(f"PASS: {literal_count} literal path argument(s) all resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
