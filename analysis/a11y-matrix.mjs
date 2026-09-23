/**
 * The test-level matrix: which locators to reach for at which level, and why.
 *
 * Verdicts are judgement. The cost figures quoted inside them are measured by
 * this harness (S1) and the accessibility findings by S13, so a reader can
 * disagree with the recommendation while still trusting the number it rests on.
 *
 * Kept as data rather than prose so the page can render it, a reader can click
 * any cell for the reasoning, and the whole thing stays reviewable in a diff.
 */

/** Measured on the reference run; quoted in the cells so the advice is falsifiable. */
export const MEASURED = {
  clickMs: 49.8,
  floorMs: 0.044,
  roleByTier: { unit: '1.7 ms', integration: '16.4 ms', smoke: '588 ms', e2e: '588 ms' },
};

export const LEVELS = [
  {
    id: 'unit',
    title: 'Unit',
    blurb: 'One component, rendered in isolation.',
    scale: 'hundreds of elements',
    note: 'Playwright is not usually the runner here, but the same engines back Testing Library’s queries, and the reasoning transfers unchanged.',
  },
  {
    id: 'integration',
    title: 'Integration',
    blurb: 'Several components together, in a real browser.',
    scale: 'a few thousand elements',
    note: 'Component testing or a narrow page. Big enough to be realistic, small enough that query cost is still noise.',
  },
  {
    id: 'smoke',
    title: 'Smoke',
    blurb: 'A handful of critical paths that must never be slow or flaky.',
    scale: 'production-scale DOM',
    note: 'Runs on every commit, so every millisecond is paid hundreds of times a day. Boring is the goal.',
  },
  {
    id: 'e2e',
    title: 'E2E',
    blurb: 'Full user journeys against the real application.',
    scale: 'production-scale DOM',
    note: 'Where the expensive locators actually get expensive, and where scoping earns its keep.',
  },
];

export const ROWS = [
  {
    id: 'role.name',
    label: 'getByRole + name',
    family: 'role',
    summary: 'Resolves the accessibility tree and matches on the computed accessible name.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'The default choice. At this size it costs about 1.7 ms — a twenty-ninth of a single click — and it asserts the accessibility contract at the point where fixing it is cheapest. A component whose button has no accessible name fails here, in the test that owns that component, rather than in an audit six months later.',
        example: `// Asserts behaviour AND that the control is reachable by name.\nawait expect(\n  page.getByRole('button', { name: 'Delete record' })\n).toBeVisible();`,
      },
      integration: {
        verdict: 'yes',
        why: 'Still the default. About 16 ms at a few thousand elements, against a 49.8 ms click — roughly a third of one interaction. You are paying a third of a click to verify that the control can be found the way assistive technology finds it.',
        example: `await page\n  .getByRole('dialog', { name: 'Confirm deletion' })\n  .getByRole('button', { name: 'Confirm' })\n  .click();`,
      },
      smoke: {
        verdict: 'no',
        why: 'Not for every step. At production scale this is ~588 ms per query, about twelve clicks, and a smoke suite runs constantly. Use identity locators to walk the path — but keep one role-based assertion on the single most important control, as a canary. That one query is worth its cost; twenty are not.',
        example: `// Walk the path cheaply...\nawait page.getByTestId('nav.checkout').click();\n\n// ...then one canary that would catch an accessibility regression.\nawait expect(\n  page.getByRole('button', { name: 'Place order' })\n).toBeEnabled();`,
      },
      e2e: {
        verdict: 'yes',
        why: 'Yes, but scope it first. Unscoped it searches the whole document and pays the full ~588 ms; scoped to a container the candidate set collapses to a handful of elements and the cost collapses with it. You keep the accessibility assertion and lose almost all of the price.',
        example: `// Unscoped: every element of that role in the document.\npage.getByRole('button', { name: 'Delete' });\n\n// Scoped: a handful of candidates inside one row.\npage.getByTestId('row.42')\n    .getByRole('button', { name: 'Delete' });`,
      },
    },
  },
  {
    id: 'label',
    label: 'getByLabel',
    family: 'role',
    summary: 'Finds a form control through its associated label, following for/id, wrapping labels and aria-labelledby.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'The default for form fields, and the cheapest place to catch an unlabelled input. An input with no label is a defect on its own — it cannot be announced, and clicking its visible text does not focus it. This locator is the test that notices.',
        example: `await page.getByLabel('Account owner').fill('Ada');\n// Fails outright if the label was never associated.`,
      },
      integration: {
        verdict: 'yes',
        why: 'Still the default for anything you type into. Label association breaks silently during refactors — someone replaces a <label for> with a styled <span> and nothing visibly changes.',
        example: `await page.getByLabel('Email address').fill('ada@example.com');\nawait page.getByLabel('Remember me').check();`,
      },
      smoke: {
        verdict: 'yes',
        why: 'Yes, for the one or two fields the smoke path actually types into. A smoke test that logs in is already touching the most important form on the site, so addressing those fields by label costs two queries and covers the fields that matter most.',
        example: `await page.getByLabel('Username').fill(user);\nawait page.getByLabel('Password').fill(secret);`,
      },
      e2e: {
        verdict: 'yes',
        why: 'Good, scoped to the form. Forms are naturally small subtrees, so the candidate set is already bounded and the cost stays low even on a large page.',
        example: `const form = page.getByTestId('checkout.payment');\nawait form.getByLabel('Card number').fill(card);`,
      },
    },
  },
  {
    id: 'text.exact',
    label: 'getByText',
    family: 'text',
    summary: 'Walks text nodes and matches on normalised visible copy.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Fine, and cheap here — but prefer role plus name where a role exists. Matching text alone asserts that some words are on screen; matching a role and its name asserts what the thing is and that it can be reached. The second is a stronger claim for the same effort.',
        example: `// Weaker: the words exist somewhere.\nawait expect(page.getByText('Order placed')).toBeVisible();\n\n// Stronger: it is a status message with that name.\nawait expect(\n  page.getByRole('status')\n).toHaveText('Order placed');`,
      },
      integration: {
        verdict: 'yes',
        why: 'Reasonable for genuinely content-driven assertions — confirming a message appears, checking rendered copy. Cost is ~6.9 ms at this scale, which is not a consideration.',
        example: `await expect(\n  page.getByText('Your session will expire in 5 minutes')\n).toBeVisible();`,
      },
      smoke: {
        verdict: 'no',
        why: 'Avoid. Text locators are the most fragile thing in this study: they break on translation, on reworded copy, and on any change a content editor can make without touching code. A smoke suite that fails because marketing changed a button from "Buy" to "Buy now" is training people to ignore it.',
        example: `// Breaks when the copy changes, which is not a bug.\npage.getByText('Proceed to checkout');\n\n// Survives it.\npage.getByTestId('checkout.submit');`,
      },
      e2e: {
        verdict: 'no',
        why: 'Avoid for control interaction — same fragility, plus ~347 ms per query at production scale. It stays legitimate for asserting content that is genuinely the subject of the test, such as confirming an order number appears.',
        example: `// Fine: the content IS the assertion.\nawait expect(page.getByText(orderNumber)).toBeVisible();\n\n// Not fine: using copy to find a control.\npage.getByText('Submit').click();`,
      },
    },
  },
  {
    id: 'role.bare',
    label: 'getByRole without a name, .nth()',
    family: 'role',
    summary: 'Matches every element of a role, then picks one by position.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Acceptable in a small, fully known tree — a component you wrote, with three buttons. You still pay the accessibility-tree resolution, so it catches a role regression, but positional selection means a reordered template silently changes what you are testing.',
        example: `// Tolerable when the component has exactly two buttons.\nawait page.getByRole('tab').nth(1).click();`,
      },
      integration: {
        verdict: 'no',
        why: 'Avoid once more than one component is in play. Position is no longer yours to control: another team adding a button above yours changes which element index 1 refers to, and nothing fails until behaviour is silently wrong.',
        example: `// Brittle across components.\npage.getByRole('button').nth(3);\n\n// Stable.\npage.getByRole('button', { name: 'Apply filters' });`,
      },
      smoke: {
        verdict: 'no',
        why: 'Avoid. It combines the cost of role resolution with the fragility of positional selection and gives you neither speed nor stability.',
        example: `// Pays for accessibility resolution, then throws the benefit away.\npage.getByRole('link').nth(7);`,
      },
      e2e: {
        verdict: 'no',
        why: 'Avoid. At 120k elements this is ~432 ms to build a list you then index into. If you know which one you want, say which one you want.',
        example: `page.getByTestId('row.42').getByRole('button', { name: 'Edit' });`,
      },
    },
  },
  {
    id: 'filter.hasText',
    label: 'filter({ hasText }), :has-text()',
    family: 'filter',
    summary: 'Narrows a candidate set by running a text scan against each candidate.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Fine — the DOM is tiny, so the cost multiplication has nothing to multiply. This is the natural way to express "the row containing X".',
        example: `await page.getByRole('row')\n  .filter({ hasText: 'Ada Lovelace' })\n  .getByRole('button', { name: 'Edit' })\n  .click();`,
      },
      integration: {
        verdict: 'yes',
        why: 'Fine at a few thousand elements (~2.4 ms). Watch the candidate count rather than the page size: the cost is candidates multiplied by the work per candidate.',
        example: `await page.getByTestId('results')\n  .getByRole('listitem')\n  .filter({ hasText: query })\n  .click();`,
      },
      smoke: {
        verdict: 'no',
        why: 'Avoid on lists. The cost is a product of two counts, so it grows faster than the page does — ~110 ms at production scale, and worse as the list grows.',
        example: `// Scan every row, then text-scan each one.\npage.getByRole('row').filter({ hasText: name });\n\n// One lookup.\npage.getByTestId('row.' + id);`,
      },
      e2e: {
        verdict: 'no',
        why: 'Avoid on large lists — unless you scope first. Filtering twenty candidates is fine; filtering nine thousand is where this family produces the pathological numbers in this study.',
        example: `// Bounded candidate set, so filtering is cheap again.\npage.getByTestId('page-1-results')\n    .getByRole('row')\n    .filter({ hasText: name });`,
      },
    },
  },
  {
    id: 'visible',
    label: ':visible',
    family: 'filter',
    summary: 'Filters candidates by whether they are rendered, which requires layout.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Harmless here. Worth knowing what it does, though: it forces exactly one style-and-layout pass per candidate element — counted from a Chrome trace, not inferred.',
        example: `await expect(page.locator('.toast:visible')).toHaveCount(1);`,
      },
      integration: {
        verdict: 'yes',
        why: 'Acceptable. Usually unnecessary: Playwright’s actions already wait for visibility, so an explicit :visible filter is often solving a problem you do not have.',
        example: `// Usually redundant - click() already waits for visibility.\nawait page.locator('button:visible').click();\n\nawait page.getByRole('button', { name: 'Save' }).click();`,
      },
      smoke: {
        verdict: 'no',
        why: 'Avoid on anything list-shaped. One forced layout per candidate means a thousand-row table triggers a thousand synchronous layout passes in a single query.',
        example: `// 1,200 candidates = 1,200 forced layout passes.\npage.locator('.row:visible');`,
      },
      e2e: {
        verdict: 'no',
        why: 'Avoid — ~189 ms at production scale, and the mechanism is the reason: 1.00 forced style-and-layout passes per candidate, measured. Scope to a small subtree if you genuinely need it.',
        example: `// If you must, bound it first.\npage.getByTestId('toast-region').locator(':visible');`,
      },
    },
  },
  {
    id: 'chained',
    label: 'Chained .locator().locator()',
    family: 'composite',
    summary: 'Several chained calls instead of one compound selector.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Harmless at this size, and often the most readable way to express nesting. The cost only appears when each step has many matches to re-resolve against.',
        example: `page.locator('.card').locator('.title');`,
      },
      integration: {
        verdict: 'yes',
        why: 'Harmless. Chaining from a uniquely-identified container is the good pattern — the first step resolves to one element, so there is nothing to multiply.',
        example: `// First step matches once: no multiplication.\npage.getByTestId('card.7').locator('.title');`,
      },
      smoke: {
        verdict: 'no',
        why: 'Avoid on large pages. Each chained step re-resolves against every match of the step before it, so the work is a product of the counts rather than a single pass.',
        example: `// Three broad steps, multiplied.\npage.locator('tr').locator('td').locator('button');`,
      },
      e2e: {
        verdict: 'no',
        why: 'Never, on a large DOM. Measured at ~1,950x the equivalent compound selector at 120k elements — 98.4 s against 50.5 ms for the identical result. This is the largest avoidable difference in the entire study.',
        example: `// 98.4 seconds.\npage.locator('tr.row').locator('td.cell').locator('button.action');\n\n// 50.5 ms, same element.\npage.locator('tr.row > td.cell > button.action');`,
      },
    },
  },
  {
    id: 'testid',
    label: 'getByTestId',
    family: 'identity',
    summary: 'A dedicated attribute, invisible to users and to assistive technology.',
    cells: {
      unit: {
        verdict: 'no',
        why: 'Prefer role or label here. At unit level you own the markup, so asserting on the accessible contract verifies what you actually ship. A test id asserts only that you remembered to add a test id — and it will keep passing after the accessible name is gone.',
        example: `// Passes whether or not the button is reachable by name.\npage.getByTestId('delete-button');\n\n// Fails when the accessible name disappears.\npage.getByRole('button', { name: 'Delete record' });`,
      },
      integration: {
        verdict: 'yes',
        why: 'Useful for structural containers — the thing you scope into — while the controls inside it are addressed by role. That combination is cheap and keeps the accessibility assertion.',
        example: `page.getByTestId('checkout.summary')\n    .getByRole('button', { name: 'Apply code' });`,
      },
      smoke: {
        verdict: 'yes',
        why: 'The right default for walking the path. Fastest, unambiguous, and indifferent to copy and translation. Pair it with a single role-based canary so the suite is not blind to accessibility regressions.',
        example: `await page.getByTestId('nav.cart').click();\nawait page.getByTestId('cart.checkout').click();`,
      },
      e2e: {
        verdict: 'yes',
        why: 'Yes for high-traffic steps and for anything inside a large list, where role resolution would be paid repeatedly. Measured at or below the floor at every page size tested.',
        example: `await page.getByTestId('row.' + id).getByTestId('row.edit').click();`,
      },
    },
  },
  {
    id: 'axe',
    label: 'axe-core scan',
    family: 'role',
    summary: 'Not a locator — an automated audit of the rendered page.',
    cells: {
      unit: {
        verdict: 'yes',
        why: 'Cheap and precise at component level: the scan covers one component, so a violation points straight at the code that caused it. This is where a scan is most actionable.',
        example: `const results = await new AxeBuilder({ page })\n  .include('[data-testid="user-card"]')\n  .analyze();\nexpect(results.violations).toEqual([]);`,
      },
      integration: {
        verdict: 'yes',
        why: 'Good coverage per unit of effort — several components interacting is where contrast and labelling problems actually appear. Scans in this project took roughly a second.',
        example: `const results = await new AxeBuilder({ page })\n  .withTags(['wcag2a', 'wcag2aa'])\n  .analyze();\nexpect(results.violations).toEqual([]);`,
      },
      smoke: {
        verdict: 'no',
        why: 'Too slow and too noisy for a path that runs on every commit. A full-page scan takes around a second and tends to report pre-existing issues unrelated to the change, which trains people to ignore failures.',
        example: `// Better as a scheduled job than on every commit.\nnpx playwright test --project=a11y`,
      },
      e2e: {
        verdict: 'yes',
        why: 'Yes, on key screens rather than every step. One scan per important page, ideally scoped, catches contrast and structural problems that no locator will ever notice — but remember a clean scan is weak evidence.',
        example: `for (const route of ['/', '/checkout', '/account']) {\n  await page.goto(route);\n  const r = await new AxeBuilder({ page }).analyze();\n  expect(r.violations, route).toEqual([]);\n}`,
      },
    },
  },
];
