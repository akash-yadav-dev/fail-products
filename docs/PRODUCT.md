# FailProducts — MVP Product Requirements Document

**Status:** Planned MVP
**Product:** FailProducts
**Domain:** `failproducts.com` (planned)
**Model:** Free, open source, community-driven directory
**Primary goal:** Build a useful public database of products that are struggling, abandoned, low-traffic, low-user, or otherwise unsuccessful — while allowing the community to discuss why and discover useful products hidden inside the “failed” category.

## 1. Vision

FailProducts is a public directory where people can discover products that did not gain meaningful traction.

A product does not have to be dead to qualify. It may be:

- live but receiving very little traffic;
- live but with few or no users;
- launched but unable to find product-market fit;
- abandoned or no longer maintained;
- shut down;
- technically working but commercially unsuccessful;
- listed because the creator voluntarily wants feedback and visibility.

The platform should turn failure into useful public information.

A product page should help visitors answer:

1. What is this product?
2. Why is it considered unsuccessful?
3. Is it still live?
4. What can I learn from it?
5. Is the product actually useful despite low traction?
6. Can I give the creator constructive feedback?
7. Did the product later recover?

## 2. Product principles

### 2.1 Roast the product, help the builder

Humor is part of the brand. Personal harassment is not.

The platform may use playful language such as “IMPOSTER DETECTED” when a product escapes the failed list, but comments must remain focused on the product, strategy, positioning, execution, distribution, or lessons.

### 2.2 Failure is a state, not necessarily a death sentence

“Failed” is a broad classification. A listed product can be alive, dormant, abandoned, or recovering.

### 2.3 Evidence over claims

The platform should distinguish creator claims, community opinions, and system-verified signals.

Examples:

- Creator claim: “We had almost no users.”
- Community opinion: “The landing page is unclear.”
- Verified signal: “GitHub repository last updated 3 days ago.”
- Platform signal: “FailProducts referred 612 visits this month.”

### 2.4 Minimum operations

The MVP must be maintainable by a solo founder with a full-time job. Prefer managed infrastructure, server-rendered pages, simple database workflows, and small dependencies.

### 2.5 Progressive verification

Verification should start simple and become stronger over time. Do not build a complex trust-score engine in the MVP.

## 3. Target users

### Builders / founders

People who:

- launched a SaaS/app/tool that did not gain traction;
- want feedback;
- want a public postmortem or failure story;
- want discovery from potential users;
- want a permanent product page;
- want to document a comeback.

### Researchers / makers

People who browse failed products to:

- discover useful forgotten software;
- study failed ideas;
- learn marketing/distribution mistakes;
- find underserved niches;
- research pricing and positioning;
- identify products worth rebuilding or acquiring.

### Community members

People who want to:

- recommend fixes;
- explain likely failure reasons;
- point out useful parts of a product;
- share comparable products;
- help a product recover.

## 4. MVP value proposition

> **Discover products that failed. Learn why. Help them recover. Find useful products others overlooked.**

## 5. MVP scope

### Must have

#### Accounts

Authentication is passwordless (ADR-014). No passwords are stored and there is no reset flow.

- Email one-time code / magic-link sign-in.
- GitHub OAuth sign-in.
- Basic profile: name, username, avatar, bio, website/social link.

#### Product submission

**Listings are owner-only in MVP (ADR-012).** A product may only be published by its founder or
owner. Listing a product you do not own is out of scope until the consent, objection, and
takedown systems described in [`LEGAL.md`](./LEGAL.md) §2 exist.

A signed-in owner can create a product with:

- name;
- slug;
- short description;
- detailed description;
- website URL;
- category;
- tags;
- status;
- failure/struggle reason;
- launch date (optional);
- last known active date (optional);
- founder profile;
- logo;
- screenshots;
- “what went wrong” narrative (optional);
- “what I would do differently” (optional);
- optional payment / early-access link;
- optional waitlist enabled.

#### Product statuses

A product carries **three orthogonal fields**, never collapsed into one enum (ADR-013). They
answer different questions and change independently.

**`failure_status`** — what the product is doing. Owner-controlled.

- `STRUGGLING` — live but little/no meaningful traction.
- `LOW_TRACTION` — still running, but weak usage/traffic.
- `ABANDONED` — no longer actively maintained.
- `SHUT_DOWN` — website/app is no longer available.
- `RECOVERING` — formerly listed as failed, now showing meaningful improvement.

**`publication_state`** — whether the page is public. Owner-controlled.

- `DRAFT` · `PENDING_REVIEW` · `PUBLISHED` · `ARCHIVED`

**`moderation_state`** — what a moderator has done. Moderator-controlled.

- `NONE` · `FLAGGED` · `HIDDEN` · `REMOVED`

A moderator action must never overwrite the product's factual status, and a product can be
published and flagged, or hidden while recovering. Every public list query filters on both
`publication_state` and `moderation_state`.

Do not use “dead” as the canonical database status. It can be a presentation label for `SHUT_DOWN`.

#### Discovery

- Homepage with featured/recent/trending failed products.
- Search.
- Category pages.
- Status filters.
- Product detail pages.
- Pagination or cursor-based loading.
- Basic sorting: newest, recently updated, most discussed, most referred.

#### Product page

A product page should show:

- product identity;
- current status;
- why it is listed;
- founder;
- website;
- screenshots;
- creator story;
- community discussion;
- related products;
- waitlist if enabled;
- optional early-access/payment link;
- traffic referred by FailProducts;
- verified signals when available.

#### Comments

- Signed-in comments.
- Replies are optional for MVP; flat comments are acceptable initially.
- Upvote/downvote is optional and should not block launch.
- Comment reporting.
- Founder reply indicator.
- Moderation state: visible, hidden, removed, pending.

#### Waitlist

A visitor can join a product waitlist when enabled.

Minimum fields:

- email;
- product;
- consent/terms acknowledgement.

Waitlist emails must be sent through ZeptoMail.

The creator should be able to export waitlist data as CSV.

#### Referral tracking

Every product website link from FailProducts should include a platform-owned attribution parameter, for example:

`?utm_source=failproducts&utm_medium=referral&utm_campaign=product-page`

The system should record a lightweight referral event without collecting invasive visitor profiling.

MVP metric:

- outbound clicks from FailProducts to the product website.

Do not claim total product traffic unless the creator later connects a verified analytics source.

#### Basic creator analytics

Creator dashboard may show:

- profile views;
- product page views;
- outbound clicks;
- waitlist signups;
- comment count;
- referral clicks by day/week.

Recharts may be used for small client-rendered charts where a chart materially improves understanding. Avoid charts for data that is clearer as a number.

### 5.2 Nice to have, not MVP blockers

- GitHub connection and activity signals.
- verified website badge.
- public launch/build timeline.
- creator reputation history.
- product comparison pages.
- email notifications for comments.
- RSS/Atom feeds.
- API access.
- product ownership verification.

### 5.3 Explicitly out of MVP

- paid plans;
- paid backlinks;
- affiliate marketplace;
- Stripe Connect / Dodo Connect / marketplace payments;
- revenue verification;
- full analytics integrations;
- automatic web traffic estimation;
- AI-generated failure diagnosis;
- public scoring/leaderboards that rank founders by failure;
- complex gamification;
- mobile app;
- microservices;
- Redis/RabbitMQ;
- separate backend service;
- self-hosting control plane;
- **third-party product listings** — publishing a listing about a product you do not own.
  See [`LEGAL.md`](./LEGAL.md) §2 and ADR-012 for the system this would require first;
- stored passwords, password login, and password reset (ADR-014).

## 6. Product lifecycle

The three axes move independently. Publication and failure status belong to the owner;
moderation belongs to a moderator.

```text
publication_state   DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED
                                                ↑
failure_status      STRUGGLING ⇄ LOW_TRACTION ⇄ ABANDONED ⇄ SHUT_DOWN ⇄ RECOVERING
                    (freely settable by the owner while published)

moderation_state    NONE → FLAGGED → HIDDEN → REMOVED
                    (moderator only; never alters the other two axes)
```

A product is publicly visible only when `publication_state = PUBLISHED` **and**
`moderation_state ∈ {NONE, FLAGGED}`.

The database must preserve status history instead of overwriting it. `product_status_history`
records transitions on all three axes, with the actor and the reason.

This enables a future timeline such as:

> Listed as struggling → received community feedback → creator updated positioning → FailProducts referred traffic → product recovered.

## 7. “Imposter detected” comeback system

This is a brand feature, not a core truth claim.

### MVP trigger

Use FailProducts referral clicks as the first reliable signal.

Example:

> 🚨 **IMPOSTER DETECTED**
>
> We listed this product as struggling.
> It seems to disagree.
>
> FailProducts sent it **5,241 visitors in the last 7 days**.

This must not imply that 5,241 visitors were the product’s total traffic.

### Future trigger

If a creator connects a trusted analytics provider, the system can verify a broader traffic signal.

## 8. Submission flow

```text
Sign up
  ↓
Create product
  ↓
Add failure context
  ↓
Upload logo/screenshots
  ↓
Optional waitlist/payment/referral setup
  ↓
Submit
  ↓
Moderation / automated validation
  ↓
Publish
  ↓
Community discussion
```

For trusted accounts, future submissions may be auto-published with post-publication moderation.

## 9. Product page SEO

Each published product gets a canonical URL:

`/products/[slug]`

Each category gets:

`/categories/[slug]`

Each status gets:

`/status/[slug]`

Creator profiles:

`/u/[username]`

Only index useful, unique pages. Do not generate thousands of thin parameterized pages.

Every public product page should have:

- unique title;
- meta description;
- canonical URL;
- Open Graph image;
- structured metadata where useful;
- meaningful visible content without JavaScript dependence.

## 10. Content model

### User

Identity, authentication, public profile, moderation role.

### Product

Core product information, ownership, state, content, links.

### ProductStatusHistory

Immutable record of product status changes.

### Category

Normalized classification. **A fixed, curated list** — only a migration adds a category, and a
product picks at most one (ADR-026). The list is specified in
`src/domain/product/category.ts` and seeded by `drizzle/migrations/0006_seed_categories.sql`:

| Slug | Name |
|---|---|
| `ai` | AI |
| `developer-tools` | Developer tools |
| `saas` | SaaS |
| `productivity` | Productivity |
| `marketplace` | Marketplace |
| `social` | Social |
| `ecommerce` | E-commerce |
| `fintech` | Fintech |
| `health` | Health |
| `education` | Education |
| `games` | Games |
| `hardware` | Hardware |
| `other` | Other |

The list is fixed because §9 below forbids generating thousands of thin parameterized pages,
and a free-form taxonomy produces exactly that from typos and casing alone.

### ProductTag

Flexible discovery labels. This is the free-form axis; Category is not.

### Comment

Community discussion attached to a product.

### CommentReport

Abuse/moderation reports.

### WaitlistEntry

Email captured for a product waitlist.

### ReferralEvent

Outbound referral click from FailProducts.

### ExternalConnection

Future integration record for GitHub/analytics/etc. Keep this generic enough to add providers without changing the Product model.

### MediaAsset

R2 object metadata associated with a product/profile/comment if image attachments are enabled later.

## 11. Early-access / payment-link feature

Creators may optionally attach a payment URL to their product page.

FailProducts is not the merchant in MVP.

The creator owns the external payment provider and receives payment directly.

Supported model:

```text
Creator creates Stripe/Dodo/Lemon Squeezy/etc. payment link
                 ↓
Creator pastes link into FailProducts
                 ↓
Visitor clicks
                 ↓
External checkout
                 ↓
Creator receives money
```

Do not implement payment processing or payment splitting in MVP.

## 12. Success metrics

Initial metrics are product usefulness metrics, not revenue metrics:

- registered builders;
- published products;
- products with at least one community comment;
- unique product page visitors;
- outbound clicks to listed products;
- waitlist signups;
- percentage of products receiving meaningful discussion;
- recovered products;
- repeat contributors;
- spam/removal rate.

## 13. MVP acceptance criteria

The MVP is launchable when a new user can:

1. create an account without a password;
2. create a product they own;
3. publish an acceptable product page;
4. upload an image;
5. share the product page publicly;
6. receive community comments;
7. receive waitlist signups;
8. see referral click counts;
9. update the product status;
10. export waitlist data;
11. receive basic notifications through ZeptoMail;
12. delete their account and request product removal.

A non-logged-in visitor can:

1. browse/search products;
2. filter categories/status;
3. open product pages;
4. click through to external websites;
5. join a waitlist;
6. report a product/comment.

## 14. Non-functional requirements

### Performance

- Public pages should render primarily on the server.
- Avoid client components unless interactivity requires them.
- Prefer platform caching and framework caching over a custom cache layer.
- Optimize images and serve them from R2/CDN.
- Keep JavaScript payloads small.
- Use pagination/cursors for lists.
- Never fetch all products to render a page.

### Reliability

- Database writes must be validated and transactional where needed.
- Status transitions must be auditable.
- Email failures must not fail the primary product submission.
- External integrations must degrade gracefully.

### Accessibility

- Keyboard accessible controls.
- Semantic headings.
- Visible focus states.
- Form labels and errors.
- Respect reduced motion where relevant.
- Minimum WCAG AA target for MVP.

## 15. Product tone

Brand tone:

- playful;
- honest;
- curious;
- constructive;
- lightly irreverent.

Avoid:

- humiliation;
- personal attacks;
- doxxing;
- unverified accusations;
- claims that a person is incompetent or dishonest.
