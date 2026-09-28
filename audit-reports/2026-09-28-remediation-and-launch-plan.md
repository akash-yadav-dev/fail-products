# Remediation status and launch plan

**Date:** 2026-09-28
**Basis:** [Site audit](./2026-09-28-site-progress-deployment-audit.md), current working tree, and local checks. The original audit remains a snapshot from before these changes.

## Completed in this working tree

| Audit item | Change | Evidence and limit |
| --- | --- | --- |
| U02, stale home message | Replaced the inaccurate skeleton/referral warning with a founder invitation. | Source reviewed; development route returned 200. |
| A01, sign-in heading | Rendered the sign-in title as an `h1`. | Source reviewed; lint and type checks pass. |
| Stale or contradictory public copy | Corrected account/data claims in Terms and Privacy placeholders; removed an unimplemented contact promise from Guidelines; clarified that dashboard counts are outbound clicks. | Terms and Privacy remain incomplete and `noindex`. They are **not** launch-ready policies. |
| Publication visibility bug | The in-progress owner edit page now distinguishes a published record from a publicly visible record when moderation hides or removes it. | Regression scenario added to E2E; database-backed E2E was **not run** because this session must not use `.env.local` database credentials. |
| Hidden listing controls | The edit page no longer links to a public 404 for a hidden or unpublished listing; a republished listing hidden by moderation no longer claims to be live. | E2E scenario extended; database-backed execution remains **NOT_VERIFIED**. |
| Account-free request entry | `/takedown` now shows a validated project mailbox link when `LEGAL_CONTACT_EMAIL` is configured, and an explicit setup state otherwise. Development mode shows a reserved `.test` address and sample correction, delist, access, and erasure details. | Three unit cases cover valid, missing, and unsafe configuration. Real mailbox receipt and handling remain unverified. |
| Documentation drift | Updated the documentation index, contribution branch flow, moderation state/click terminology, workflow wording, roadmap, and release-check command. Added a [public page and content inventory](../docs/PUBLIC-CONTENT.md). | Historical decisions and the earlier audit were preserved as records. |
| Unused UI code | Removed three UI primitives with no source or test imports: checkbox, pagination, and tabs. | Usage searched before deletion; production Next build passed. |
| Reviewable sample content | Added three explicitly fictional SaaS examples on `/demo` in development and isolated staging preview. | No database seed; `noindex` and absent from sitemap. The production build returns 404. These are **not** directory listings. |
| Branch-mapped Workers pipeline | Added OpenNext configuration and CI build/deploy jobs. A merge to `dev` targets `failproducts-staging`; a merge to `main` targets `failproducts` after the production readiness gate. | The local Next build passed. OpenNext packaging is **NOT_VERIFIED** because Windows denied required symlinks; Linux CI must prove it. No live Worker or GitHub Cloudflare token exists yet. |

## Verification

- `pnpm lint`: pass before the Workers adapter was added. The first rerun inspected generated `.open-next` output and failed; that generated directory is now excluded and lint needs a final rerun.
- `pnpm typecheck`: pass.
- `pnpm test:unit`: 32 files and 528 tests passed. The new E2E regression was not included in this count.
- Credential-free `next build`: pass with `DATABASE_URL` empty while `.env.local` was temporarily held aside, then restored. The current build generated 43 static pages; `/takedown` is dynamic so the contact setting is read at request time. This does not prove Workers compatibility.
- Production server `/demo`: 404; development server `/demo`: 200. Desktop and phone screenshots were reviewed.
- Integration and E2E tests: **NOT_VERIFIED**. No database credential from `.env.local` was used for this remediation.
- `vinext check` (2026-09-28): reported 92% compatibility before initialization. A temporary vinext setup consumed about 7 GB of memory without completing a build on this host, then was rolled back. The OpenNext attempt completed `next build` but could not package the Worker on Windows because symlink creation was denied. **Linux Worker build and runtime remain NOT_VERIFIED.**

## Remaining work, in order

1. **Finish product controls:** Review the existing uncommitted edit/status/publication slice, run its integration and E2E tests against a separately confirmed disposable development database, and verify moderation transitions and ownership.
2. **Complete the publication contract:** Decide the smallest useful field and media set against `docs/PRODUCT.md`; implement the missing fields and R2 upload path or explicitly revise the product specification. Verify validation, ownership, storage, rendering, and deletion.
3. **Establish a Workers preview:** Verify the OpenNext build on Linux in CI, configure scoped Cloudflare GitHub environment secrets, merge to `dev`, and smoke-test the isolated `workers.dev` preview. Reassess vinext, durable caching, and the `next/font/google` behavior before production. Verify migrations, auth, OAuth, mail, Turnstile, R2, scheduler, monitoring, and rollback/restore before enabling the production gate.
4. **Make public content real:** Obtain owner approval for stories and media, remove fixtures only from a confirmed test/launch environment, populate useful categories, then add a bounded home discovery section. Fictional `/demo` content stays outside the directory.
5. **Close policy and operations gates:** Publish reviewed Terms and Privacy content, configure `LEGAL_CONTACT_EMAIL`, verify a real request reaches the mailbox and is logged/handled, then verify provider settings, source link, repository protections, backup restoration, and the full release checklist.

### Integrity defects to resolve with the disposable database

- `src/services/product/product-service.ts` writes publication, moderation, and failure state before writing the corresponding history row. Those are separate statements on the Neon HTTP driver, which has no transaction support in this repository. If the history insert fails, the state change can remain without its required audit record. Move each state change and its history insert into one guarded SQL statement, and verify failure and concurrent-update cases against a disposable branch.
- The same service updates a product's name before it tries to retire and replace the slug. If no slug candidate can be reserved, the name may be saved while the old URL remains. The current code explicitly falls back to that outcome, while the edit UI promises the address moves. Choose and enforce one contract atomically, then test slug collisions and a failed history insert.

These are source-level findings, not reproduced database failures. Making untested persistence changes against a database the user excluded would weaken the correctness gate; they remain open in this report.

## Performance and code scope

No production performance measurements exist yet. In the Workers preview, record cache hit ratio, Neon egress, build duration/static page count, and p50/p95 route latency with representative content. Profile the `/products` query before changing indexes or caching. There is no measured reason to add a cache, queue, search service, or second database. The dependency stack was left intact because a replacement would add migration and compatibility work without evidence of a bottleneck.

## Deployment decision

**BLOCKED for public launch.** Local Next build, lint, type checks, and unit tests support development progress only. Workers compatibility, provider-backed flows, legal request handling, and genuine owner-approved content still lack the proof needed for deployment. The earlier audit's 70% implementation and 30% launch-readiness figures were judgment estimates; these local cleanups do not turn them into measured percentages.

## Unverified

- The database-backed product control flows and the new E2E regression.
- A real Workers preview, production provider configuration, DNS, cache and latency, mail delivery, restore drill, and operational response.
- Final legal wording, accessible request handling, and owner approval of real product stories.
