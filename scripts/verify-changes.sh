#!/usr/bin/env bash
# FailProducts pre-push verification gate.
#
# Answers two questions before anything leaves the machine:
#   1. What did I actually change?
#   2. Is it safe to push?
#
# Run by hand, by .githooks/pre-push, and by CI (--ci). Deterministic: the same
# input always produces the same verdict, so it can block a push without argument.
#
#   bash scripts/verify-changes.sh              # working tree + unpushed commits
#   bash scripts/verify-changes.sh --staged     # staged changes only
#   bash scripts/verify-changes.sh --range A..B # an explicit commit range
#   bash scripts/verify-changes.sh --ci         # CI mode: no colour, no summary prose
#   bash scripts/verify-changes.sh --quiet      # findings only
#
# Exit codes: 0 = safe to push, 1 = blocked, 2 = could not run.
set -uo pipefail

ALLOWED_EMAIL="180740493+akash-yadav-dev@users.noreply.github.com"
BASE_REF_DEFAULT="origin/main"
LARGE_FILE_KB=500

MODE="worktree"
RANGE=""
CI_MODE=0
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --staged) MODE="staged" ;;
    --range)  MODE="range"; RANGE="${2:-}"; shift ;;
    --ci)     CI_MODE=1 ;;
    --quiet)  QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify-changes: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$CI_MODE" -eq 1 ] || [ ! -t 1 ]; then
  R=""; G=""; Y=""; B=""; DIM=""; X=""
else
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; DIM=$'\033[2m'; X=$'\033[0m'
fi

FAILURES=0
WARNINGS=0
FINDINGS=""

fail() { FAILURES=$((FAILURES+1)); FINDINGS="${FINDINGS}${R}BLOCK${X}  $1"$'\n'; }
warn() { WARNINGS=$((WARNINGS+1)); FINDINGS="${FINDINGS}${Y}WARN ${X}  $1"$'\n'; }
note() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$1"; }
head2() { [ "$QUIET" -eq 1 ] || printf '\n%s%s%s\n' "$B" "$1" "$X"; }

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "verify-changes: not inside a git repository." >&2
  echo "  Run 'git init' and then 'bash scripts/setup-git-identity.sh'." >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" || exit 2

# ---------------------------------------------------------------------------
# Establish what "changed" means for this invocation.
# ---------------------------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
HAS_COMMITS=0
git rev-parse --verify HEAD >/dev/null 2>&1 && HAS_COMMITS=1

# git's well-known empty tree object: the only base that includes a root commit.
EMPTY_TREE="$(git hash-object -t tree /dev/null)"

case "$MODE" in
  staged)
    FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
    DIFF_CMD="git diff --cached -U0 --diff-filter=ACMR"
    STAT_CMD="git diff --cached --stat"
    COMMITS=""
    SCOPE="staged changes"
    ;;
  range)
    if [ -z "$RANGE" ]; then echo "verify-changes: --range needs A..B or a single commit" >&2; exit 2; fi
    case "$RANGE" in
      *..*)
        FILES="$(git diff --name-only --diff-filter=ACMR "$RANGE")"
        DIFF_CMD="git diff -U0 --diff-filter=ACMR $RANGE"
        STAT_CMD="git diff --stat $RANGE"
        COMMITS="$(git rev-list "$RANGE" 2>/dev/null)"
        SCOPE="range $RANGE"
        ;;
      *)
        # A single commit means "this branch's entire history" — the case when a new
        # branch is pushed and the remote has nothing to compare against. Diffing
        # against the empty tree is the only base that includes the root commit.
        FILES="$(git diff --name-only --diff-filter=ACMR "$EMPTY_TREE" "$RANGE")"
        DIFF_CMD="git diff -U0 --diff-filter=ACMR $EMPTY_TREE $RANGE"
        STAT_CMD="git diff --stat $EMPTY_TREE $RANGE"
        COMMITS="$(git rev-list "$RANGE" 2>/dev/null)"
        SCOPE="all history up to ${RANGE:0:12} (no remote baseline)"
        ;;
    esac
    ;;
  *)
    # Everything not yet on the base branch, plus anything uncommitted.
    BASE=""
    if git rev-parse --verify "$BASE_REF_DEFAULT" >/dev/null 2>&1; then
      BASE="$(git merge-base HEAD "$BASE_REF_DEFAULT" 2>/dev/null || true)"
    fi
    if [ -n "$BASE" ]; then
      RANGE="${BASE}..HEAD"
      COMMITS="$(git rev-list "$RANGE" 2>/dev/null)"
      SCOPE="unpushed commits vs ${BASE_REF_DEFAULT}, plus working tree"
      FILES="$( { git diff --name-only --diff-filter=ACMR "$RANGE"; \
                  git diff --name-only --diff-filter=ACMR HEAD; \
                  git diff --cached --name-only --diff-filter=ACMR; } | sort -u )"
      DIFF_CMD="git diff -U0 --diff-filter=ACMR $BASE"
      STAT_CMD="git diff --stat $BASE"
    elif [ "$HAS_COMMITS" -eq 1 ]; then
      COMMITS="$(git rev-list HEAD 2>/dev/null)"
      SCOPE="all commits (no ${BASE_REF_DEFAULT} to compare against), plus working tree"
      FILES="$( { git log --name-only --pretty=format: HEAD; \
                  git diff --name-only --diff-filter=ACMR HEAD; \
                  git diff --cached --name-only --diff-filter=ACMR; } | sort -u | grep -v '^$' )"
      # Empty tree as the base, so the root commit's own contents are scanned too.
      DIFF_CMD="git diff -U0 --diff-filter=ACMR $EMPTY_TREE"
      STAT_CMD="git diff --stat $EMPTY_TREE"
    else
      COMMITS=""
      SCOPE="working tree (no commits yet)"
      FILES="$(git status --porcelain | sed 's/^...//' | sort -u)"
      DIFF_CMD="git diff --cached -U0"
      STAT_CMD="git diff --cached --stat"
    fi
    ;;
esac

FILES="$(printf '%s\n' "$FILES" | grep -v '^$' | sort -u)"
FILE_COUNT="$(printf '%s\n' "$FILES" | grep -c . || true)"

# The guard files carry the credential patterns as regex source, and the test suite
# carries deliberately fake credentials and email addresses as fixtures. Scanning
# either matches this scanner against itself. Excluding them keeps the signal honest;
# none of them holds a real value, and the environment-file check still covers them.
#
# Anything added here must be reviewed by hand — an exclusion is a blind spot, and
# a real secret parked in an excluded file would pass silently.
SELF_EXCLUDE="-- . :!scripts/verify-changes.sh :!scripts/test-verify-changes.sh :!.githooks/pre-commit :!.githooks/commit-msg :!.githooks/pre-push"
ADDED="$($DIFF_CMD $SELF_EXCLUDE 2>/dev/null | grep -E '^\+' | grep -v '^+++' || true)"

# ---------------------------------------------------------------------------
# 1. WHAT CHANGED
# ---------------------------------------------------------------------------
head2 "WHAT CHANGED"
note "Branch:  $BRANCH"
note "Scope:   $SCOPE"
note "Files:   $FILE_COUNT"

if [ "$FILE_COUNT" -eq 0 ]; then
  note ""
  note "${G}Nothing to verify.${X}"
  exit 0
fi

if [ "$QUIET" -eq 0 ]; then
  printf '\n'
  STAT_OUT="$($STAT_CMD 2>/dev/null | tail -40)"
  if [ -n "$STAT_OUT" ]; then
    printf '%s\n' "$STAT_OUT"
  else
    printf '%s\n' "$FILES" | head -40 | sed 's/^/  /'
    [ "$FILE_COUNT" -gt 40 ] && printf '  ... and %d more\n' "$((FILE_COUNT-40))"
  fi
  if [ -n "$COMMITS" ]; then
    printf '\n%sCommits:%s\n' "$DIM" "$X"
    git log --oneline --no-decorate $RANGE 2>/dev/null | head -20 | sed 's/^/  /'
  fi
fi

# Classify the change so the right reviewers get run. docs/AI-WORKFLOW.md §3.
classify() {
  local kinds=""
  printf '%s\n' "$FILES" | grep -qE '^(src/db/|drizzle/)'                  && kinds="$kinds DATABASE"
  printf '%s\n' "$FILES" | grep -qE '^src/(lib/auth|lib/security)/'        && kinds="$kinds SECURITY"
  printf '%s\n' "$FILES" | grep -qE '^src/app/api/'                        && kinds="$kinds SECURITY"
  printf '%s\n' "$FILES" | grep -qE '^src/components/|\.(css|tsx)$'        && kinds="$kinds UI"
  printf '%s\n' "$FILES" | grep -qE '^src/integrations/'                   && kinds="$kinds INTEGRATION"
  printf '%s\n' "$FILES" | grep -qE '^tests/'                              && kinds="$kinds TESTING"
  printf '%s\n' "$FILES" | grep -qE '^(docs/|README|AGENTS|CLAUDE)'        && kinds="$kinds DOCUMENTATION"
  printf '%s\n' "$FILES" | grep -qE '^(package\.json|pnpm-lock\.yaml)$'    && kinds="$kinds DEPENDENCY"
  printf '%s\n' "$FILES" | grep -qE '^(wrangler|next\.config|\.github/)'   && kinds="$kinds DEPLOYMENT"
  # Any other source change is a feature/bugfix slice and still needs a reviewer.
  printf '%s\n' "$FILES" | grep -qE '^src/' \
    && ! printf '%s' "$kinds" | grep -qE 'DATABASE|SECURITY|UI|INTEGRATION' \
    && kinds="$kinds FEATURE"
  [ -z "$kinds" ] && kinds=" GENERAL"
  printf '%s' "${kinds# }"
}
KINDS="$(classify)"
note ""
note "Classification: $KINDS"

# ---------------------------------------------------------------------------
# 2. IMPACT
#
# How far this change can reach. Computed from paths and diff content rather
# than judged, so the reviewer routing has a deterministic input. docs/AI-VERIFICATION.md §3.
# ---------------------------------------------------------------------------
matches() { printf '%s\n' "$FILES" | grep -qE "$1"; }

radius() {
  # Highest matching level wins. Ordered most severe first.
  matches '^drizzle/migrations/'          && { printf 'PRODUCTION-CRITICAL'; return; }
  matches '^src/lib/auth/'                && { printf 'PRODUCTION-CRITICAL'; return; }
  matches '^wrangler\.'                   && { printf 'PRODUCTION-CRITICAL'; return; }
  matches '^\.github/workflows/'          && { printf 'PRODUCTION-CRITICAL'; return; }
  matches '^\.env\.example$'              && { printf 'PRODUCTION-CRITICAL'; return; }

  matches '^src/db/'                      && { printf 'SYSTEM'; return; }
  matches '^src/lib/(security|config)/'   && { printf 'SYSTEM'; return; }
  matches '^(package\.json|pnpm-lock\.yaml|next\.config\.|tsconfig|\.nvmrc)' && { printf 'SYSTEM'; return; }
  matches '^(AGENTS\.md|CLAUDE\.md)$'     && { printf 'SYSTEM'; return; }
  matches '^(scripts/verify-changes\.|\.githooks/)' && { printf 'SYSTEM'; return; }

  matches '^src/components/ui/'           && { printf 'CROSS-FEATURE'; return; }
  matches '^src/lib/'                     && { printf 'CROSS-FEATURE'; return; }
  matches '^src/app/(layout\.tsx|globals\.css)$' && { printf 'CROSS-FEATURE'; return; }
  # More than one domain touched is cross-feature by definition.
  [ "$(printf '%s\n' "$FILES" | grep -oE '^src/domain/[^/]+' | sort -u | grep -c . || true)" -gt 1 ] \
                                          && { printf 'CROSS-FEATURE'; return; }

  matches '^src/'                         && { printf 'FEATURE'; return; }
  printf 'LOCAL'
}
RADIUS="$(radius)"
note "Impact radius: $RADIUS"

# --- Contract changes ------------------------------------------------------
# A contract is anything another file can depend on: an exported symbol, a route,
# an environment variable, a database column. Changing one silently is how a diff
# that reads correctly breaks a caller it never mentions.
CONTRACTS=""
contract() { CONTRACTS="${CONTRACTS}  - $1"$'\n'; }

DELETED="$(git diff --name-only --diff-filter=DR ${RANGE:-HEAD} 2>/dev/null || true)"

if [ -d src ]; then
  # Exported symbols removed from src/ — every one may have a caller elsewhere.
  GONE="$($DIFF_CMD -- src 2>/dev/null | grep -E '^-' | grep -v '^---' \
          | grep -oE 'export +(async +)?(function|const|class|type|interface|enum) +[A-Za-z0-9_]+' \
          | awk '{print $NF}' | sort -u || true)"
  while IFS= read -r sym; do
    [ -z "$sym" ] && continue
    users="$(grep -rlF "$sym" src tests 2>/dev/null | grep -c . || true)"
    contract "exported symbol '$sym' removed or renamed — $users file(s) mention it"
  done <<< "$GONE"
fi

# Route files coming or going change public URLs. ADR-019: retired URLs redirect.
ROUTES="$( { printf '%s\n' "$FILES"; printf '%s\n' "$DELETED"; } \
           | grep -E '^src/app/.*/(page|route)\.tsx?$' || true)"
[ -n "$ROUTES" ] && contract "public route(s) changed — confirm redirects for any retired URL (ADR-019)"

# Environment contract: a name added or removed must be documented and deployed.
if printf '%s\n' "$FILES" | grep -q '^\.env\.example$'; then
  ENVDELTA="$($DIFF_CMD -- .env.example 2>/dev/null | grep -E '^[+-][A-Z0-9_]+=' | sort -u || true)"
  [ -n "$ENVDELTA" ] && contract "environment variable contract changed — update docs/DEPLOYMENT.md and the deployment secrets"
fi

printf '%s\n' "$FILES" | grep -qE '^src/app/api/' && contract "API route(s) changed — check every consumer of the response shape"
printf '%s\n' "$FILES" | grep -qE '^drizzle/migrations/' && contract "database contract changed — check every query against the affected tables"

if [ -n "$CONTRACTS" ]; then
  note ""
  note "Contract changes:"
  [ "$QUIET" -eq 0 ] && printf '%s' "$CONTRACTS"
fi

# ---------------------------------------------------------------------------
# 3. IS IT SAFE TO PUSH
# ---------------------------------------------------------------------------
head2 "SAFETY CHECKS"

# --- Branch protection -----------------------------------------------------
if [ "$BRANCH" = "main" ] && [ "$CI_MODE" -eq 0 ]; then
  fail "on branch 'main' — main is protected; branch first (CLAUDE.md §2)"
elif [ "$BRANCH" = "main" ]; then
  # CI runs after a protected merge has landed. The repository setting, not
  # this post-push observer, prevents direct pushes to main.
  note "  branch                 main observed in CI (server-side protection applies)"
else
  note "  branch                 ok ($BRANCH)"
fi

# --- Environment files -----------------------------------------------------
ENVFILES="$(printf '%s\n' "$FILES" | grep -E '(^|/)\.env($|\.)|(^|/)\.dev\.vars$' | grep -v '^\.env\.example$' || true)"
if [ -n "$ENVFILES" ]; then
  fail "environment file(s) in the change: $(printf '%s' "$ENVFILES" | tr '\n' ' ')"
else
  note "  environment files      ok"
fi

# .env.example must carry names only, never values.
if printf '%s\n' "$FILES" | grep -q '^\.env\.example$' && [ -f .env.example ]; then
  if grep -qE '^[A-Z0-9_]+=.+' .env.example; then
    fail ".env.example contains values; it must hold names only (CLAUDE.md §4)"
  else
    note "  .env.example           ok (names only)"
  fi
fi

# --- Credential shapes -----------------------------------------------------
SECRETS='(postgres(ql)?://[^ "'"'"']*:[^ "'"'"']*@|sk_live_|sk_test_|rk_live_|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Zoho-enczapikey |AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)'
HITS="$(printf '%s\n' "$ADDED" | grep -nEi -- "$SECRETS" | head -10 || true)"
if [ -n "$HITS" ]; then
  fail "credential pattern in added lines:"
  FINDINGS="${FINDINGS}$(printf '%s\n' "$HITS" | sed 's/^/         /')"$'\n'
else
  note "  credential patterns    ok"
fi

# --- Email addresses -------------------------------------------------------
# Allowlist, not blocklist: naming the addresses to block would publish them.
#
# Case is normalised with tr rather than grep -i, because GNU grep 3.0 as shipped
# with Git for Windows aborts (SIGABRT) when -i and -F are combined. That crash is
# silent inside a pipeline, which would turn this guard into a no-op.
LEAKED="$(printf '%s\n' "$ADDED" \
          | grep -oiE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' \
          | tr 'A-Z' 'a-z' \
          | grep -vF "$ALLOWED_EMAIL" \
          | grep -vE '@(example\.(com|org|net|test)|failproducts\.(com|test)|users\.noreply\.github\.com|sentry\.io|schema\.org)$' \
          | sort -u || true)"
if [ -n "$LEAKED" ]; then
  fail "non-allowlisted email address in added lines: $(printf '%s' "$LEAKED" | tr '\n' ' ')"
else
  note "  email addresses        ok"
fi

# --- Public-surface hygiene ------------------------------------------------
# .claude/ and mcp/ are as public as README.md and must never carry real config.
PUBSURF="$(printf '%s\n' "$FILES" | grep -E '^(\.claude/|mcp/)' || true)"
if [ -n "$PUBSURF" ]; then
  BAD="$(printf '%s' "$PUBSURF" | tr '\n' ' ' | xargs -r grep -lniE \
        'account[_-]?id["'"'"']?\s*[:=]\s*["'"'"'][0-9a-f]{16,}|ep-[a-z0-9-]+\.(aws|azure)|[a-z0-9]{32,}' 2>/dev/null || true)"
  if [ -n "$BAD" ]; then
    fail "possible real identifier or credential in a public AI-config file: $(printf '%s' "$BAD" | tr '\n' ' ')"
  else
    note "  .claude/ + mcp/        ok (placeholders only)"
  fi
fi

# --- Large files -----------------------------------------------------------
BIG=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  kb=$(( $(wc -c < "$f") / 1024 ))
  [ "$kb" -gt "$LARGE_FILE_KB" ] && BIG="$BIG  $f (${kb}KB)"$'\n'
done <<< "$FILES"
if [ -n "$BIG" ]; then
  warn "file(s) over ${LARGE_FILE_KB}KB — git history is permanent:"$'\n'"$(printf '%s' "$BIG" | sed 's/^/       /')"
else
  note "  file sizes             ok"
fi

# --- Commit hygiene --------------------------------------------------------
if [ -n "$COMMITS" ]; then
  ATTRIB=0; NOSIGN=""; BADAUTH=""
  while IFS= read -r c; do
    [ -z "$c" ] && continue
    body="$(git log -1 --format='%B' "$c")"
    printf '%s' "$body" | grep -qiE 'Co-authored-by:.*(claude|anthropic|copilot|cursor|codex|gemini|gpt|\bai\b)|generated with \[?(claude|copilot|cursor)|^[[:space:]]*🤖' && ATTRIB=$((ATTRIB+1))
    printf '%s' "$body" | grep -qi '^Signed-off-by:' || NOSIGN="$NOSIGN $(git log -1 --format='%h' "$c")"
    ae="$(git log -1 --format='%ae' "$c")"
    [ "$ae" != "$ALLOWED_EMAIL" ] && BADAUTH="$BADAUTH $(git log -1 --format='%h <%ae>' "$c")"
  done <<< "$COMMITS"

  [ "$ATTRIB" -gt 0 ] && fail "$ATTRIB commit message(s) carry AI attribution (CLAUDE.md §1)" \
                      || note "  commit attribution     ok"
  [ -n "$NOSIGN" ] && fail "commit(s) missing DCO sign-off:$NOSIGN — use 'git commit -s'" \
                   || note "  DCO sign-off           ok"
  [ -n "$BADAUTH" ] && fail "commit(s) with a non-allowlisted author:$BADAUTH" \
                    || note "  commit author          ok"
fi

# --- Hooks installed -------------------------------------------------------
HOOKS_PATH="$(git config --local core.hooksPath || true)"
if [ "$HOOKS_PATH" != ".githooks" ]; then
  warn "core.hooksPath is '${HOOKS_PATH:-unset}', expected '.githooks' — run scripts/setup-git-identity.sh"
else
  note "  hooks installed        ok"
fi

# ---------------------------------------------------------------------------
# 4. CHANGE-SPECIFIC GATES
# ---------------------------------------------------------------------------
head2 "CHANGE GATES"

# --- Configuration ---------------------------------------------------------
# Runtime and build configuration decides whether the deployed thing works at
# all, and a mistake here fails after merge rather than in review.
CONFIG="$(printf '%s\n' "$FILES" | grep -E '^(next\.config\.|wrangler\.|tsconfig|\.nvmrc|eslint\.|tailwind\.|drizzle\.config\.|\.github/workflows/)' || true)"
if [ -n "$CONFIG" ]; then
  warn "configuration changed — verify Workers compatibility and that preview matches production: $(printf '%s' "$CONFIG" | tr '\n' ' ')"
  printf '%s\n' "$ADDED" | grep -qE 'nodejs_compat|node_compat' \
    && warn "Node compatibility flag touched in Workers config — confirm the runtime still rejects Node-only APIs on request paths"
else
  note "  configuration          unchanged"
fi

case "$KINDS" in
  *DEPENDENCY*)
    warn "package.json or lockfile changed — run the dependency-gate skill and record the outcome in the PR" ;;
  *) note "  dependencies           unchanged" ;;
esac

# An applied migration is immutable. Modifying one is the mistake that cannot be undone.
MODIFIED_MIGRATIONS="$(git diff --name-only --diff-filter=M ${RANGE:-HEAD} 2>/dev/null | grep -E '^drizzle/migrations/.*\.sql$' || true)"
if [ -n "$MODIFIED_MIGRATIONS" ]; then
  fail "existing migration file(s) modified — applied migrations are immutable, fix forward: $(printf '%s' "$MODIFIED_MIGRATIONS" | tr '\n' ' ')"
fi

case "$KINDS" in
  *DATABASE*)
    printf '%s\n' "$FILES" | grep -qE '^drizzle/migrations/' \
      || warn "schema changed but no migration added — run the database skill"
    printf '%s\n' "$ADDED" | grep -qiE 'drop (column|table)|rename' \
      && warn "destructive SQL in the diff — confirm expand/migrate/contract (database skill)"
    ;;
esac

# Documentation is the specification: source changes should move a doc with them.
if printf '%s\n' "$FILES" | grep -qE '^src/' && ! printf '%s\n' "$FILES" | grep -qE '^docs/'; then
  warn "source changed with no documentation change — confirm no documented behaviour moved (AGENTS.md §4)"
fi

# ---------------------------------------------------------------------------
# 5. PROJECT CHECKS (only if an implementation exists)
# ---------------------------------------------------------------------------
head2 "PROJECT CHECKS"
if [ -f package.json ] && [ ! -d node_modules ]; then
  # CI's hygiene job checks out the repository without installing anything, and
  # the app job owns lint/typecheck/test. Running them here would fail on a
  # missing toolchain rather than on a real defect.
  note "  ${DIM}skipped — dependencies not installed (CI runs these in the 'app' job)${X}"
elif [ -f package.json ]; then
  run_step() {
    local label="$1"; shift
    if ! grep -q "\"$1\"" package.json 2>/dev/null; then
      note "  $label  skipped (no '$1' script)"
      return
    fi
    if pnpm "$1" >/tmp/verify-$1.log 2>&1; then
      note "  $label  ${G}pass${X}"
    else
      fail "$label failed — see /tmp/verify-$1.log"
      tail -15 "/tmp/verify-$1.log" | sed 's/^/         /' >&2
    fi
  }
  run_step "typecheck  " typecheck
  run_step "lint       " lint
  run_step "test       " test
else
  note "  ${DIM}skipped — no package.json; repository is pre-implementation${X}"
fi

# ---------------------------------------------------------------------------
# VERDICT
# ---------------------------------------------------------------------------
head2 "VERDICT"
[ -n "$FINDINGS" ] && printf '%s' "$FINDINGS"

# Reviewers this change class requires. docs/AI-WORKFLOW.md §4 is authoritative;
# this is the same table, computed, so the routing decision is not left to memory.
reviewers() {
  local r=""
  case "$KINDS" in *DATABASE*)    r="$r architecture-reviewer security-reviewer" ;; esac
  case "$KINDS" in *SECURITY*)    r="$r security-reviewer" ;; esac
  case "$KINDS" in *UI*)          r="$r product-quality-reviewer performance-reviewer" ;; esac
  case "$KINDS" in *INTEGRATION*) r="$r architecture-reviewer security-reviewer performance-reviewer" ;; esac
  case "$KINDS" in *FEATURE*)     r="$r architecture-reviewer security-reviewer" ;; esac
  case "$KINDS" in *DEPENDENCY*)  r="$r scope-skeptic security-reviewer" ;; esac
  case "$RADIUS" in
    SYSTEM|PRODUCTION-CRITICAL)   r="$r architecture-reviewer release-verifier" ;;
  esac
  [ -n "$CONTRACTS" ]           && r="$r impact-analyzer"
  printf '%s' "$r" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' '
}

if [ "$FAILURES" -gt 0 ]; then
  printf '\n%sBLOCK%s — %d blocking finding(s), %d warning(s).\n' "$R" "$X" "$FAILURES" "$WARNINGS"
  printf 'Fix them, or bypass deliberately with: git push --no-verify\n'
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  printf '\n%sPASS_WITH_WARNINGS%s — safe to push, with %d warning(s) above.\n' "$Y" "$X" "$WARNINGS"
  printf 'Read them. A warning is a decision to record, not an automatic pass.\n'
else
  printf '\n%sPASS%s — no findings.\n' "$G" "$X"
fi

if [ "$QUIET" -eq 0 ]; then
  printf '\n%sImpact: %s · Class: %s%s\n' "$DIM" "$RADIUS" "$KINDS" "$X"
  SUGGESTED="$(reviewers)"
  if [ -n "$SUGGESTED" ]; then
    printf '%sReviewers to run: %s%s\n' "$DIM" "$SUGGESTED" "$X"
  else
    printf '%sNo reviewer required for this change class (docs/AI-WORKFLOW.md §4).%s\n' "$DIM" "$X"
  fi
  printf '%sThis gate proves the change is not obviously unsafe. It does not prove it is correct.%s\n' "$DIM" "$X"
fi
exit 0
