# Playwright locator evaluation

A controlled Angular application plus a Playwright harness that measures what
different locator strategies actually cost — in query time, in robustness, and in
failure.

## The premise

"Which locator is fastest" is the wrong headline question, and this project is
built to prove or disprove that rather than assume it.

Selector resolution is cheap relative to a CDP round trip on small DOMs, so a
naive benchmark concludes that everything is within noise. That conclusion is
wrong in both directions:

- It is **too generous** at scale. At 120,000 DOM elements the spread between the
  cheapest and the dearest strategy in this matrix is roughly seven orders of
  magnitude. Some strategies take over a minute for a single query.
- It is **too narrow** in general. The costs that actually burn CI time are
  re-resolution under retry, full-timeout failures, and locators that silently
  match the wrong element after a refactor. None of those are query time.

So the study measures speed rigorously *and* measures robustness, strictness and
failure cost, then ranks on a composite.

## What is measured

| Id | Scenario | Question |
|----|----------|----------|
| S1 | Query cost vs DOM size | Does cost scale, and how steeply? |
| S2 | Target position, and scoping | Do engines short-circuit? Does scoping pay? |
| S3 | Action under continuous re-render | What does re-resolution cost per retry? |
| S4 | Actionability gates | Which gate is blocking, and what does polling cost? |
| S5 | Ambiguity sweep | At what list size does the locator stop being unique? |
| S6 | Mutation robustness | Which locators survive an ordinary commit? |
| S7 | Encapsulation | What does Shadow DOM cost, and what does it break? |
| S8 | CDK overlays and portals | Where does container scoping stop working? |
| S9 | Virtual scroll | The case where no locator can help |
| S10 | Failure cost | What does a broken locator cost in wall clock and in diagnosis? |
| S11 | Suite wall clock | Does any of it change the CI bill? |
| S12 | Depth at fixed element count | Does depth cost anything on its own? |
| S13 | Accessibility | What do the expensive locators buy that the cheap ones cannot? |

31 locator strategies across eight families, all resolving to the **same physical
element** — the descriptor is read back out of the rendered DOM, so the spec
cannot drift from the app and structural selectors are generated from real
ancestry rather than guessed.

Several entries are matched pairs: a `getBy*` helper alongside the equivalent
selector string handed to `page.locator()` — `getByTestId` against
`data-testid=`, `getByRole` against `role=...[name="X"s]`, `getByText` against
`text="X"`, `.nth()` against `>> nth=`, and `#id` against `id=`. The helpers are
thin wrappers over the same engines, so the pairs settle whether the ergonomic
API costs anything at runtime. If it does not, the choice between them is purely
about readability — a far easier argument to have.

## Running it

```bash
nvm use                    # Node is pinned in .nvmrc; Angular 22 needs >= 22.22.3
npm install
npm --prefix app install
npm run app:build          # production build; ng serve would contaminate timings

npm run bench              # every project
npm run bench:micro        # S1, S2, S7, S12
npm run bench:macro        # S3, S4, S8, S9, S10
npm run bench:a11y         # S13
npx playwright test --project=robustness   # S5, S6
node tools/run-suite-scale.mjs             # S11

npm run report             # aggregate + both pages + both generated documents
npm run reference          # regenerate the locator reference on its own
npm run accessibility-page # regenerate the test-level matrix page on its own
npm run matrix-doc         # regenerate the matrix table inside the document
npm run verify:pages       # open both generated pages in a browser and check them

./tools/stop-bench.sh      # stop a run completely, workers included
```

Partial-suite scripts write their Playwright report to a scratch directory, not
to the published one. The HTML reporter clears its output folder on every run, so
without that a `npm run bench:a11y` would silently replace a 47-test published
report with a 3-test one. Only a full `npm run bench` writes the published report.

`results/raw/` is append-only and can hold several runs. `npm run analyze`
analyses the newest one and says which it ignored; `BM_RUN=<id>` picks one, and
`BM_RUN=all` merges but refuses if the runs did not share a strategy matrix and
an environment.

Open `results/dashboard/index.html` directly from disk — it has no network
dependencies. `results/dashboard/accessibility.html` sits beside it and holds the
test-level matrix, where every Yes/No opens the reasoning and an example.

`npm run analyze` also prints every query whose median reached one second,
together with its target's depth, sibling count and ancestor path. The threshold
is `BM_SLOW_MS` (default 1000).

### Knobs

Every page shape is a query parameter, so no rebuild is needed to change the page
under test:

```
/grid?rows=6000&cols=6            flat scale
/deep?depth=50&fill=6000          nesting depth at a fixed element count
/churn?rows=300&hz=60&trackby=0   continuous re-render
/late?delay=1500&lateMode=stable  actionability gates
/ambiguous?dup=600                identical repeated markup
/forms?fields=300                 label association styles
/shadow?enc=shadow&rows=150       encapsulation
/virtual?rows=20000&virtual=1     virtual scrolling
/material?dup=24&cols=5           CDK overlays
/a11y?rows=20&defects=1           accessibility defects (defects=0 is the fix)
```

Mutations apply to any route: `?mutate=locale,classHash,wrap,reorder,reword,attrRename,classRename`

## The other half of the story

Read on its own, this project says "role and text locators are slow, use test
ids". That conclusion is wrong, and
[docs/ACCESSIBILITY-AND-TEST-LEVELS.md](docs/ACCESSIBILITY-AND-TEST-LEVELS.md) is
the counterweight.

`getByRole` is expensive because it resolves the accessibility tree — the same
work a screen reader does. S13 measures what that buys: with an icon button
stripped of its accessible name, an input stripped of its label, and an image
stripped of its alt text, `getByTestId` finds all three in **both** the correct
and the broken page, while the accessible locators stop resolving. A suite
written entirely on test ids stays green through all three regressions.

Cost also depends entirely on scale: `role.name` is **1.7 ms** at 434 elements
and **588 ms** at 120,034. That document carries the
**test-level × locator matrix** — unit, integration, smoke, E2E — and the short
version is: use accessible locators by default at unit and integration scale
where they are effectively free, scope them at E2E scale, and never let the cost
figures in this repo talk you out of them on a small DOM.

The matrix is rendered as a page as well — `results/dashboard/accessibility.html`,
linked from the dashboard header — where every cell opens the reasoning behind
that verdict and the code it recommends. Page and document are generated from the
same `analysis/a11y-matrix.mjs`, so they cannot drift apart.

## Methodology

The parts that decide whether the numbers mean anything:

- **Paired measurement.** A CDP round trip costs roughly 1.8 ms on the reference
  machine; an `#id` query costs about 0.01 ms. Timing `locator.count()` naively
  measures the transport. Every sample is paired against a trivial locator run
  immediately before it and subtracted per repetition, which also cancels drift
  from frequency scaling and background load.
- **An explicit noise floor**, measured per page state by running the baseline
  locator against itself. Any median difference below it is reported as
  indistinguishable regardless of p-value.
- **Median, p95 and MAD**, not mean and standard deviation. Browser timings are
  right-skewed; a mean reports the outliers.
- **Mann-Whitney U** (tie-corrected) and bootstrap median CIs for pairwise claims.
  Nothing here is normally distributed.
- **Adaptive repetition budget.** Costs span seven orders of magnitude, so a fixed
  repetition count either starves cheap cells or spends twenty minutes on one
  expensive cell. A probe sets the count to fit a time budget; cells above a
  per-tier threshold record the probe alone, flagged `probeOnly` so `n=1` is never
  presented as if it were `n=30`.
- **Raw per-repetition samples are persisted**, not summaries. The analysis can be
  changed, or disagreed with, without re-running anything.
- **Native-DOM floors** are captured alongside, separating Playwright's engine
  overhead from the cost of the query itself. For the role and text families no
  native equivalent exists, which is the explanation for their numbers.
- **Mechanism, not just duration.** A Chrome trace counts the timeline events each
  query produces, so claims about *why* something is slow are counted rather than
  inferred from the shape of a curve. `:visible` forces exactly 1.00 style-and-layout
  passes per candidate element; every other strategy forces zero. Event counts are
  a property of the engine, so this runs on a small tier and never feeds the timing
  analysis — tracing perturbs what it observes.
- **Depth is separated from page size.** Deeper pages are usually also bigger
  pages, so "deep elements are slow" is unfalsifiable without a control. S12 holds
  the element count constant and varies only the number of levels between `<body>`
  and the target. Every record from every scenario also carries `targetDepth`,
  `targetSiblings` and the ancestor tag path, so any query that crosses the slow
  threshold can be reported with where its target actually sits.
- **Robustness identity is verified**, not inferred. A locator counts as surviving
  a mutation only if it resolves to the same physical element, checked through an
  attribute no mutation touches. Counting matches alone would score a locator as
  surviving when it had silently latched onto a different element — which is worse
  than breaking, because it passes.

### A note for anyone downgrading Angular

On Angular 21 `ng build` produced the bundle and then **never exited**: it left its
esbuild service (`esbuild --service=... --ping`) running, which held the CLI open,
hung `npm run` and stalled CI until the job timed out. It presented as a silent
hang rather than a leak, because piped output is only flushed at EOF — a build
that had actually succeeded printed nothing at all.

Angular 22 fixes it; `ng build` exits cleanly, so the wrapper that used to work
around it has been removed. Worth knowing if this project is ever pinned back.

### What was tried and rejected

- **`performance.mark()` / `performance.measure()`** cannot time a locator. They run
  in the page; a `locator.count()` is driven from Node and the in-page half is
  Playwright's injected engine, which offers no seam to bracket. They are used for
  what they can measure — the native floor uses in-page `performance.now()` around a
  2,000-iteration loop, because Chrome quantises the clock to 100 µs without
  cross-origin isolation (measured: smallest non-zero delta 0.0999 ms) and a single
  `getElementById` would read as zero.
- **CDP `Performance.getMetrics()`** looked like a way to isolate in-page cost
  without the round trip. It is not: `ScriptDuration`, `LayoutDuration` and
  `RecalcStyleDuration` never move for work Playwright drives, and the one counter
  that does, `TaskDuration`, includes protocol handling — it reports ~7.9 ms for an
  `#id` lookup the paired method places below 0.09 ms. Worse resolution than the
  method it was meant to improve, so it was dropped.

### Reproducibility

Every run writes a machine and toolchain fingerprint (CPU, core count, load
average, Node, Playwright, Chromium build, git SHA and dirty flag) and ties every
record to it. Timings are comparable only within a fingerprint.

The app is served as a production build from a static server. `ng serve` ships an
unoptimised bundle and runs change detection in development mode, both of which
inflate and destabilise render timing.

Data is generated from a seeded PRNG: same seed and dimensions produce
byte-identical DOM across runs and machines.

### Known caveats

- The bundled Chromium in this environment is build 1194 while Playwright 1.63
  ships 1243. Results are valid for the pair actually exercised; the mismatch is
  recorded in the fingerprint and surfaced on the dashboard rather than hidden.
- Killing a run with the wrong pattern leaves Playwright *worker* processes alive,
  and a surviving worker keeps appending to `results/raw` after it has been
  cleared for the next run. Use `./tools/stop-bench.sh`, which kills workers and
  browsers too, and note that the aggregator will not silently merge runs.
- `workers: 1` and `retries: 0` throughout except S11. Parallel workers contend for
  CPU, and CPU contention is indistinguishable from a slow locator. A retried
  timing sample was taken under different conditions and averaging it in would be
  dishonest.

## Publishing

`.github/workflows/pages.yml` deploys `results/dashboard/` to GitHub
Pages on every push to `main`. **It needs one manual step, once**, before the
first deploy can succeed:

> Settings → Pages → Source → **GitHub Actions**

The workflow passes `enablement: true` to `actions/configure-pages`, which asks
the API to turn Pages on automatically. That was tried and does not work with the
default `GITHUB_TOKEN` — creating a Pages site returns *Resource not accessible by
integration* and needs a token with admin rights on the repository. The parameter
is left in place because it is harmless once Pages is on.

The workflow deliberately **does not run the benchmark**. GitHub-hosted runners are
shared vCPUs with noisy neighbours, and this project's entire output is timing
measurements; a CI run would produce numbers that look authoritative and are not
comparable to anything, including their own previous run. Results are generated on
a known machine, committed with their hardware fingerprint, and published from
there.

`.github/workflows/verify.yml` covers what can be checked without timing anything:
typecheck, app build, analysis scripts parse, and that the committed locator
reference still matches what the generator produces.

## Layout

```
app/                Angular 22 subject application (Material + CDK)
docs/               generated locator reference, accessibility and test-level guidance
e2e/harness/        measurement primitives, fixtures, env capture, record emitter
e2e/locators/       the strategy matrix and the DOM descriptor
e2e/micro|macro|robustness|a11y|suite/   the scenarios
analysis/           aggregation, statistics, dashboard generation
tools/              static server, S11 driver
results/raw/        append-only NDJSON, one file per worker per run
results/dashboard/  generated HTML
```
