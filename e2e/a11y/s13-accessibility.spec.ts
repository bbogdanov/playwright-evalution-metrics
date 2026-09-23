import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../harness/fixtures';
import { timeOnceSettled } from '../harness/measure';

/**
 * S13 - what the slow locators buy you.
 *
 * Every other scenario in this project measures locators as a cost. This one
 * measures the return. The role, label and text engines are expensive precisely
 * because they resolve the accessibility tree rather than reading an attribute,
 * and that resolution is the same work a screen reader does. A locator that has
 * to compute an accessible name fails when there is no accessible name to
 * compute - which is a defect report, not a test problem.
 *
 * The route renders the same controls twice, correct and deliberately broken. Two
 * things are recorded:
 *
 *   scan   axe-core violations in each mode, by rule. Automated scanning catches
 *          a well-known subset of accessibility problems, so a clean scan is
 *          evidence of nothing much; a dirty one is evidence of something real.
 *   blind  for each defect, whether a test-id locator and a role/label locator
 *          still resolve. Where the test id resolves and the accessible locator
 *          does not, a suite written on test ids stays green through a real
 *          regression.
 */

test.use({ scenario: 'S13' });

const ROWS = 20;

/** Rules the defective variant is built to trip, so a miss is visible as a miss. */
const EXPECTED_RULES = ['button-name', 'label', 'image-alt', 'color-contrast'] as const;

for (const defects of [false, true] as const) {
  test(`S13 axe scan | ${defects ? 'with defects' : 'corrected'}`, async ({ bench, page }) => {
    const state = await bench.goto('a11y', { rows: ROWS, defects: defects ? 1 : 0 });

    const scan = await timeOnceSettled(async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      return results;
    });

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const byRule: Record<string, number> = {};
    for (const v of results.violations) byRule[v.id] = v.nodes.length;

    bench.emitRaw({
      strategyId: 'axe.scan',
      family: 'role',
      metric: 'a11y_violations',
      samples: [results.violations.length],
      matches: results.violations.reduce((n, v) => n + v.nodes.length, 0),
      ok: results.violations.length === 0,
      error: results.violations.map((v) => v.id).join(',') || null,
      dims: {
        defects,
        rows: ROWS,
        domNodes: state.domNodes,
        scanMs: Number(scan.ms.toFixed(1)),
        rules: Object.entries(byRule).map(([id, n]) => `${id}:${n}`).join(' '),
        distinctRules: Object.keys(byRule).length,
      },
    });

    if (defects) {
      // The defective variant must actually be defective, or the comparison below
      // proves nothing.
      for (const rule of EXPECTED_RULES) {
        expect(Object.keys(byRule), `expected axe to report ${rule}`).toContain(rule);
      }
    } else {
      expect(
        results.violations.map((v) => v.id),
        'the corrected variant should be clean for the rules under test',
      ).not.toEqual(expect.arrayContaining([...EXPECTED_RULES]));
    }
  });
}

/**
 * The core comparison: does the locator notice the defect?
 *
 * Each case pairs an identity locator with the accessible locator a user-facing
 * test would write. Both are run against the corrected and the defective page.
 */
test('S13 blindness | test ids stay green through accessibility regressions', async ({ bench, page }) => {
  const cases = [
    {
      defect: 'button-name',
      what: 'icon-only control loses its accessible name',
      identity: () => page.getByTestId('a11y.delete.3'),
      accessible: () => page.getByRole('button', { name: 'Delete record 3', exact: true }),
    },
    {
      defect: 'label',
      what: 'input loses its label association',
      identity: () => page.getByTestId('a11y.owner.3'),
      accessible: () => page.getByLabel('Account owner', { exact: true }).nth(3),
    },
    {
      defect: 'image-alt',
      what: 'image loses its alt text',
      identity: () => page.getByTestId('a11y.avatar.3'),
      accessible: () => page.getByRole('img', { name: 'Avatar for record 3', exact: true }),
    },
  ];

  const seen: Record<string, { identity: number[]; accessible: number[] }> = {};

  for (const defects of [false, true]) {
    const state = await bench.goto('a11y', { rows: ROWS, defects: defects ? 1 : 0 });
    for (const c of cases) {
      seen[c.defect] ??= { identity: [], accessible: [] };
      seen[c.defect].identity.push(await c.identity().count());
      seen[c.defect].accessible.push(await c.accessible().count());
    }
    void state;
  }

  for (const c of cases) {
    const s = seen[c.defect];
    const [identityClean, identityBroken] = s.identity;
    const [accessibleClean, accessibleBroken] = s.accessible;

    // The finding: the identity locator is unchanged by the regression, the
    // accessible one is not.
    const identityBlind = identityClean === identityBroken && identityBroken > 0;
    const accessibleCaught = accessibleClean > 0 && accessibleBroken === 0;

    bench.emitRaw({
      strategyId: `blindness.${c.defect}`,
      family: 'identity',
      metric: 'a11y_blindness',
      samples: [identityBlind && accessibleCaught ? 1 : 0],
      matches: identityBroken,
      ok: accessibleCaught,
      error: accessibleCaught ? null : 'accessible locator did not detect the defect',
      dims: {
        defect: c.defect,
        what: c.what,
        identityClean, identityBroken, accessibleClean, accessibleBroken,
        identityBlind,
        accessibleCaught,
      },
    });

    expect(identityBlind, `${c.defect}: the test id should be unaffected`).toBe(true);
    expect(accessibleCaught, `${c.defect}: the accessible locator should stop resolving`).toBe(true);
  }
});
