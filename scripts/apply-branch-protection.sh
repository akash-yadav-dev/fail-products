#!/usr/bin/env bash
# Applies the branch protection specified in .github/BRANCH-PROTECTION.md to the
# two protected branches. Safe to re-run: it replaces each ruleset's rule set
# with the same definition every time.
#
# Requires the gh CLI, authenticated as a repository admin.
#
#   bash scripts/apply-branch-protection.sh --dry-run   # print the diff, change nothing
#   bash scripts/apply-branch-protection.sh             # apply
#
# Why a script rather than clicking through Settings: the configuration in
# BRANCH-PROTECTION.md is the specification, and a specification nobody can
# execute drifts from reality the moment someone changes one checkbox. This is
# how that file's "Measured state" section gets back to all-green, and rerunning
# it is how it stays there.
set -euo pipefail

REPO="${REPO:-akash-yadav-dev/fail-products}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found on PATH." >&2
  exit 2
fi

# The contexts must match the job `name:` values in .github/workflows/ci.yml
# exactly. A required check that never reports is indistinguishable from one
# that has not finished, and the pull request waits forever. These three are the
# jobs that always run; "Detect application" is a plumbing job and "Dependency
# review" only runs on pull_request and is skipped until the Dependency graph is
# enabled, so neither is required.
read -r -d '' RULES <<'JSON' || true
[
  { "type": "deletion" },
  { "type": "non_fast_forward" },
  { "type": "required_linear_history" },
  {
    "type": "required_status_checks",
    "parameters": {
      "strict_required_status_checks_policy": true,
      "do_not_enforce_on_create": false,
      "required_status_checks": [
        { "context": "Repository hygiene" },
        { "context": "Lint, typecheck, test, build" },
        { "context": "End-to-end" }
      ]
    }
  },
  {
    "type": "pull_request",
    "parameters": {
      "allowed_merge_methods": ["squash", "rebase"],
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": true,
      "require_extra_approval_for_unattributed_changes": true,
      "require_last_push_approval": true,
      "required_approving_review_count": 1,
      "required_review_thread_resolution": false,
      "required_reviewers": []
    }
  }
]
JSON

# Deliberately absent: `required_signatures`. Commit signing is not configured
# in this repository, so requiring it would make every future pull request
# unmergeable — including the one that would configure signing.
#
# `allowed_merge_methods` drops "merge". Every private-address leak in this
# repository's history came from a GitHub merge-button commit, which is authored
# with the account's primary address rather than the repo-local identity. Squash
# and rebase merges do not create one. That is a narrowing of the leak surface,
# not a fix — the account-level settings in BRANCH-PROTECTION.md are the fix.

# The list endpoint returns rulesets without their `conditions` — every entry
# reports `include: null` — so the target branch can only be read from each
# ruleset's own detail endpoint. Matching on the list would silently find
# nothing and report the ruleset as missing, which is how this script failed the
# first time it was run.
ruleset_for_branch() {
  local want="refs/heads/$1" id
  for id in $(gh api "repos/$REPO/rulesets" --jq '.[].id'); do
    if [ "$(gh api "repos/$REPO/rulesets/$id" \
            --jq ".conditions.ref_name.include | index(\"$want\") // empty")" != "" ]; then
      printf '%s' "$id"
      return 0
    fi
  done
  return 1
}

for branch in main dev; do
  id="$(ruleset_for_branch "$branch" || true)"

  if [ -z "$id" ]; then
    echo "error: no ruleset targets refs/heads/$branch. Create it in Settings -> Rules first." >&2
    exit 1
  fi

  echo "== $branch (ruleset $id)"
  echo "   before: $(gh api "repos/$REPO/rulesets/$id" --jq '[.rules[].type] | join(", ")')"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "   after:  $(printf '%s' "$RULES" | grep -oE '"type": "[a-z_]+"' | sed 's/.*: "//; s/"$//' | paste -sd',' -)"
    echo "   (dry run - nothing changed)"
    continue
  fi

  printf '{"rules": %s}' "$RULES" \
    | gh api -X PUT "repos/$REPO/rulesets/$id" --input - >/dev/null

  echo "   after:  $(gh api "repos/$REPO/rulesets/$id" --jq '[.rules[].type] | join(", ")')"
done

if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

echo
echo "Repository-level merge settings:"
gh api -X PATCH "repos/$REPO" \
  -F allow_merge_commit=false \
  -F allow_squash_merge=true \
  -F allow_rebase_merge=true \
  -F delete_branch_on_merge=true \
  -F has_wiki=false \
  --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge, delete_branch_on_merge, has_wiki}'

cat <<'NEXT'

Applied. Two things this does NOT do, both by design:

  1. Commit signing is not required, because signing is not configured. Requiring
     it now would make every pull request unmergeable, including the one that
     would configure it.

  2. Account email privacy is untouched. Those are account settings, not
     repository settings, and no repository-scoped token can reach them. Enable
     both under Settings -> Emails:
       - Keep my email addresses private
       - Block command line pushes that expose my email

Confirm the result on a throwaway pull request before relying on it. A required
check whose context does not match a job name produces a pull request that waits
forever for a check that will never report.
NEXT
