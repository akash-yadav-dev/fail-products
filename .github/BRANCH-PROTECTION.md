# Repository Protection Settings

Reference configuration for the `failproducts` GitHub repository. Apply these before the
repository is made public, and re-verify them as part of the launch gate in
[`../docs/ROADMAP.md`](../docs/ROADMAP.md) Phase 5.

These settings are what actually enforce the rules in [`../CLAUDE.md`](../CLAUDE.md). Anything
relying only on instructions is a convention; anything configured here is a guarantee.

## The promotion path

Two protected branches. Nothing reaches `main` without being integrated and verified on `dev`
first.

```
feature/* | fix/* | docs/* | security/*
        ↓  PR + CI + review
      dev                    <- integration; verified here before it can go further
        ↓  PR + CI + review
      main                   <- the release branch
```

`dev` is an integration branch, not a working branch. It is written to by merge only, exactly
like `main`, which is why `scripts/verify-changes.sh` blocks a direct commit on either.

The CI workflow builds a Worker and maps `dev` to the isolated staging preview and `main` to
production. Production still requires `PRODUCTION_READY=true` in its GitHub environment.
Cloudflare deployment credentials are configured per environment; until they exist, the job
reports a skipped deploy. Neither branch has a live deployment merely because this workflow
exists. The app targets separate `workers.dev` Workers and no custom domain yet.

## Branch protection — `main` and `dev`

**Settings → Rules → Rulesets → New branch ruleset.** Create two, one per branch, because the
release branch must preserve promotion ancestry.

| Setting | `main` | `dev` | Why |
|---|---|---|---|
| Require a pull request before merging | ✅ | ✅ | No direct pushes, by anyone or anything |
| Required approvals | **1** | **1** | Every change gets a human review |
| Dismiss stale approvals on new commits | ✅ | ✅ | An approval applies to reviewed code, not to whatever lands after |
| Require review from Code Owners | ✅ | ✅ | Pairs with `CODEOWNERS` |
| Require status checks to pass | ✅ | ✅ | Main also requires `Promotion source and conflict analysis` |
| Require branches to be up to date | ✅ | ✅ | Prevents semantic conflicts merging clean |
| Require signed commits | ✅ | ✅ | Recommended once commit signing is configured |
| Require linear history | ❌ | ❌ | Merge commits preserve shared ancestry |
| Allowed merge method | **Merge commit only** | **Merge commit only** | Prevents promotion and integration history from being rewritten |
| Block force pushes | ✅ | ✅ | History is immutable |
| Restrict deletions | ✅ | ✅ | |
| Restrict who can push (bypass list) | admin, **PR only** | admin, **PR only** | See below |
| Restrict merges to specific branches | Enforced by required CI check: `dev` only | — | Rulesets cannot directly constrain a PR head branch |

The required CI check rejects any PR to `main` whose head branch is not `dev`, and uses
`git merge-tree` to reject a promotion with conflicts. GitHub rulesets do not have a native
source-branch restriction, so this named required status check is the enforcement point.

## Why main requires merge commits

Previous promotions were squash or rebase merged. Both create new commit IDs on `main`, so
`main` and `dev` no longer share the promoted commits as ancestors. The attempted ancestry
repairs in PRs #17 and #18 were also squash merged, so they did not repair the graph. The next
promotion repeatedly attempted to combine independently rewritten changes and conflicted in
shared application files.

The permanent rule is: reconcile the current tree on `dev`; open the release PR from `dev` to
`main`; require the source-and-conflict check; merge it with a merge commit. The merge commit
keeps the exact `dev` tip as a parent. Future work on `dev` then shares that tip as its merge
base with `main`, avoiding repeated conflicts from rewritten promotion history. Both protected
branches are merge-commit-only so neither integration nor promotion history can be rewritten.

**Account email privacy is a prerequisite.** GitHub authors a merge-button commit using the
merging account. Before enabling merge commits, verify in GitHub account Settings → Emails that
“Keep my email addresses private” and “Block command line pushes that expose my email” are on.
The available repository token cannot read those account settings. Until verified, the merge
commit policy must remain unapplied and no promotion merge commit may be created.

### Bypass configuration — corrected

An earlier revision of this file said to leave the bypass list **empty**, including for the
repository administrator. That configuration deadlocks a single-maintainer repository, and the
reason is a platform rule that no setting overrides:

> **A pull request author cannot approve their own pull request.**

With `Required approvals: 1`, `Require review from Code Owners: ✅`, an empty bypass list, and
one human who is both the sole author and the sole code owner, **every pull request becomes
unmergeable**. The only escape is disabling the ruleset by hand for each merge — which means
the guard is off precisely when a change is landing, the moment it is most needed.

Use a bypass actor with the **restricted** mode instead:

| Field | Value |
|---|---|
| Bypass actor | **Repository admin** |
| Bypass mode | **For pull requests only** — *not* "Always" |

"For pull requests only" permits merging a pull request past a missing approval. It does **not**
permit a direct push to the branch. So:

- The maintainer must still open a PR, so CI still runs and the audit trail still exists.
- The maintainer can merge their own PR without a second human, which is the only way a solo
  project moves at all.
- **An outside contributor gets no bypass.** Their PR still requires a Code Owner review, and
  `CODEOWNERS` assigns every path to the maintainer — so nothing merges without maintainer
  approval.
- A leaked token without the admin role still cannot merge past review.
- `git push origin main` is still rejected, for the maintainer too.

Set the mode to "Always" for nothing. That is the setting that would let a mistaken command
write straight to `main`.

## Security settings

**Settings → Code security:**

| Setting | Value |
|---|---|
| Secret scanning | ✅ Enabled |
| Secret scanning — push protection | ✅ Enabled |
| Dependabot alerts | ✅ Enabled |
| Dependabot security updates | ✅ Enabled |
| Dependabot version updates | ✅ Enabled (weekly, grouped) |
| Private vulnerability reporting | ✅ Enabled — [`SECURITY.md`](../SECURITY.md) depends on it |
| CodeQL / code scanning | ✅ Enabled once source code exists |

## Actions settings

**Settings → Actions → General:**

- Workflow permissions: **Read repository contents permission** (least privilege by default).
  Individual workflows request more explicitly.
- Require approval for all outside collaborators' workflow runs: ✅
- Allow only actions from GitHub and verified creators, or specify an allowlist.

Every workflow file must:

- declare a top-level `permissions:` block with the minimum needed
- pin third-party actions to a full commit SHA, never a tag
- never combine `pull_request_target` with a checkout of an untrusted ref

## Actions secrets

**Settings → Secrets and variables → Actions.**

| Name | Kind | Used by | Notes |
|---|---|---|---|
| `NEON_TEST_DATABASE_URL` | Secret | `ci.yml` — `app`, `e2e` | A Neon **development** branch connection string. Never production (`AGENTS.md` §8). |
| `DEPENDENCY_REVIEW_ENABLED` | Variable | `ci.yml` — `dependencies` | Set to `true` once the Dependency graph is enabled. |

`NEON_TEST_DATABASE_URL` is what makes CI cover behaviour rather than only compilation. Without
it every data-dependent suite — comments, reports, moderation, the directory, SEO — reports as
*skipped*, which is honest and is also no coverage at all.

The workflow reads it **only on a push to `dev` or `main`**, never on a pull request. A
`pull_request` job uses the base branch's workflow file, so a PR cannot rewrite the job to read
the secret — but it can rewrite a test file, and test files run with whatever the job holds. A
fork PR gets no secrets regardless. Gating on the event is what keeps that from being a
difference between contributors. See [`../docs/AI-WORKFLOW.md`](../docs/AI-WORKFLOW.md) §7.

Point it at a Neon branch created for CI and nothing else. The suites create and own their rows
(`tests/integration/database.ts`), so the branch may be long-lived, but it must never be a
branch anything else reads.

## Repository metadata

- **Visibility:** public
- **Default branch:** `main`
- **Issues:** enabled
- **Discussions:** optional; leave off until there is community volume to justify moderating it
- **Wiki:** disabled — documentation lives in [`../docs/`](../docs/) and is reviewed
- **Projects:** optional
- **Auto-delete head branches on merge:** ✅ — so a branch is single-use. Every task starts
  from a fresh branch cut off `dev`; see [`../CLAUDE.md`](../CLAUDE.md) §2
- **Allow merge commits:** ❌ / **Squash:** ✅ / **Rebase:** ✅ — keeps history linear
- **Email address privacy:** see below — this is not currently satisfied

## Account email privacy — outstanding

**Settings → Emails**, on the *account*, not the repository. Two settings, both required:

| Setting | Why |
|---|---|
| Keep my email addresses private | Web-based Git operations — including the **Merge pull request** button — commit as the `users.noreply.github.com` address instead of the account's primary one |
| Block command line pushes that expose my email | A clone whose `user.email` was never overridden is rejected at push rather than published |

**Neither was enabled while pull requests #1 through #5 were merged.** The repository-local
identity from `scripts/setup-git-identity.sh` governs commits made locally, and every commit
authored that way is correct. It does not govern a merge commit created by GitHub's own merge
button, which uses the account's primary address.

The result: **five merge commits carry a private address.** `5bce6c8` and `5169a97` are
reachable from `main`; `39681b7`, `fd29cfa` and `2eb1b1a` are reachable from `dev`. No commit
on any feature branch is affected — `scripts/verify-changes.sh` blocks those before they leave
the machine, and it did.

Enabling both settings stops the sixth. **It does not undo the five.** They are published in a
public repository: clones, forks, the events API, and search indexes have them, and rewriting
`main` would require a force-push to a protected branch — which this document forbids, which
agents may not perform, and which would not un-publish anything that has already been fetched.
Treat the address as disclosed and enable the settings so the set stops growing.

Verify after enabling, without printing the address:

```bash
# Expect no output. Any line is a commit carrying a non-allowlisted address.
git log --format='%H %ae %ce' origin/main origin/dev   | grep -v '180740493+akash-yadav-dev@users.noreply.github.com.*180740493+akash-yadav-dev@users.noreply.github.com'   | cut -c1-8
```

## Verification

A ruleset that was configured but never tested is a belief, not a guarantee. After applying,
confirm each promise actually holds:

```bash
# 1. Direct pushes are rejected on both protected branches, for the maintainer too.
#    "For pull requests only" bypass must NOT make these succeed.
git push origin main      # expect: rejected
git push origin dev       # expect: rejected

# 2. The local gate blocks the same two before a push is even attempted.
git checkout main && bash scripts/verify-changes.sh   # expect: BLOCK, exit 1
git checkout dev  && bash scripts/verify-changes.sh   # expect: BLOCK, exit 1

# 3. The committing identity is the noreply address and nothing else.
git log -1 --format='%an <%ae>'
```

Then, on GitHub:

| Check | Expected |
|---|---|
| Open a PR from `feature/*` into `main` | Blocked by the merge-source restriction — must go via `dev` |
| Open a PR into `dev` with a failing check | Merge button disabled until CI is green |
| A PR from an account that is not the maintainer | Shows "Review required" from `CODEOWNERS`, unmergeable without maintainer approval |
| The maintainer's own PR into `dev`, CI green | Mergeable without a second approval, via the PR-only admin bypass |
| Force-push to `dev` or `main` | Rejected |

The fourth row is the one to check first: if it is **not** mergeable, the bypass mode was left
empty or set to something other than "For pull requests only", and every future PR will stall.

### Measured state before the promotion rule — 2026-09-29

Read from the API rather than assumed, after `scripts/apply-branch-protection.sh` was run.
Two rulesets exist and are **active**, one per branch, and both now carry five rules:

| Rule | `main` | `dev` |
|---|---|---|
| `deletion` — restrict deletions | ✅ | ✅ |
| `non_fast_forward` — block force pushes | ✅ | ✅ |
| `pull_request` — 1 approval, code-owner review, dismiss stale approvals, squash/rebase only | ✅ | ✅ |
| `required_linear_history` | ✅ | ✅ |
| `required_status_checks` — `Repository hygiene`, `Lint, typecheck, test, build`, `End-to-end` | ✅ | ✅ |

Repository metadata currently has `allow_merge_commit` **false**, squash and rebase enabled,
`delete_branch_on_merge` on, and the wiki disabled. This is the observed pre-change state; run
`scripts/apply-branch-protection.sh` only after verifying the account email privacy prerequisite.

**CI is a merge gate now.** That is a change in kind, not degree: a red pipeline stops a merge
rather than merely embarrassing it, and the first thing it stopped was the `dev -> main`
promotion pull request. Two consequences that were not obvious until it was switched on:

- A check that fails for an environmental reason — an npm outage, a dropped packet — now blocks
  a release. That is why the dependency audit distinguishes "found an advisory" from "could not
  reach the advisory service" instead of reporting both as red.
- A promotion pull request is measured over every commit `dev` has accumulated, including merge
  commits the merge button authored before `allow_merge_commit` was turned off. Those cannot be
  signed or re-authored without rewriting published history, so the gate reports them as a
  warning rather than blocking a release nobody can unblock. A commit somebody actually wrote is
  still a hard failure.

Still not configured in the observed live state:

| Promised above | Configured | Consequence while it is missing |
|---|---|---|
| Require signed commits | ❌ | Deliberate. Signing is not set up here, and requiring it would make every pull request unmergeable — including the one that would configure signing |
| Restrict merges to `dev` only (on `main`) | ❌ | The new required check must be applied after its workflow reaches `dev` |

The private-address leak in existing history is unchanged: five historical merge commits carry
the account's primary address, two reachable from `main`. Enabling merge commits is conditional
on verifying account email privacy first; it does not rewrite those commits.

To read the same thing back at any time:

```bash
R=akash-yadav-dev/fail-products
for id in $(gh api repos/$R/rulesets --jq '.[].id'); do
  gh api repos/$R/rulesets/$id --jq '"\(.name): \([.rules[].type] | join(", "))"'
done
gh api repos/$R --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge, has_wiki}'
```

Adding the status-check rule has one failure mode worth stating in advance: the contexts must
match the job `name:` values in [`workflows/ci.yml`](workflows/ci.yml) exactly — `Repository
hygiene`, `Lint, typecheck, test, build`, `End-to-end` — because a required check that never
reports is indistinguishable from one that has not finished, and the pull request waits
forever. Add it, then confirm with a throwaway pull request before relying on it.

### Applying this — `scripts/apply-branch-protection.sh`

The table above is a specification, and a specification nobody can execute drifts from reality
the moment somebody changes one checkbox. The script applies it:

```bash
bash scripts/apply-branch-protection.sh --dry-run   # print what would change
bash scripts/apply-branch-protection.sh             # apply
```

It sets both branches to `deletion`, `non_fast_forward`, strict required checks, and
merge-commit-only PRs. `main` also requires the promotion gate. It disables squash and rebase at
the repository level. It is idempotent.

Two things it deliberately does **not** do:

- **It does not require signed commits.** Signing is not configured here, so requiring it would
  make every pull request unmergeable, including the one that would configure signing.
- **It does not touch account email privacy.** Those are account settings, not repository
  settings, and no repository-scoped token can reach them. They remain a manual step.

`allowed_merge_methods` on `main` is `merge` only. This setting must not be applied until the
account email privacy prerequisite above is verified; a GitHub merge commit can otherwise
publish the maintainer's primary address.

One caveat, learned by running it: the rulesets **list** endpoint returns every ruleset with
`conditions: null`, so the target branch can only be read from each ruleset's own detail
endpoint. Matching on the list silently finds nothing and reports the ruleset as missing.
