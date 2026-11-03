import type {
  LogBounds,
  LoggedEntry,
  PrincipalChange,
  PrincipalId,
  StreamFilter,
  UiEvent,
  UiEventLog,
  UiEventScope,
} from '@taskelith/execution';
import { ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';

// Provisional, in docs/operational-targets.md: the comment interval that
// keeps an idle stream open, and the entries one read takes.
export const KEEP_ALIVE_MILLISECONDS = 15_000;
export const STREAM_READ_PAGE = 500;
// The longest delay a Node.js timer holds.
const MAX_TIMER_MILLISECONDS = 2 ** 31 - 1;

export type ResyncReason = 'cursor-expired' | 'cursor-unknown';

export type StreamFrame =
  | { readonly kind: 'event'; readonly position: number; readonly event: UiEvent }
  | { readonly kind: 'resync'; readonly reason: ResyncReason }
  | { readonly kind: 'stream-ended'; readonly reason: 'role-changed' }
  | { readonly kind: 'keep-alive' };

// Whether a sink took a frame, refused it because its buffer is full, or
// refused it because its client is gone.
export type SinkAnswer = 'sent' | 'full' | 'gone';

// Where a stream's frames go.
export interface StreamSink {
  send(frame: StreamFrame): SinkAnswer;
  close(): void;
}

// Runs a task after a delay; the answer cancels it.
export interface Scheduler {
  after(milliseconds: number, task: () => void): () => void;
}

// The login session of a browser stream: when it ends unless renewed, read
// without renewing it, or undefined once it ended.
export interface LoginSession {
  liveUntil(): Promise<Result<Instant | undefined>>;
}

// Who reads which scope; a bearer stream has no login session.
export interface StreamSubject {
  readonly scope: UiEventScope;
  readonly principalId: PrincipalId;
  // The role check of the stream's operation, run again at the open.
  reauthorize(): Promise<Result<void>>;
  readonly login?: LoginSession;
}

export interface EventStreamDependencies {
  readonly log: Pick<UiEventLog, 'bounds' | 'readAfter'>;
  readonly scheduler: Scheduler;
  readonly clock: { now(): Instant };
  readonly logger: Logger;
  readonly keepAliveMilliseconds?: number;
  readonly readPage?: number;
}

// A stream ready for its response: `attach` starts it, and the answer
// detaches it when the client goes away.
export interface OpenedStream {
  attach(sink: StreamSink): () => void;
}

// Wire contracts section 10: each open stream pulls its entries from the
// log after its cursor, woken when the log's head moves.
export class EventStreamHub {
  readonly #dependencies: EventStreamDependencies;
  readonly #streams = new Set<LiveStream>();

  constructor(dependencies: EventStreamDependencies) {
    this.#dependencies = dependencies;
  }

  // The bounds are read before the role check, so a role change after the
  // check has a higher position and ends the stream.
  async open(subject: StreamSubject, cursor: number | undefined): Promise<Result<OpenedStream>> {
    const bounds = await this.#dependencies.log.bounds();
    if (!bounds.ok) return bounds;
    const authorized = await subject.reauthorize();
    if (!authorized.ok) return authorized;
    const reason = resyncReasonOf(cursor, bounds.value);
    if (reason !== undefined) return ok({ attach: (sink) => resync(sink, reason) });
    const start = { cursor: cursor ?? bounds.value.head, openedAt: bounds.value.head };
    return ok({ attach: (sink) => this.#attach(new LiveStream(subject, sink, start, this.#dependencies, (stream) => this.#streams.delete(stream))) });
  }

  // Every stream reads what the log numbered since its cursor.
  wake(): void {
    for (const stream of this.#streams) stream.wake();
  }

  openStreams(): number {
    return this.#streams.size;
  }

  close(): void {
    for (const stream of [...this.#streams]) stream.close();
  }

  #attach(stream: LiveStream): () => void {
    this.#streams.add(stream);
    stream.start();
    return () => stream.close();
  }
}

function resyncReasonOf(cursor: number | undefined, { floor, head }: LogBounds): ResyncReason | undefined {
  if (cursor === undefined) return undefined;
  if (cursor < floor) return 'cursor-expired';
  return cursor > head ? 'cursor-unknown' : undefined;
}

function resync(sink: StreamSink, reason: ResyncReason): () => void {
  sink.send({ kind: 'resync', reason });
  sink.close();
  return () => undefined;
}

// A change at or before the open preceded the role check, so only a later
// one applies; a project stream ends on its project's or the owner's role.
function endsStream(change: Extract<PrincipalChange, { change: 'roles-changed' }>, scope: UiEventScope): boolean {
  if (change.projectId === undefined) return true;
  return scope.kind === 'project' && scope.projectId === change.projectId;
}

interface StreamStart {
  readonly cursor: number;
  readonly openedAt: number;
}

class LiveStream {
  readonly #subject: StreamSubject;
  readonly #sink: StreamSink;
  readonly #dependencies: EventStreamDependencies;
  readonly #closed: (stream: LiveStream) => void;
  readonly #filter: StreamFilter;
  readonly #openedAt: number;
  #cursor: number;
  #pumping = false;
  #again = false;
  #ended = false;
  #loginDue = false;
  #cancelKeepAlive = () => undefined as void;
  #cancelExpiry = () => undefined as void;

  constructor(subject: StreamSubject, sink: StreamSink, start: StreamStart, dependencies: EventStreamDependencies, closed: (stream: LiveStream) => void) {
    this.#subject = subject;
    this.#sink = sink;
    this.#dependencies = dependencies;
    this.#closed = closed;
    this.#filter = { scope: subject.scope, principalId: subject.principalId };
    this.#cursor = start.cursor;
    this.#openedAt = start.openedAt;
  }

  start(): void {
    this.#armKeepAlive();
    this.#loginDue = this.#subject.login !== undefined;
    this.wake();
  }

  // A wake during a read runs one more read after it.
  wake(): void {
    if (this.#ended) return;
    if (this.#pumping) {
      this.#again = true;
      return;
    }
    void this.#pump();
  }

  close(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#cancelKeepAlive();
    this.#cancelExpiry();
    this.#sink.close();
    this.#closed(this);
  }

  async #pump(): Promise<void> {
    this.#pumping = true;
    try {
      do {
        this.#again = false;
        await this.#drain();
      } while (this.#again && !this.#ended);
    } catch (error) {
      this.#dependencies.logger.error('events.stream.failed', { message: error instanceof Error ? error.message : String(error) });
      this.close();
    } finally {
      this.#pumping = false;
    }
  }

  // A floor that rose past the cursor during a read may have removed what
  // the read missed, so the stream asks for a resync.
  async #drain(): Promise<void> {
    const { log } = this.#dependencies;
    const page = this.#dependencies.readPage ?? STREAM_READ_PAGE;
    while (await this.#loginStillLive()) {
      const bounds = await log.bounds();
      if (!bounds.ok) return this.#warn(bounds.error);
      if (bounds.value.floor > this.#cursor) return this.#resync();
      if (this.#cursor >= bounds.value.head) return;
      const read = await log.readAfter(this.#cursor, bounds.value.head, this.#filter, page);
      if (!read.ok) return this.#warn(read.error);
      const after = await log.bounds();
      if (!after.ok) return this.#warn(after.error);
      if (after.value.floor > this.#cursor) return this.#resync();
      for (const entry of read.value) {
        if (!(await this.#deliver(entry))) return;
        this.#cursor = entry.position;
      }
      if (read.value.length < page) this.#cursor = bounds.value.head;
    }
  }

  async #deliver(entry: LoggedEntry): Promise<boolean> {
    if (!(await this.#loginStillLive())) return false;
    if (entry.kind === 'event') return this.#send({ kind: 'event', position: entry.position, event: entry.event });
    if (entry.position <= this.#openedAt) return true;
    if (entry.change.change === 'sessions-ended') return this.#checkLogin();
    if (!endsStream(entry.change, this.#subject.scope)) return true;
    this.#sink.send({ kind: 'stream-ended', reason: 'role-changed' });
    this.close();
    return false;
  }

  // A full buffer ends the stream instead of holding the log's readers.
  #send(frame: StreamFrame): boolean {
    const answer = this.#sink.send(frame);
    if (answer === 'sent') return true;
    const scope = this.#subject.scope.kind;
    if (answer === 'full') this.#dependencies.logger.warn('events.stream.overflow', { scope });
    else this.#dependencies.logger.info('events.stream.gone', { scope });
    this.close();
    return false;
  }

  #resync(): void {
    this.#sink.send({ kind: 'resync', reason: 'cursor-expired' });
    this.close();
  }

  #warn(failed: Failure): void {
    this.#dependencies.logger.warn('events.stream.read.failed', { code: failed.code, message: failed.message });
  }

  #armKeepAlive(): void {
    const milliseconds = this.#dependencies.keepAliveMilliseconds ?? KEEP_ALIVE_MILLISECONDS;
    this.#cancelKeepAlive = this.#dependencies.scheduler.after(milliseconds, () => {
      if (this.#send({ kind: 'keep-alive' })) this.#armKeepAlive();
    });
  }

  // A due login check runs inside the read loop, so nothing is delivered
  // before it answers.
  async #loginStillLive(): Promise<boolean> {
    if (!this.#loginDue) return !this.#ended;
    this.#loginDue = false;
    return this.#checkLogin();
  }

  // The stream ends without a frame with its login session; a session that
  // cannot be read ends it too, and the client reconnects.
  async #checkLogin(): Promise<boolean> {
    const login = this.#subject.login;
    if (login === undefined || this.#ended) return !this.#ended;
    const until = await login.liveUntil();
    if (!until.ok) this.#warn(until.error);
    if (!until.ok || until.value === undefined) {
      this.close();
      return false;
    }
    this.#armExpiry(until.value);
    return true;
  }

  #armExpiry(until: Instant): void {
    this.#cancelExpiry();
    if (this.#ended) return;
    const remaining = Date.parse(until) - Date.parse(this.#dependencies.clock.now());
    const milliseconds = Math.min(Math.max(remaining, 0), MAX_TIMER_MILLISECONDS);
    this.#cancelExpiry = this.#dependencies.scheduler.after(milliseconds, () => {
      this.#loginDue = true;
      this.wake();
    });
  }
}
