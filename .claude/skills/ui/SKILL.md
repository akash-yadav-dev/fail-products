---
name: ui
description: Build consistent, accessible, fast UI with shadcn/ui, Tailwind, and Inter. Use when adding or changing any component, page, form, or layout, when choosing a component, and when reviewing spacing, typography, colour, responsive behaviour, or accessibility. Enforces docs/DESIGN.md.
---

# UI

## Purpose

Keep the interface consistent, accessible, and cheap to render — built from shadcn/ui
primitives rather than bespoke components, and shipping as little client JavaScript as the
feature actually needs.

The visual direction is clean, editorial, premium but minimal: generous whitespace, strong
hierarchy, fast to scan. **Playful in copy, restrained in decoration.**

## When to use it

- Adding or changing any component, page, form, or layout
- Choosing which component to use for a job
- Reviewing spacing, typography, colour, responsive behaviour, or accessibility
- Any time you are about to write a component from scratch

## Context you need first

- `docs/DESIGN.md` — the design system in full. This skill enforces it; it does not replace it
- `docs/PRODUCT.md` §15 tone, §9 SEO requirements for public pages
- `docs/ENGINEERING.md` §3 server/client rules, §7 performance
- `docs/MODERATION.md` §8 — the three claim tiers, which the UI must keep visually distinct

## Check before you build

Never write a component without checking what exists. In order:

```bash
ls src/components/ui/ 2>/dev/null            # already-installed shadcn primitives
ls src/components/ 2>/dev/null               # existing feature components
grep -rn "<the pattern you need>" src/components/ 2>/dev/null
```

Then check the shadcn registry itself before building a primitive — the **shadcn MCP** is the
right tool for this (`mcp/README.md`). Search the registry, read the component source, install
it with the CLI.

Reuse beats duplication. Duplication beats the wrong abstraction. Building a bespoke primitive
that shadcn already ships is the most common waste in this codebase.

## Rules

### Component sourcing

1. **shadcn/ui first.** Add via the CLI. `components/ui/` stays close to upstream — do not edit
   generated primitives without a strong reason, because the next `add` will overwrite you.
2. **Customise through composition and tokens**, not by forking a primitive.
3. **Feature composition goes in a feature folder** — `components/products/`, `components/comments/`,
   `components/waitlist/` — never in `components/ui/`.
4. **Lucide icons** through the shadcn conventions. Icons support meaning; they do not replace
   text for important actions.

The MVP component set is listed in `docs/DESIGN.md` §3. Reaching outside it needs a reason.

### Typography

**Inter**, loaded through `next/font/google` so files are self-hosted and optimised — never a
runtime fetch from Google. Weights limited to: 400 body, 500 labels and UI, 600 headings,
700 major display.

One heading level per step. The outline must be sensible with styling removed — screen readers
and crawlers both read it, and this product lives on search traffic.

### Colour

Start neutral and restrained. The hierarchy is: foreground text → muted text → border and
subtle surface → primary action → status colours → destructive.

Failure-status colours are semantic (`docs/DESIGN.md` §4):

| Status | Family |
|---|---|
| struggling / low traction | warning / amber |
| abandoned | neutral / gray |
| shut down | destructive / red |
| recovering | positive / green |
| verified | neutral brand accent — not an excessive green |

**Status is never conveyed by colour alone.** Every status carries a label, and an icon or shape
where space allows. This is an accessibility requirement, not a preference.

Both themes are first-class. Define colour as tokens; never hard-code a hex in a component.

### Spacing and layout

- Consistent scale, larger vertical gaps between sections than dashboard density suggests
- Public content max width ~1100–1200px; reading content narrower, ~700–800px
- Card padding 20–32px depending on density
- Do not centre every paragraph

### Client JavaScript

Server Component by default. `"use client"` only when browser state or an event handler
genuinely requires it — and remember the boundary is contagious: everything imported below it
ships too.

- No client JavaScript for decorative purposes on public pages
- No animation library. CSS transitions and platform APIs
- Charts are lazy, client-only, and never on the public page path — Recharts stays in the
  dashboard (`docs/ARCHITECTURE.md` §2)

### Accessibility — WCAG AA

Non-negotiable, on every component:

- Semantic HTML first. A `div` with an `onClick` is not a button
- Every form control has an associated `<label>`; errors are associated with their field
- Visible focus state on everything interactive — never `outline: none` without a replacement
- Contrast meets AA in **both** themes
- Keyboard reachable in a sensible order; dialogs trap focus and restore it on close
- Reduced motion respected
- Images have meaningful `alt`, or `alt=""` when decorative

### Responsive

Works at 360px, tablet, desktop, large desktop. On mobile: stack product facts, keep the
primary action visible, avoid horizontal data tables, keep comments easy to read and write.

### Tone

Humour belongs in badges, empty states, status changes, comeback messages, and system
notifications. It does not belong in errors, moderation notices, legal text, or deletion
confirmations.

```
Good:  🚨 IMPOSTER DETECTED
       This product appears to be getting suspiciously popular.

Bad:   LOL THIS FOUNDER IS TERRIBLE
```

Criticise the product, never the person. And keep the three claim tiers from
`docs/MODERATION.md` §8 — creator claim, community opinion, verified signal — visually and
textually distinct. Collapsing them turns an opinion into a public accusation about a named
business.

### Every state, not just the happy one

A component is not done until it handles: loading (skeleton, not a spinner where layout is
known), empty (a directory launches empty — this is the common case), error (says what to do),
and long content (a 60-character product name, a 2000-character comment).

## Checks

```bash
grep -rn '"use client"' src/components/ src/app/ 2>/dev/null   # justify each
grep -rn "outline:\s*none\|outline-none" src/ 2>/dev/null      # focus removal
grep -rn "dangerouslySetInnerHTML" src/ 2>/dev/null            # blocker over user input
grep -rniE "#[0-9a-f]{3,8}\b" src/components/ 2>/dev/null      # hard-coded colour
grep -rn "<img " src/ 2>/dev/null                              # should be next/image
```

## Common mistakes

- Writing a custom Dialog, Select, or Tooltip when shadcn ships an accessible one.
- Editing `components/ui/` directly, then losing it on the next `shadcn add`.
- Marking a whole page `"use client"` because one leaf needs state.
- Conveying failure status with colour alone.
- A spinner where a skeleton would hold layout, causing CLS.
- Designing only the populated state, then discovering the directory launches empty.
- Putting a joke in an error message or a deletion confirmation.
- Hard-coding a colour that then breaks in dark mode.

## Verification expectations

- Tab through the feature with the keyboard. Every control is reachable and visibly focused.
- Check it at 360px, not only at desktop width.
- Check both themes.
- Check the empty and error states, not just the populated one.
- Confirm the page still renders meaningful content with JavaScript disabled, if it is public.
- Use the **Playwright MCP** for real-browser verification of interaction, responsive layout,
  and focus order — see `mcp/README.md`. It complements the E2E suite; it does not replace it.

## Exit criteria

```
[ ] built from shadcn/ui primitives; no bespoke duplicate of a registry component
[ ] components/ui/ unmodified, or the reason documented
[ ] "use client" justified on every component that carries it
[ ] Inter via next/font; no runtime font fetch
[ ] no hard-coded colours; both themes correct
[ ] status carries a label or icon, never colour alone
[ ] keyboard reachable with visible focus; labels associated; contrast AA
[ ] loading, empty, error, and long-content states handled
[ ] responsive at 360px and up
[ ] public pages render meaningfully without JavaScript, with metadata set
```

Run the `product-quality-reviewer` and `performance-reviewer` agents on UI changes —
[`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
