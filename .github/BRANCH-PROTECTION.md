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

**No deployment is attached to either branch yet.** No hosting platform has been chosen and no
Cloudflare project exists, so there is deliberately no deploy workflow — one written against an
undecided target could not be verified, and `CLAUDE.md` §7 keeps infrastructure earned rather
than anticipated. When a target is decided, `dev` is where the preview environment attaches and
`main` is where production does; the branch model already accommodates that without changing.

## Branch protection — `main` and `dev`

**Settings → Rules → Rulesets → New branch ruleset.** Create two, one per branch, because they
differ in one setting only (see the last row).

| Setting | `main` | `dev` | Why |
|---|---|---|---|
| Require a pull request before merging | ✅ | ✅ | No direct pushes, by anyone or anything |
| Required approvals | **1** | **1** | Every change gets a human review |
| Dismiss stale approvals on new commits | ✅ | ✅ | An approval applies to reviewed code, not to whatever lands after |
| Require review from Code Owners | ✅ | ✅ | Pairs with `CODEOWNERS` |
| Require status checks to pass | ✅ | ✅ | `Repository hygiene`, `Lint, typecheck, test, build`, `End-to-end` |
| Require branches to be up to date | ✅ | ✅ | Prevents semantic conflicts merging clean |
| Require signed commits | ✅ | ✅ | Recommended once commit signing is configured |
| Require linear history | ✅ | ✅ | Keeps `git log` readable |
| Block force pushes | ✅ | ✅ | History is immutable |
| Restrict deletions | ✅ | ✅ | |
| Restrict who can push (bypass list) | admin, **PR only** | admin, **PR only** | See below |
| Restrict merges to specific branches | **`dev` only** | — | Production is only ever promoted from a verified preview |

The last row is the one that makes the promotion path real rather than a convention. On the
`main` ruleset, set the required merge source so a feature branch cannot open a PR straight
into `main` and skip preview verification entirely.

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

### Measured state — 2026-09-02

Read from the API rather than assumed. Two rulesets exist and are **active**, one per branch,
and both carry the same three rules:

| Rule | `main` | `dev` |
|---|---|---|
| `deletion` — restrict deletions | ✅ | ✅ |
| `non_fast_forward` — block force pushes | ✅ | ✅ |
| `pull_request` — 1 approval, code-owner review required | ✅ | ✅ |

Everything else this document specifies is **not configured**:

| Promised above | Configured | Consequence while it is missing |
|---|---|---|
| Require status checks to pass | ❌ | **CI is not a merge gate.** A pull request can be merged with `Repository hygiene`, `Lint, typecheck, test, build`, or `End-to-end` red, and nothing stops it. Every guarantee in [`../docs/AI-VERIFICATION.md`](../docs/AI-VERIFICATION.md) rests on this rule existing |
| Dismiss stale approvals on new commits | ❌ | An approval survives new work pushed onto the branch it approved |
| Require linear history | ❌ | Merge commits are permitted — which is also why merge-button commits exist at all; see the email section above |
| Require signed commits | ❌ | Documented as "recommended once commit signing is configured"; signing is not configured |
| Restrict merges to `dev` only (on `main`) | ❌ | A feature branch can open a pull request straight into `main` and skip integration entirely. This is the row described above as "the one that makes the promotion path real rather than a convention" |

Repository-level settings also differ from [Repository metadata](#repository-metadata):
`allow_merge_commit` is **true** (specified ❌) and the wiki is **enabled** (specified disabled).

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

It sets both rulesets to `deletion`, `non_fast_forward`, `required_linear_history`,
`required_status_checks` (the three job names, strict) and `pull_request` (1 approval, code-owner
review, dismiss stale approvals, squash and rebase only), then sets the repository merge
settings. It is idempotent — rerunning it is how the Measured state section stays green.

Two things it deliberately does **not** do:

- **It does not require signed commits.** Signing is not configured here, so requiring it would
  make every pull request unmergeable, including the one that would configure signing.
- **It does not touch account email privacy.** Those are account settings, not repository
  settings, and no repository-scoped token can reach them. They remain a manual step.

`allowed_merge_methods` drops `merge`. Every private-address leak in this repository's history
came from a GitHub merge-button commit, which is authored with the account's primary address
rather than the repo-local identity; squash and rebase merges do not create one. That narrows
the leak surface — it is not the fix, and it does not undo the five commits already published.

One caveat, learned by running it: the rulesets **list** endpoint returns every ruleset with
`conditions: null`, so the target branch can only be read from each ruleset's own detail
endpoint. Matching on the list silently finds nothing and reports the ruleset as missing.


