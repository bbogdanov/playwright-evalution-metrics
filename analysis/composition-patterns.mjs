/**
 * The composition patterns: what each DO/DON'T pair means, and how to read its
 * proof.
 *
 * Only prose lives here. The code shown for every pattern is extracted from
 * e2e/patterns/s14-composition.spec.ts at build time, and the numbers come from
 * results/composition.json, which that scenario writes. Nothing on the published
 * page is typed twice.
 */

export const FAMILIES = [
  {
    id: 'fixture',
    title: 'Fixtures and page objects',
    lede:
      'A locator is a description of how to find something, not something found. Almost every fixture ' +
      'mistake is a variation on forgetting that: resolving too early, storing the result, or storing it ' +
      'somewhere that outlives the page it came from.',
  },
  {
    id: 'scope',
    title: 'Scoping and chaining',
    lede:
      'Chaining is not the problem. Chaining from a root that matches thousands of elements is, because ' +
      'every step re-resolves against every match of the step before it. Give the first step one match and ' +
      'the multiplication disappears.',
  },
  {
    id: 'strict',
    title: 'Strict mode and ambiguity',
    lede:
      'Strict mode fails a test when a locator matches more than one element. That failure is the feature. ' +
      'Both ways of silencing it - taking the first match, or indexing into the list - replace a loud ' +
      'failure with a test that passes against the wrong element.',
  },
  {
    id: 'wait',
    title: 'Waiting and assertions',
    lede:
      'Anything you await into a variable is a snapshot with no retry. Anything you pass to expect() is ' +
      're-read until it agrees or the timeout expires. Most flaky tests are a snapshot being asserted ' +
      'against a page that had not finished moving.',
  },
];

export const PATTERNS = [
  {
    id: 'fixture.handle',
    family: 'fixture',
    title: 'Hand out locators, not element handles',
    summary: 'A fixture that resolves the element hands the test a pointer to a node that may no longer exist.',
    why:
      'An ElementHandle points at one specific DOM node. A locator points at a query. When the framework ' +
      're-renders - a signal updates, a list re-keys, a route reloads - the node the handle holds is ' +
      'detached, and every action on it fails against a DOM nobody is looking at any more. The locator ' +
      'runs its query again and finds the element that exists now. This is also why a fixture can safely ' +
      'build locators before the test does anything at all.',
    proofNote: 'Measured on a list that replaces its nodes on every tick.',
  },
  {
    id: 'fixture.state',
    family: 'fixture',
    title: 'Do not await DOM state in a constructor',
    summary: 'A page object that counts, reads text or checks visibility while being built captures a moment that has already passed.',
    why:
      'Fixtures run before the test body, which is usually before the application has settled. A count ' +
      'taken there is not wrong later - it was wrong when it was taken. Expose the locator and let the ' +
      'assertion do the waiting; the page object stays cheap to construct and correct at every point in ' +
      'the test.',
    proofNote: 'The control arrives 800 ms after the app reports its first render.',
  },
  {
    id: 'fixture.lazy',
    family: 'fixture',
    title: 'Build locators before the page exists',
    summary: 'Locators can be constructed against a blank page, in a fixture, at module scope - they resolve when used.',
    why:
      'This is the property that makes page objects work. Because nothing is resolved until an action or ' +
      'an assertion runs, a page object can be constructed once and used across navigations without ' +
      'rebuilding anything. The eager equivalent cannot exist yet, and has to be re-resolved after every ' +
      'navigation - which is the bug in every "element not attached" stack trace.',
    proofNote: 'Both forms attempted before navigation, then used after it.',
  },
  {
    id: 'fixture.binding',
    family: 'fixture',
    title: 'A locator belongs to one page',
    summary: 'Locators carry their frame. One captured from the first page keeps querying the first page.',
    why:
      'A locator is bound to the frame that created it, so passing one between fixtures, storing one at ' +
      'module scope, or keeping one across a popup or a new tab silently queries the wrong document. There ' +
      'is no error - the query runs, against the page you were not looking at. Build locators from the ' +
      'page object you were handed, and give a second page its own.',
    proofNote: 'Two pages open at once, with different row counts, in the same context.',
  },
  {
    id: 'scope.role',
    family: 'scope',
    title: 'Scope the expensive query, keep the assertion',
    summary: 'Find the container by identity; find the control inside it by role and name.',
    why:
      'An unscoped role query computes an accessible name for every element of that role in the document. ' +
      'Scoped to a container it computes one per candidate inside that container. The test still asserts ' +
      'that the control is reachable by its accessible name - which is the thing worth asserting - and ' +
      'stops paying for the rest of the page to be examined.',
    proofNote: 'Same element, same accessible name, one paired measurement each.',
  },
  {
    id: 'scope.chain',
    family: 'scope',
    title: 'Chain from something unique',
    summary: 'The cost of a chain is the product of the match counts along it.',
    why:
      'Each chained step runs its selector against every element the previous step matched. Three broad ' +
      'steps over a large table is thousands of subqueries; the same three steps from a container that ' +
      'matches exactly one element is three. The fix is never "stop chaining" - it is to make the first ' +
      'step unique.',
    proofNote: 'Identical chains, differing only in whether the first step matches one element or every row.',
  },
  {
    id: 'scope.filter',
    family: 'scope',
    title: 'Filter a narrow set, or address the element instead',
    summary: 'filter({ hasText }) runs a text scan per candidate, so the cost follows the candidate count.',
    why:
      'Filtering is the right tool when the thing you want can only be described by its content, and the ' +
      'candidate set is already small. Reaching for it against every row of a table means scanning the text ' +
      'of every row to find the one whose identity you already knew. If the container has a test id, use it.',
    proofNote: 'Filtering every row against addressing the row directly.',
  },
  {
    id: 'strict.first',
    family: 'strict',
    title: 'Never silence a strict-mode violation with .first()',
    summary: '.first() takes whatever is first in document order, which is rarely the element you meant.',
    why:
      'A strict-mode violation says the locator does not identify one element. .first() does not fix that; ' +
      'it picks one and carries on, and the test passes against whatever happens to render earliest. When ' +
      'something is later inserted above your target - a banner, a duplicate id, a second instance of the ' +
      'component - the test keeps passing and stops testing what it claims to. Narrow the root instead.',
    proofNote: 'Four elements deliberately reuse the target id, rendered ahead of it.',
  },
  {
    id: 'strict.nth',
    family: 'strict',
    title: 'nth() indexes the template, not the data',
    summary: 'Position is owned by whoever edits the markup, which is not whoever wrote the test.',
    why:
      'Indexing into a list of matches ties the test to DOM order. Reordering columns, adding a button, ' +
      'or rendering an extra element conditionally changes what the index refers to, and nothing fails - ' +
      'the test asserts confidently against a different element. Where a stable identity exists, address ' +
      'it; nth() is defensible only in a tree you fully control, such as a component test.',
    proofNote: 'The same two locators before and after the column order is reversed.',
  },
  {
    id: 'wait.count',
    family: 'wait',
    title: 'count() asks, toHaveCount() waits',
    summary: 'Locator queries return what is true right now. Web-first assertions retry until the timeout.',
    why:
      'await locator.count() resolves immediately against a page that may still be rendering, and the ' +
      'number it returns is then asserted with no retry. expect(locator).toHaveCount(n) re-runs the query ' +
      'until it matches or gives up. The difference is the difference between a flaky suite and a slow one, ' +
      'and only one of those is worth having.',
    proofNote: 'The control appears 800 ms after the page reports itself rendered.',
  },
  {
    id: 'wait.all',
    family: 'wait',
    title: 'all() freezes a list that has not stopped moving',
    summary: 'It returns positional locators captured at one moment, and positions change.',
    why:
      'locator.all() resolves the matches once and hands back an array of nth-indexed locators. If the ' +
      'list re-renders, re-sorts or grows, entry 3 still means "the fourth match whenever you next use it" ' +
      '- which may now be a different item. Assert the count first if you must iterate, and address items ' +
      'by identity inside the loop rather than by where they were.',
    proofNote: 'A list that re-keys every tick, read twice through the same array.',
  },
  {
    id: 'wait.snapshot',
    family: 'wait',
    title: 'An awaited value is not an assertion',
    summary: 'textContent(), inputValue() and getAttribute() return strings, and strings do not retry.',
    why:
      'Capturing a value and asserting on the variable moves the assertion off the page and into your ' +
      'process. Whatever the string said when it was read, it says forever - so a test can pass against a ' +
      'value the interface stopped showing seconds ago, or fail because the read landed one frame early. ' +
      'Pass the locator to expect() and let it re-read.',
    proofNote: 'Both reads taken across one re-render of the same element.',
  },
  {
    id: 'wait.sleep',
    family: 'wait',
    title: 'A fixed sleep pays the worst case every time',
    summary: 'waitForTimeout costs the same on a fast machine and is still too short on a slow one.',
    why:
      'A sleep encodes a guess about someone else\'s hardware. It is pure cost when the page was ready ' +
      'immediately, and it fails anyway when CI is loaded. A web-first assertion returns as soon as the ' +
      'condition holds and waits longer when it has to - faster in the common case and more reliable in ' +
      'the bad one. There is no trade-off here to weigh.',
    proofNote: 'Wall clock for each form, against a control that appears after 800 ms.',
  },
];
