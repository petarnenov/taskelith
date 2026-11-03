import type { Scheduler, StreamFrame, StreamSink } from '@taskelith/control-plane';
import { InMemoryUiEventLog, projectScope, type CommittedEntry, type PrincipalChange, type UiEvent, type UiEventScope } from '@taskelith/execution';
import { instantFromEpochMilliseconds, type Instant } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import { value } from '@taskelith/testing';

export const ALPHA = 'alpha' as ProjectId;
export const BETA = 'beta' as ProjectId;
export const AT = value(instantFromEpochMilliseconds(Date.parse('2026-11-03T09:00:00.000Z')));

// A board event of the scope whose worker count marks it.
export function marked(mark: number, scope: UiEventScope = projectScope(ALPHA)): UiEvent {
  return { scope, occurredAt: AT, record: { type: 'board-changed', workersOnline: mark } };
}

export const eventEntry = (event: UiEvent): CommittedEntry => ({ kind: 'event', event });
export const changeEntry = (change: PrincipalChange): CommittedEntry => ({ kind: 'principal-change', change });

// Commits the entries and numbers them, as one change and the assigner.
export async function committed(log: InMemoryUiEventLog, ...entries: readonly CommittedEntry[]): Promise<void> {
  log.commit(entries);
  value(await log.assign(1_000, AT));
}

// Frames as the hub sends them; `until` settles once a predicate holds.
export class RecordingSink implements StreamSink {
  readonly frames: StreamFrame[] = [];
  closed = false;
  accepts = true;
  readonly #waiters: Array<{ holds: () => boolean; resolve: () => void }> = [];

  send(frame: StreamFrame): boolean {
    this.frames.push(frame);
    this.#check();
    return this.accepts;
  }

  close(): void {
    this.closed = true;
    this.#check();
  }

  until(holds: (sink: RecordingSink) => boolean): Promise<void> {
    if (holds(this)) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ holds: () => holds(this), resolve }));
  }

  // The marks of the board events, and the kinds of the other frames.
  marks(): readonly (number | string)[] {
    return this.frames.map((frame) => (frame.kind === 'event' && frame.event.record.type === 'board-changed'
      ? frame.event.record.workersOnline : frame.kind === 'event' ? frame.event.record.type : frame.kind));
  }

  #check(): void {
    for (const waiter of [...this.#waiters]) {
      if (!waiter.holds()) continue;
      this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }
}

// Tasks run only when the test fires them.
export class ManualScheduler implements Scheduler {
  readonly pending = new Map<number, { milliseconds: number; task: () => void }>();
  readonly #waiters: Array<{ milliseconds: number; resolve: () => void }> = [];
  #next = 0;

  after(milliseconds: number, task: () => void): () => void {
    const key = this.#next++;
    this.pending.set(key, { milliseconds, task });
    for (const waiter of this.#waiters.filter((candidate) => candidate.milliseconds === milliseconds)) {
      this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
    return () => this.pending.delete(key);
  }

  // Settles once a task with that delay is pending.
  armed(milliseconds: number): Promise<void> {
    if (this.delays().includes(milliseconds)) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ milliseconds, resolve }));
  }

  // Runs the tasks due after exactly that delay; answers how many ran.
  fire(milliseconds: number): number {
    const due = [...this.pending].filter(([, entry]) => entry.milliseconds === milliseconds);
    for (const [key, entry] of due) {
      this.pending.delete(key);
      entry.task();
    }
    return due.length;
  }

  delays(): readonly number[] {
    return [...this.pending.values()].map((entry) => entry.milliseconds);
  }
}

export class ManualClock {
  #now = Date.parse(AT);

  now(): Instant {
    return value(instantFromEpochMilliseconds(this.#now));
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
  }
}
