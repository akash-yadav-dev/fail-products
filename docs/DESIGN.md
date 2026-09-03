# FailProducts — Design System and UI Rules

## 1. Design direction

The visual direction is:

- clean;
- editorial;
- premium but minimal;
- generous whitespace;
- strong hierarchy;
- fast to scan;
- playful in copy, restrained in UI decoration.

Avoid the “startup dashboard overloaded with cards” look.

## 2. Typography

Primary font: **Inter**.

Use Next.js `next/font/google` for Inter so font files are optimized and hosted with the application rather than fetched from Google at runtime. Next.js documents this optimization path.

Weights should be limited to the minimum needed. Recommended baseline:

- 400 body;
- 500 labels/UI;
- 600 headings;
- 700 major display text.

## 3. UI library

Use **shadcn/ui** as the component foundation.

Components should be added with the shadcn CLI and customized through composition and tokens before creating custom primitives.

Core components likely needed in MVP:

- Button
- Card
- Badge
- Avatar
- Input
- Textarea
- Select
- Checkbox
- Dialog
- Dropdown Menu
- Tabs
- Tooltip
- Separator
- Skeleton
- Alert
- Breadcrumb
- Pagination
- Toast/Sonner-style notifications

The current shadcn Next.js flow supports the App Router and component generation via the CLI.

## 4. Color hierarchy

Start neutral and restrained.

Primary hierarchy:

1. foreground text;
2. muted text;
3. border/subtle surface;
4. primary action;
5. status colors;
6. destructive/error.

Do not use many colors just because they are available.

Product status colors should be semantic:

- struggling/low traction — warning/amber family;
- abandoned — neutral/gray;
- shut down — destructive/red family;
- recovering — positive/green family;
- verified — neutral/brand accent, not excessive green.

Status colors must not be the only way meaning is conveyed.

## 5. Spacing

Use a consistent spacing scale.

Prefer larger vertical gaps between sections than dense dashboard spacing.

Public pages should feel spacious:

- max content width around 1100–1200px;
- reading content narrower, around 700–800px;
- generous section spacing;
- card padding typically 20–32px depending on density.

Do not center every paragraph.

## 6. Public page hierarchy

A product page should generally follow:

```text
Product identity
→ short explanation
→ status/context
→ core facts
→ failure story
→ screenshots / evidence
→ community discussion
→ waitlist / action
→ related products
```

The primary CTA should be obvious without competing with five secondary buttons.

## 7. Product cards

A card should answer in a few seconds:

- what is it?
- why is it here?
- is it alive?
- why might it be interesting?

Suggested card content:

```text
Logo  Product name      Status
      One-line pitch
      Category · Last updated
      Community comments · Referral signal   <- not rendered
```

The last row is not rendered, and that is a decision rather than an omission. Referral signals
are Phase 4. Comment counts have had a table since Phase 3 and are still absent, because a
count per card is an aggregate over `comments` on the hottest query in the application; the
alternative is a denormalised counter on `products` kept correct through inserts, moderation
changes and cascade deletes, which `CLAUDE.md` §7 requires a measurement to justify. Rendering
"0 comments" on every card until then would describe the schema rather than the product.

## 8. Humor

Use humor in:

- badges;
- empty states;
- status changes;
- comeback messages;
- system notifications.

Do not turn every piece of UI into a joke.

Good:

> 🚨 IMPOSTER DETECTED
> This product appears to be getting suspiciously popular.

Bad:

> LOL THIS FOUNDER IS TERRIBLE

## 9. Responsive behavior

The site must work well at:

- mobile 360px+;
- tablet;
- desktop;
- large desktop.

On mobile:

- stack product facts;
- keep primary action visible;
- avoid horizontal data tables where not necessary;
- comments remain easy to read/write.

## 10. Accessibility

- Use semantic HTML.
- Use labels for form controls.
- Maintain visible focus.
- Use sufficient contrast.
- Support keyboard navigation.
- Respect reduced motion.
- Do not rely solely on color.

## 11. Performance

Do not ship client JavaScript for decorative elements.

Avoid animations that block interaction or require large animation libraries.

Prefer CSS transitions and platform APIs.

## 12. Icons

Use Lucide icons through shadcn/ui conventions.

Icons should support meaning, not replace text for important actions.
