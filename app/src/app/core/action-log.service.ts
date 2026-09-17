import { Injectable, signal } from '@angular/core';

/**
 * Records the last interaction so action-based scenarios can assert that a click
 * actually landed on the intended element rather than merely not throwing.
 */
@Injectable({ providedIn: 'root' })
export class ActionLog {
  readonly last = signal<string>('');
  readonly count = signal<number>(0);

  record(id: string): void {
    this.last.set(id);
    this.count.update((n) => n + 1);
  }
}
