# Slow locators, accessibility, and which test level wants them

The rest of this project measures locators as a cost. This document is the
counterweight: the expensive locator families are expensive *because they do real
work*, and that work is the same work a screen reader does. Ranking them by
milliseconds alone gets you the wrong answer.

Figures below are measured by this harness. Cost figures come from S1, the
accessibility figures from S13, both on the run whose fingerprint the dashboard
shows. Everything else — the matrix, the recommendations — is judgement, and
labelled as such.

## Why the slow ones are slow

`getByRole('button', { name: 'Delete record 3' })` has no native DOM equivalent.
No browser API answers "which elements have this role and this accessible name",
so Playwright resolves the accessibility tree itself: for every candidate of that
role it computes an accessible name, following `aria-label`, `aria-labelledby`,
associated `<label>` elements, `alt`, `title` and text content in the order the
accessible-name specification requires.

That is why it costs what it costs — and why it can fail in a way a `data-testid`
lookup never will. **If the name cannot be computed, there is no name**, and an
element with no accessible name is unusable with assistive technology. The
locator failing *is* the bug report.

## Measured: what the fast locators cannot see

S13 renders the same controls twice, correct and deliberately broken, and asks
both kinds of locator to find them.

| Defect | `getByTestId` (correct → broken) | Accessible locator (correct → broken) |
|---|---|---|
| Icon button loses its accessible name | 1 → **1** | 1 → **0** |
| Input loses its label association | 1 → **1** | 1 → **0** |
| Image loses its alt text | 1 → **1** | 1 → **0** |

The identity locator is *unchanged* by every one of these regressions. A suite
written entirely on test ids stays green while the interface becomes unusable
with a screen reader. The role and label locators stop resolving, and the test
fails on the commit that introduced the defect.

An axe scan of the same two pages, via `@axe-core/playwright`:

| Page | Violations | Affected nodes | Rules |
|---|---|---|---|
| Corrected | 0 | 0 | — |
| With defects | 4 | 80 | `button-name`, `color-contrast`, `image-alt`, `label` |

### One finding worth keeping

The icon button originally used a 🗑 emoji as its only content. **axe reported no
`button-name` violation**, because the emoji itself counts as the accessible
name — the button passes an automated scan while announcing itself to a screen
reader as "wastebasket".

It only became a detectable violation once the glyph was marked `aria-hidden`.
That is the honest limit of automated scanning: a clean scan is much weaker
evidence than people assume. A role-based locator that still resolves *to the
name you expected* is a stronger signal, because it asserts the name is the right
one rather than merely present.

## Measured: what the slow ones cost, by page size

Median net query cost, same target, same markup, four page sizes:

| DOM elements | `id.css` | `role.name` | `text.exact` | `css.visible` |
|---|---|---|---|---|
| 434 | 0.020 ms | **1.7 ms** | 0.63 ms | 0.54 ms |
| 4,034 | at floor | **16.4 ms** | 6.9 ms | 4.5 ms |
| 30,034 | at floor | **148 ms** | 71 ms | 36 ms |
| 120,034 | at floor | **588 ms** | 347 ms | 189 ms |

For scale: a click on a quiet page costs **49.8 ms**, and the measurement floor
is 0.044 ms.

Read that as a curve, not a verdict. At component size `role.name` costs less
than a twentieth of one click. At 120,000 elements it costs nearly twelve clicks. The
same locator is free in one test level and expensive in another, which is the
whole basis of the matrix below.

## The matrix

Rows are the expensive families. Columns are test levels. This is
recommendation, not measurement.

| Locator | Unit | Integration | Smoke | E2E |
|---|---|---|---|---|
| `getByRole` + name | **Default.** ~1.7 ms is free at this size, and it asserts the accessibility contract at the cheapest point to fix it | **Default.** ~16 ms, still a third of one click | **One per critical control**, as an accessibility canary — not for every step | **Scope it first.** `getByTestId('row.42').getByRole(...)` collapses the candidate set |
| `getByLabel` | **Default for form fields.** A field with no label is a defect, and this is what finds it | **Default for form fields** | Use for the one or two fields the smoke path types into | Good, scoped to the form |
| `getByText` | Fine — but prefer role+name, which asserts *why* the text is there | Fine | **Avoid.** Locale- and copy-dependent; breaks on wording changes that are not bugs | **Avoid** except for genuinely content-driven assertions |
| `getByRole` without a name, `.nth()` | Acceptable in a small, known tree | Acceptable | Avoid — positional and ambiguous | Avoid |
| `filter({ hasText })`, `:has-text()` | Fine, the DOM is tiny | Fine | Avoid on lists | **Avoid on large lists.** Cost is the product of two counts |
| `:visible` | Fine | Fine | Avoid on lists | **Avoid.** Forces exactly 1.00 style-and-layout pass *per candidate* |
| Chained `.locator().locator()` | Harmless | Harmless | Avoid | **Never.** ~1,950× the equivalent compound selector at 120k elements (98.4 s against 50.5 ms) |

### The short version

- **Unit and integration: use the accessible locators by default.** They are
  effectively free at that size, and they turn every test into a partial
  accessibility assertion at the point where a fix is cheapest.
- **Smoke: use identity locators for the path, and keep one role-based assertion
  on the critical control.** Smoke tests must be fast and boring; one canary
  catches accessibility regressions without paying the cost on every step.
- **E2E: scope, then use role.** `getByTestId('container').getByRole(...)` gets
  the accessibility assertion at a fraction of the cost, because the candidate
  set is a handful of elements rather than the document.
- **Never let the cost argument talk you out of accessible locators at small
  scale.** The measurements in this repo are easy to misread as "role locators
  are slow, use test ids". At 434 elements that is 1.7 ms against 0.02 ms — a
  difference of under two milliseconds, for a locator that also tells you whether
  your application can be operated without a mouse.

## Running the accessibility scenarios

```bash
npx playwright test --project=a11y
```

Two things run:

- **S13 axe scan** — `@axe-core/playwright` against the corrected and defective
  pages, asserting the defective one actually trips the rules it was built to
  trip. A scenario that cannot fail proves nothing.
- **S13 blindness** — the comparison table above, asserted rather than described.

The route itself is `/a11y?rows=20&defects=1`, and `defects=0` is the corrected
variant of the identical markup.

## What this does not claim

- Automated scanning catches a well-understood subset of accessibility problems.
  Neither axe nor a role-based locator tells you whether your focus order is
  sane, your error messages are useful, or your page makes sense read aloud.
- A green accessibility scan is not an accessible application — see the emoji
  finding above.
- The matrix is opinion informed by the measurements, not a measurement. The cost
  figures are reproducible; the recommendations are arguable, and worth arguing
  with.
