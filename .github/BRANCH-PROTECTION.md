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

## Repository metadata

- **Visibility:** public
- **Default branch:** `main`
- **Issues:** enabled
- **Discussions:** optional; leave off until there is community volume to justify moderating it
- **Wiki:** disabled — documentation lives in [`../docs/`](../docs/) and is reviewed
- **Projects:** optional
- **Auto-delete head branches on merge:** ✅
- **Allow merge commits:** ❌ / **Squash:** ✅ / **Rebase:** ✅ — keeps history linear
- **Email address privacy:** ensure "Block command line pushes that expose my email" is enabled
  on the account, so a misconfigured clone cannot leak a private address

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
