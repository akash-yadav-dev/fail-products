#!/usr/bin/env bash
# Tests for .githooks/pre-push.
#
# ADR-023 records a hook bug that shipped because nothing tested the hook: the
# email-leak guard crashed on Windows and passed every commit silently. "A guard
# nobody tests is a guard nobody has" is that ADR's own conclusion, and the hook
# still had no tests. This file is the missing half.
#
# Each case builds a throwaway repository, drives the hook the way git does —
# one line of "<local ref> <local sha> <remote ref> <remote sha>" on stdin — and
# asserts on the range it chose rather than on the whole gate's verdict. The
# range is the part that was wrong, and it is testable without a network.
#
#   bash scripts/test-pre-push.sh
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.githooks/pre-push"
ZERO="0000000000000000000000000000000000000000"

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1"; echo "       $2"; }

# A sandbox repository with a fake "remote", so nothing touches the network and
# nothing can reach the real origin.
setup_sandbox() {
  SANDBOX="$(mktemp -d)"
  REMOTE="$SANDBOX/remote.git"
  WORK="$SANDBOX/work"

  git init --quiet --bare "$REMOTE"
  git init --quiet "$WORK"
  cd "$WORK" || exit 2

  git config user.name "Test"
  git config user.email "test@example.test"
  git config commit.gpgsign false
  git remote add origin "$REMOTE"

  # The hook calls verify-changes.sh. This test is about which range the hook
  # picks, not about what the gate concludes, so a stub stands in and simply
  # records the range it was handed.
  mkdir -p "$WORK/scripts"
  cat > "$WORK/scripts/verify-changes.sh" <<'STUB'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do
  case "$1" in
    --range) echo "$2" > "$RANGE_SINK"; shift ;;
  esac
  shift
done
exit 0
STUB
  chmod +x "$WORK/scripts/verify-changes.sh"

  mkdir -p "$WORK/.githooks"
  cp "$HOOK" "$WORK/.githooks/pre-push"

  export RANGE_SINK="$SANDBOX/range"
  : > "$RANGE_SINK"
}

teardown_sandbox() {
  cd "$REPO_ROOT" || exit 2
  rm -rf "$SANDBOX"
}

commit() {
  echo "$1" > "$WORK/$1.txt"
  git add -A
  git commit --quiet -m "$1"
}

# Drives the hook exactly as git does.
run_hook() {
  printf '%s %s %s %s\n' "$1" "$2" "$3" "$4" | bash "$WORK/.githooks/pre-push" origin "$REMOTE"
}

echo "pre-push hook"

# ---------------------------------------------------------------------------
# The regression this file exists for.
# ---------------------------------------------------------------------------
setup_sandbox
commit "base"
commit "on-main"
git branch --quiet -M main
git push --quiet --no-verify origin main

# `dev` gains commits of its own, exactly as the real promotion path does.
git checkout --quiet -b dev
commit "on-dev-1"
commit "on-dev-2"
git push --quiet --no-verify origin dev

# A feature branch cut from dev, with two commits of its own.
git checkout --quiet -b feature/thing
commit "feature-1"
commit "feature-2"
TIP="$(git rev-parse HEAD)"

run_hook "refs/heads/feature/thing" "$TIP" "refs/heads/feature/thing" "$ZERO" >/dev/null 2>&1
RANGE="$(cat "$RANGE_SINK")"
COUNT="$(git rev-list "$RANGE" 2>/dev/null | wc -l | tr -d ' ')"

if [ "$COUNT" = "2" ]; then
  pass "a branch cut from dev audits only its own commits"
else
  fail "a branch cut from dev audits only its own commits" \
       "range '$RANGE' covers $COUNT commit(s), expected 2 — the commits already on dev are being re-audited"
fi
teardown_sandbox

# ---------------------------------------------------------------------------
# The property the main-anchored version was protecting, which must survive.
# ---------------------------------------------------------------------------
setup_sandbox
commit "base"
commit "on-main"
git branch --quiet -M main
git push --quiet --no-verify origin main

git checkout --quiet -b feature/off-main
commit "secret-ish"
commit "innocent"
TIP="$(git rev-parse HEAD)"

run_hook "refs/heads/feature/off-main" "$TIP" "refs/heads/feature/off-main" "$ZERO" >/dev/null 2>&1
RANGE="$(cat "$RANGE_SINK")"
COUNT="$(git rev-list "$RANGE" 2>/dev/null | wc -l | tr -d ' ')"

if [ "$COUNT" = "2" ]; then
  pass "a new branch audits every commit the remote lacks, not just the tip"
else
  fail "a new branch audits every commit the remote lacks, not just the tip" \
       "range '$RANGE' covers $COUNT commit(s), expected 2"
fi
teardown_sandbox

# ---------------------------------------------------------------------------
# A first push, with nothing on the remote to anchor against.
# ---------------------------------------------------------------------------
setup_sandbox
commit "first"
commit "second"
git branch --quiet -M main
TIP="$(git rev-parse HEAD)"

run_hook "refs/heads/main" "$TIP" "refs/heads/other" "$ZERO" >/dev/null 2>&1
RANGE="$(cat "$RANGE_SINK")"
COUNT="$(git rev-list "$RANGE" 2>/dev/null | wc -l | tr -d ' ')"

if [ "$COUNT" = "2" ]; then
  pass "a first push scans the whole history"
else
  fail "a first push scans the whole history" \
       "range '$RANGE' covers $COUNT commit(s), expected 2"
fi
teardown_sandbox

# ---------------------------------------------------------------------------
# Nothing new: the gate must not be invoked at all.
# ---------------------------------------------------------------------------
setup_sandbox
commit "base"
git branch --quiet -M main
git push --quiet --no-verify origin main

git checkout --quiet -b feature/empty
TIP="$(git rev-parse HEAD)"

run_hook "refs/heads/feature/empty" "$TIP" "refs/heads/feature/empty" "$ZERO" >/dev/null 2>&1
RANGE="$(cat "$RANGE_SINK")"

if [ -z "$RANGE" ]; then
  pass "a branch the remote already has is a no-op"
else
  fail "a branch the remote already has is a no-op" \
       "the gate ran on range '$RANGE'; nothing is leaving the machine"
fi
teardown_sandbox

# ---------------------------------------------------------------------------
# main stays protected. CLAUDE.md section 2.
# ---------------------------------------------------------------------------
setup_sandbox
commit "base"
git branch --quiet -M main
git push --quiet --no-verify origin main
commit "sneaky"
TIP="$(git rev-parse HEAD)"

if run_hook "refs/heads/main" "$TIP" "refs/heads/main" "$(git rev-parse HEAD~1)" >/dev/null 2>&1; then
  fail "a push to main is refused" "the hook exited 0"
else
  pass "a push to main is refused"
fi
teardown_sandbox

# ---------------------------------------------------------------------------
# An update to an existing branch still uses what the remote actually has.
# ---------------------------------------------------------------------------
setup_sandbox
commit "base"
git branch --quiet -M main
git push --quiet --no-verify origin main
git checkout --quiet -b feature/update
commit "one"
git push --quiet --no-verify origin feature/update
BEFORE="$(git rev-parse HEAD)"
commit "two"
commit "three"
TIP="$(git rev-parse HEAD)"

run_hook "refs/heads/feature/update" "$TIP" "refs/heads/feature/update" "$BEFORE" >/dev/null 2>&1
RANGE="$(cat "$RANGE_SINK")"
COUNT="$(git rev-list "$RANGE" 2>/dev/null | wc -l | tr -d ' ')"

if [ "$COUNT" = "2" ]; then
  pass "an update to an existing branch audits only the new commits"
else
  fail "an update to an existing branch audits only the new commits" \
       "range '$RANGE' covers $COUNT commit(s), expected 2"
fi
teardown_sandbox

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ] || exit 1
