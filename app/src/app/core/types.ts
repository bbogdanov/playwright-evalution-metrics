/** Identity of a benchmark target: the element every locator strategy must reach. */
export interface BmTargetSpec {
  /** Logical family: cell, row, btn, field, option... */
  kind: string;
  /** Row index (or ordinal for non-grid targets). */
  r: number;
  /** Column index, omitted for one-dimensional targets. */
  c?: number;
  /** Base text used for the accessible name; localised by MutationService. */
  label: string;
  /** Style variant, drives the secondary semantic class. */
  variant?: number;
}

export type MutationMode =
  /** Visible copy switches locale. Breaks getByText/getByRole(name)/getByLabel. */
  | 'locale'
  /** Build-hashed class names re-rolled. Breaks hashed-class locators. */
  | 'classHash'
  /** Extra wrapper elements inserted. Breaks structural CSS/XPath chains. */
  | 'wrap'
  /** Sibling order changed. Breaks nth()/positional locators. */
  | 'reorder'
  /** Copy reworded in the same locale. Breaks exact-text locators. */
  | 'reword'
  /** data-testid renamed to data-test. Breaks the un-migrated testid locator. */
  | 'attrRename'
  /** Semantic class renamed. Breaks semantic-class locators. */
  | 'classRename';

export const ALL_MUTATIONS: MutationMode[] = [
  'locale', 'classHash', 'wrap', 'reorder', 'reword', 'attrRename', 'classRename',
];
