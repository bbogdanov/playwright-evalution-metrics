/**
 * The mutation catalogue, mirrored from the app's MutationMode union.
 *
 * Kept in the test tree rather than imported from the Angular sources so the e2e
 * project does not depend on the app's TypeScript build; the app is a deployment
 * artefact to these tests, not a library.
 */
export const ALL_MUTATIONS = [
  'locale',
  'reword',
  'classHash',
  'classRename',
  'wrap',
  'reorder',
  'attrRename',
] as const;

export type Mutation = (typeof ALL_MUTATIONS)[number];

/** What each mutation represents in a real codebase, for the report. */
export const MUTATION_NOTES: Record<Mutation, string> = {
  locale: 'Application shipped in another language',
  reword: 'Product changed the copy, same language',
  classHash: 'Build re-hashed scoped or CSS-module class names',
  classRename: 'Someone renamed a semantic CSS class',
  wrap: 'Someone added a layout wrapper element',
  reorder: 'Someone reordered sibling elements',
  attrRename: 'Team migrated its test-id attribute convention',
};
