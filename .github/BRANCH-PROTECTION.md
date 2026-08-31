# Repository Protection Settings

Reference configuration for the `failproducts` GitHub repository. Apply these before the
repository is made public, and re-verify them as part of the launch gate in
[`../docs/ROADMAP.md`](../docs/ROADMAP.md) Phase 5.

These settings are what actually enforce the rules in [`../CLAUDE.md`](../CLAUDE.md). Anything
relying only on instructions is a convention; anything configured here is a guarantee.

## Branch protection — `main`

**Settings → Branches → Add branch ruleset**, targeting `main`:

| Setting | Value | Why |
|---|---|---|
| Require a pull request before merging | ✅ | No direct pushes to `main`, by anyone or anything |
| Required approvals | **1** | Every change gets a human review |
| Dismiss stale approvals on new commits | ✅ | An approval applies to reviewed code, not to whatever lands after |
| Require review from Code Owners | ✅ | Pairs with `CODEOWNERS` |
| Require status checks to pass | ✅ | typecheck, lint, test, build, secret scan |
| Require branches to be up to date | ✅ | Prevents semantic conflicts merging clean |
| Require signed commits | ✅ | Recommended once commit signing is configured |
| Require linear history | ✅ | Keeps `git log` readable |
| Block force pushes | ✅ | History on `main` is immutable |
| Restrict deletions | ✅ | |
| Do not allow bypassing the above | ✅ | **Critical** — see below |

### Bypass configuration

Leave the bypass list **empty**, including for the repository administrator.

As the sole maintainer you can always disable a ruleset deliberately when you genuinely need
to. Keeping the bypass list empty means the guard is never silently absent — an automated tool
holding a token with admin scope cannot merge past a required review, and neither can a
mistaken command. That is the entire value of the setting.

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

After applying, confirm the guarantee actually holds:

```bash
# Should be rejected
git push origin main

# Confirm the committing identity is the noreply address
git log -1 --format='%an <%ae>'
```
