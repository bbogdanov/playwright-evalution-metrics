import { Injectable, computed, inject } from '@angular/core';
import { BenchParams } from './bench-params.service';

type Dict = Record<string, string>;

/** Canonical copy. `reword` keeps the language but changes the wording; `locale` changes the language. */
const EN: Dict = {
  revenue: 'Revenue', region: 'Region', status: 'Status', owner: 'Owner',
  quantity: 'Quantity', margin: 'Margin', updated: 'Updated', channel: 'Channel',
  segment: 'Segment', priority: 'Priority', score: 'Score', tier: 'Tier',
  open: 'Open', edit: 'Edit', remove: 'Remove', approve: 'Approve', submit: 'Submit',
  active: 'Active', pending: 'Pending', closed: 'Closed', blocked: 'Blocked',
  forRow: 'for row', rowLabel: 'Row', cellLabel: 'Cell',
};

const EN_REWORDED: Dict = {
  revenue: 'Net revenue', region: 'Sales region', status: 'Current status', owner: 'Account owner',
  quantity: 'Units', margin: 'Gross margin', updated: 'Last updated', channel: 'Sales channel',
  segment: 'Customer segment', priority: 'Priority level', score: 'Health score', tier: 'Service tier',
  open: 'View', edit: 'Modify', remove: 'Delete', approve: 'Accept', submit: 'Send',
  active: 'In progress', pending: 'Awaiting review', closed: 'Completed', blocked: 'On hold',
  forRow: 'on line', rowLabel: 'Line', cellLabel: 'Field',
};

const DE: Dict = {
  revenue: 'Umsatz', region: 'Region', status: 'Status', owner: 'Inhaber',
  quantity: 'Menge', margin: 'Marge', updated: 'Aktualisiert', channel: 'Kanal',
  segment: 'Segment', priority: 'Priorität', score: 'Bewertung', tier: 'Stufe',
  open: 'Öffnen', edit: 'Bearbeiten', remove: 'Entfernen', approve: 'Genehmigen', submit: 'Absenden',
  active: 'Aktiv', pending: 'Ausstehend', closed: 'Geschlossen', blocked: 'Blockiert',
  forRow: 'für Zeile', rowLabel: 'Zeile', cellLabel: 'Zelle',
};

/**
 * Text lookup. Every user-visible string in the benchmark app goes through here so
 * that the `locale` and `reword` mutations can invalidate text-based locators
 * without touching attribute-based ones.
 */
@Injectable({ providedIn: 'root' })
export class Copy {
  private readonly params = inject(BenchParams);

  private readonly dict = computed<Dict>(() => {
    if (this.params.has('locale')) return DE;
    if (this.params.has('reword')) return EN_REWORDED;
    return EN;
  });

  t(key: string): string {
    return this.dict()[key] ?? key;
  }

  /** Accessible name for a grid target, e.g. "Revenue for row 4821". */
  cellName(columnKey: string, row: number): string {
    return `${this.t(columnKey)} ${this.t('forRow')} ${row}`;
  }
}
