# FailProducts — Legal, Privacy, and Data Lifecycle

**Status:** Planned MVP requirements
**Last reviewed:** 2026-08-31

> This document records product and engineering requirements. It is not legal advice.
> Before public launch, the Terms of Service, Privacy Policy, and the positions in §2 and §3
> should be reviewed by a qualified lawyer in the operator's jurisdiction.

## 1. Why this document exists

FailProducts publishes statements about real businesses, under headings like "failed",
"abandoned", and "struggling", attached to named founders. That is a materially different
risk profile from an ordinary directory.

Three distinct exposures follow, and each needs a designed answer rather than a policy
sentence:

1. **Defamation and trade libel** — a false statement of fact about a business that causes
   loss. "This product failed" is a factual claim, not an opinion, unless it is framed and
   sourced as one.
2. **Data protection** — a founder's name, photo, and professional history are personal data.
   Publishing them about someone who never signed up requires a lawful basis and a working
   objection route.
3. **Intellectual property** — logos, screenshots, and product names belong to their owners.

## 2. Listing rights — owner-only for MVP

**Decision (ADR-012): only a product's owner may publish a listing about it.**

At MVP, a listing is a form of self-disclosure. The founder chooses to publish, chooses the
framing, and can withdraw. This single constraint removes almost all of the exposure in §1:
there is consent, there is a lawful basis, and there is no unwilling subject.

The consequences are accepted deliberately:

- The directory grows more slowly.
- It cannot list famous failures the founder has not submitted.
- Cold-start requires outreach, not scraping.

That is the correct trade for a solo maintainer with no legal budget.

### Third-party listings are Post-MVP

Opening submissions to third parties is a legitimate future direction, but it is a **system**,
not a toggle. Before it ships it requires, at minimum:

- pre-publication moderation with a human decision on every listing
- a notice-and-objection route reachable by someone who is not a user and never will be
- an evidence standard for the reason a product is listed
- a claims model that renders creator claims, community opinion, and verified signals as
  visibly distinct things (`docs/MODERATION.md` §8)
- a documented takedown SLA
- reviewed Terms that address user-submitted content about third parties
- a DMCA-designated agent

Any proposal to allow third-party listings before those exist should be blocked by the
`scope-skeptic` agent.

## 3. Claim framing rules

These are product requirements, enforced in the UI, not editorial guidance.

**Never state failure as a platform conclusion.** The platform reports what the owner said and
what the system observed. It does not judge.

| Not acceptable | Acceptable |
|---|---|
| "This product failed." | "The founder listed this product as abandoned." |
| "Nobody uses this." | "The founder reported low traction." |
| "This product now has 2,400 visitors." | "FailProducts sent 2,400 outbound visits in the last 7 days." |
| "The founder mismanaged launch." | Community comment, attributed and labelled as opinion. |

Every factual assertion on a public page carries its source tier: **creator claim**,
**community opinion**, or **verified signal**. A page that renders a community opinion in the
visual position of a verified fact is a defect, and the `security-reviewer` and `scope-skeptic`
agents both treat it as one.

The "IMPOSTER DETECTED" feature is subject to the same rule. It may only cite FailProducts'
own referral numbers, which are directly observed, and must never imply total product traffic
(`docs/MODERATION.md` §12).

## 4. Required public documents

Before the first public launch:

| Document | Purpose |
|---|---|
| Terms of Service | acceptable use, content licence from users, liability limits, termination |
| Privacy Policy | what is collected, lawful basis, retention, processors, rights, contact |
| Cookie notice | only if non-essential cookies are ever added; MVP should avoid them |
| Content policy | public-facing summary of `docs/MODERATION.md` |
| Takedown / delist page | a route for owners and third parties to object |
| `SECURITY.md` | already present — private vulnerability reporting |

Processors to disclose: Cloudflare (hosting, CDN, R2, Turnstile), Neon (database), ZeptoMail
(transactional email), GitHub (OAuth, if the user connects it).

## 5. Data retention and erasure matrix

This resolves the tension between `docs/ARCHITECTURE.md` §6 ("prefer soft deletion for
auditability") and `docs/SECURITY.md` §13 (support erasure). Soft delete is the default for
*content*; it is never an answer for *personal data*.

Any migration that introduces a new personal-data column must add a row here in the same PR.

| Data | On account deletion | Retention | Reason |
|---|---|---|---|
| Email address | erased | until deletion | identifier; no ongoing purpose after deletion |
| Name, username, avatar, bio, links | erased; author displayed as "deleted user" | until deletion | personal data |
| Auth tokens, OTPs, sessions | erased immediately | minutes to hours | single-use secrets |
| Products owned | owner-choice: delete, or transfer to anonymous authorship | until deletion | the founder's own disclosure |
| Product content (descriptions, story) | removed with the product if deleted | indefinite while published | the published record |
| Comments | anonymised, text retained | indefinite | removing them destroys the thread context others rely on |
| Comment reports | reporter anonymised, report retained | 12 months | abuse-pattern detection |
| Moderation actions | actor retained (staff), subject anonymised | 24 months | auditability, appeals |
| `product_status_history` | subject anonymised, transitions retained | indefinite | the recovery timeline is the product |
| Waitlist entries | erased on request by the subscriber | until product deletion or unsubscribe | consent-based |
| Waitlist CSV exports | not retained server-side | not stored | generated on demand only |
| `referral_events` (raw) | not personal if no IP stored | **30 days**, then rolled up | volume control on a 0.5 GB database |
| Referral daily aggregates | no personal data | indefinite | analytics |
| Security/audit logs | pseudonymised | 12 months | incident response |
| Application error logs | no personal data permitted | 30 days | debugging |

Rules that follow from the table:

- **Do not store raw IP addresses** unless a specific abuse or security purpose is documented
  here first, with a retention period. `docs/ARCHITECTURE.md` §8.
- **Anonymisation must be irreversible** — replace the identifier, do not null a display field
  while keeping the foreign key to a live user row.
- **A soft-deleted row that still contains personal data has not been deleted.** The
  `security-reviewer` agent treats this as a finding.

## 6. Data subject requests

A working request path must exist at launch, reachable without an account.

| Request | Response |
|---|---|
| Access | export of the account's data in a machine-readable form |
| Rectification | edit in product, or correction via support |
| Erasure | account deletion per the matrix in §5 |
| Objection / delist | remove a listing, or de-index it |
| Portability | the same export as access |

Target: acknowledge within 7 days, resolve within 30. Log every request and its outcome —
pseudonymised, per §5.

## 7. Intellectual property

**Logos and screenshots.** Uploading is limited to the product owner (§2), so the uploader
holds or controls the rights. The Terms must include a licence grant from the user to
FailProducts sufficient to display the content.

**Product names and trademarks.** Nominative use — naming a product to refer to it — is
generally permissible. Do not use a third party's logo as site branding, in marketing, or in
a way implying endorsement.

**Copyright complaints.** Provide a takedown route from launch. If a US safe-harbour position
is wanted later, a designated DMCA agent must be registered; that is a launch-blocking item
only if third-party listings are enabled.

**FailProducts' own marks.** The name and logo are excluded from the AGPL-3.0-only code
licence. See [`TRADEMARK.md`](../TRADEMARK.md). A fork may run the software; it may not present
itself as FailProducts.

## 8. Licensing

- **Application code:** AGPL-3.0-only. Chosen so a hosted fork must publish its modifications.
- **Documentation:** CC BY 4.0.
- **Contributions:** Developer Certificate of Origin sign-off (`git commit -s`). No CLA.

The DCO consequence is deliberate and worth stating plainly: without a CLA, the project
**cannot be relicensed or dual-licensed later** without the agreement of every contributor.
That is the price of low contribution friction, and it is accepted. See ADR-015.

## 9. Operator identity and privacy

The maintainer's private email address must not appear in the repository, its history, its
issues, or any published page. Public contact points are the GitHub noreply address for
commits and a project-domain address for everything else.

This is enforced mechanically by `.githooks/commit-msg` and `.githooks/pre-commit`, and
recorded in `CLAUDE.md` §1 and §4.

## 10. Open items before launch

- [ ] Terms of Service drafted and reviewed
- [ ] Privacy Policy drafted and reviewed
- [ ] delist / data-subject-request route built and reachable without an account
- [ ] `legal@` or equivalent contact address on the project domain
- [ ] operator's jurisdiction and governing law decided
- [ ] whether the operator is trading as an individual or an entity decided
- [ ] the §5 matrix reviewed against the final schema
