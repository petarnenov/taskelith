import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { CommittedEntry, LogBounds, LoggedEntry, StreamFilter, UiEventLog } from '../ports/ui-event-log.js';
import type { UiEvent, UiEventOutbox, UiEventScope } from '../ports/ui-events.js';

interface Row {
  readonly entry: CommittedEntry;
  position?: number;
  numberedAt?: Instant;
}

// The event log in memory: stores hand it their entries at each commit, in
// commit order, and `assign` numbers them in that order.
export class InMemoryUiEventLog implements UiEventLog {
  readonly #rows: Row[] = [];
  #head = 0;
  #floor = 0;

  commit(entries: readonly CommittedEntry[]): void {
    for (const entry of entries) this.#rows.push({ entry });
  }

  async assign(limit: number, numberedAt: Instant): Promise<Result<number>> {
    const pending = this.#rows.filter((row) => row.position === undefined).slice(0, limit);
    for (const row of pending) {
      row.position = ++this.#head;
      row.numberedAt = numberedAt;
    }
    return ok(pending.length);
  }

  async bounds(): Promise<Result<LogBounds>> {
    return ok(Object.freeze({ floor: this.#floor, head: this.#head }));
  }

  async readAfter(after: number, through: number, filter: StreamFilter, limit: number): Promise<Result<readonly LoggedEntry[]>> {
    const read = this.#rows
      .filter((row) => row.position !== undefined && row.position > after && row.position <= through && isOfFilter(row.entry, filter))
      .sort((left, right) => left.position! - right.position!)
      .slice(0, limit)
      .map((row) => loggedEntry(row.entry, row.position!));
    return ok(Object.freeze(read));
  }

  async prune(before: Instant, limit: number): Promise<Result<number>> {
    const doomed = this.#rows
      .filter((row) => row.position !== undefined && row.numberedAt! < before)
      .sort((left, right) => left.position! - right.position!)
      .slice(0, limit);
    for (const row of doomed) {
      this.#rows.splice(this.#rows.indexOf(row), 1);
      this.#floor = Math.max(this.#floor, row.position!);
    }
    return ok(this.#floor);
  }

  // Sets the head back, as a restore of an older backup does.
  restoreHead(head: number): void {
    this.#head = head;
    this.#floor = Math.min(this.#floor, head);
    for (let index = this.#rows.length - 1; index >= 0; index--) {
      if ((this.#rows[index]!.position ?? 0) > head) this.#rows.splice(index, 1);
    }
  }
}

// A transaction's outbox, whose entries reach the log only at its commit.
export class PendingUiEvents implements UiEventOutbox {
  readonly entries: CommittedEntry[] = [];

  async append(event: UiEvent): Promise<Result<void>> {
    this.entries.push(Object.freeze({ kind: 'event', event }));
    return ok(undefined);
  }
}

function isOfFilter(entry: CommittedEntry, filter: StreamFilter): boolean {
  if (entry.kind === 'principal-change') return entry.change.principalId === filter.principalId;
  return isSameScope(entry.event.scope, filter.scope);
}

export function isSameScope(left: UiEventScope, right: UiEventScope): boolean {
  if (left.kind === 'installation' || right.kind === 'installation') return left.kind === right.kind;
  return left.projectId === right.projectId;
}

function loggedEntry(entry: CommittedEntry, position: number): LoggedEntry {
  return Object.freeze(entry.kind === 'event'
    ? { kind: 'event', position, event: entry.event }
    : { kind: 'principal-change', position, change: entry.change });
}
