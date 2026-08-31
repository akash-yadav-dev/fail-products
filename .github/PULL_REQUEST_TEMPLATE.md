<!--
Thanks for contributing to FailProducts.

Before opening: large changes to the database schema, authentication, third-party providers,
infrastructure, moderation rules, or the public API should start as an issue.
See docs/CONTRIBUTING.md §5.
-->

## What changed

<!-- One or two sentences. -->

## Why

<!-- The problem this solves. Link the issue if there is one. -->

## User-visible behaviour

<!-- What a visitor, a founder, or a moderator will notice. "None" is a valid answer. -->

## How it was tested

<!-- Commands run, cases covered, anything checked by hand. -->

---

## Verification

<!--
Impact radius is printed by scripts/verify-changes.sh.
Definitions: docs/AI-VERIFICATION.md §3. Decision rules: §8.
-->

| | |
|---|---|
| **Impact radius** | LOCAL / FEATURE / CROSS-FEATURE / SYSTEM / PRODUCTION-CRITICAL |
| **Decision** | PASS / PASS_WITH_WARNINGS / BLOCK |
| **Rollback** | EASY / MODERATE / DIFFICULT / UNKNOWN |

**Reviewers run:** <!-- and, for a CROSS-FEATURE or larger change, which you did not run and why -->

## Checklist

- [ ] `bash scripts/verify-changes.sh` run and clean, or every warning consciously accepted
- [ ] `pre-merge-verify` run; reviewers selected by class and radius
- [ ] Commits are signed off (`git commit -s`) — see [DCO](../docs/CONTRIBUTING.md)
- [ ] No secrets, `.env` files, or private email addresses in the diff
- [ ] Documentation updated if this changes documented behaviour
- [ ] An ADR was added if this decision is expensive to reverse
- [ ] Nothing is reported as passed that did not actually run
- [ ] Anything I could not verify is stated below, not left implied

### Only if applicable

- [ ] **Database** — migration included, generated SQL reviewed, FK policies explicit,
      expand/migrate/contract followed for destructive changes, recovery path documented
- [ ] **Personal data** — new fields added to the retention matrix in `docs/LEGAL.md` §5
- [ ] **Security** — new endpoints have authorization and a rate limit; user content is escaped
      at render; external URLs are protocol-validated
- [ ] **Dependencies** — passed the `dependency-gate` checks, including Workers compatibility
- [ ] **Public pages** — metadata set, cursor-paginated lists, no unnecessary client JavaScript
- [ ] **Accessibility** — keyboard reachable, visible focus, labelled inputs, meaning not
      carried by colour alone

## Unverified

<!--
Anything you could not check, and what would settle it. "None" is a valid answer.
A guess presented as a fact is worse than an admitted gap — see AGENTS.md §3.
-->

None

<!--
By submitting this pull request you certify the Developer Certificate of Origin (developercertificate.org)
for your contribution, and agree it is licensed under AGPL-3.0-only.
-->
