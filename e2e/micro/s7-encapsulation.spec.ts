import { expect, test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';

/**
 * S7 - what encapsulation costs, and what it breaks.
 *
 * The same payload is rendered three ways. Emulated adds an _ngcontent-*
 * attribute to every element. ShadowDom puts the payload behind a real shadow
 * root. None does neither.
 *
 * The cost question is secondary here. The binary question is what still works:
 * Playwright's CSS and text engines pierce open shadow roots, XPath does not, and
 * neither does document.querySelector. A team that switches a component to
 * ShadowDom encapsulation will discover which of their locators were XPath the
 * hard way, and this scenario puts a number on it.
 */

test.use({ scenario: 'S7' });

const ROWS = 150;
const COLS = 8;

for (const enc of ['emulated', 'shadow', 'none'] as const) {
  test(`S7 encapsulation | enc=${enc}`, async ({ bench, page }) => {
    const state = await bench.goto('shadow', { enc, rows: ROWS, cols: COLS });

    const target = await bench.describe(`boxcell-r${Math.floor(ROWS / 2)}-c3`);
    expect(target.found, 'descriptor lookup must pierce shadow roots').toBe(true);
    expect(target.inShadowRoot).toBe(enc === 'shadow');

    const dims = {
      encapsulation: enc,
      rows: ROWS,
      cols: COLS,
      domNodes: state.domNodes,
      inShadowRoot: target.inShadowRoot,
    };

    await bench.measureNoiseFloor(dims);

    // Every strategy is attempted, including the ones expected to fail under
    // shadow encapsulation. A recorded zero-match is the finding.
    for (const strategy of applicable(target)) {
      await bench.measureStrategy({ strategy, target, dims, options: { reps: 30 } });
    }

    // XPath is excluded by `applicable` inside a shadow root because it cannot
    // work there. Record that fact explicitly rather than leaving a hole in the
    // matrix that a reader has to interpret.
    if (target.inShadowRoot) {
      for (const id of ['xpath.absolute', 'xpath.relative']) {
        bench.emitRaw({
          strategyId: id,
          family: 'structural',
          metric: 'net_query_ms',
          samples: [],
          matches: 0,
          ok: false,
          error: 'XPath cannot traverse a shadow boundary',
          dims: { ...dims, unsupported: true },
        });
      }
    }
  });
}
