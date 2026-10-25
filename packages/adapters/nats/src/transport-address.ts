import { err, failure, ok, type Result } from '@taskelith/kernel';

// Identifiers may hold `.`, `*`, or `>`, which NATS reads as subject syntax,
// so only these characters may form a subject token or a stream name.
const SUBJECT_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const OUTBOX_COMMAND_SUBJECT = /^workers\.([^.]+)\.commands$/;
// The SDLC events of the control plane (coordinator decision Q2 of item 16).
const OUTBOX_SDLC_SUBJECT = 'sdlc.events';
const OBSERVATIONS_SUFFIX = '.observations';
const HEARTBEATS_SUFFIX = '.heartbeats';

export type StreamKind = 'commands' | 'observations' | 'quarantine' | 'advisories' | 'sdlc';

type WorkerSubjectKind = 'commands' | 'observations' | 'heartbeats';

// Where one installation's messages live: the subjects of the execution
// contract and the streams that hold them.
export class TransportAddress {
  readonly installationId: string;

  private constructor(installationId: string) {
    this.installationId = installationId;
  }

  static of(installationId: string): Result<TransportAddress> {
    const checked = checkToken('installationId', installationId);
    return checked.ok ? ok(new TransportAddress(installationId)) : checked;
  }

  commandSubject(workerId: string): Result<string> {
    return this.#workerSubject(workerId, 'commands');
  }

  observationSubject(workerId: string): Result<string> {
    return this.#workerSubject(workerId, 'observations');
  }

  // Core NATS, in no stream: a lost heartbeat is replaced by the next one.
  heartbeatSubject(workerId: string): Result<string> {
    return this.#workerSubject(workerId, 'heartbeats');
  }

  // An outbox row names `workers.<workerId>.commands` or `sdlc.events`
  // without the installation's prefix.
  subjectOfOutboxRow(subject: string): Result<string> {
    if (subject === OUTBOX_SDLC_SUBJECT) return ok(this.sdlcEventsSubject());
    const workerId = OUTBOX_COMMAND_SUBJECT.exec(subject)?.[1];
    if (workerId === undefined) {
      return err(failure('invalid', 'an outbox subject must be workers.<workerId>.commands or sdlc.events', { subject }));
    }
    return this.commandSubject(workerId);
  }

  // The worker whose observation subject this is, if it is one.
  workerOfObservationSubject(subject: string): string | undefined {
    return this.#workerOf(subject, OBSERVATIONS_SUFFIX);
  }

  workerOfHeartbeatSubject(subject: string): string | undefined {
    return this.#workerOf(subject, HEARTBEATS_SUFFIX);
  }

  sdlcEventsSubject(): string {
    return `${this.#prefix}.sdlc.events`;
  }

  allWorkerSubjects(kind: WorkerSubjectKind): string {
    return `${this.#prefix}.workers.*.${kind}`;
  }

  quarantineSubject(source: StreamKind): string {
    return `${this.#prefix}.quarantine.${source}`;
  }

  streamName(kind: StreamKind): string {
    return `TASKELITH_${this.installationId}_${kind.toUpperCase()}`;
  }

  // What a worker's broker user may do: pull and acknowledge its own commands,
  // publish its own observations and heartbeats, and receive its replies.
  workerPermissions(workerId: string): Result<{ publish: string[]; subscribe: string[] }> {
    const observations = this.observationSubject(workerId);
    if (!observations.ok) return observations;
    const heartbeats = this.heartbeatSubject(workerId);
    if (!heartbeats.ok) return heartbeats;
    const stream = this.streamName('commands');
    return ok({
      publish: [
        `$JS.API.CONSUMER.INFO.${stream}.${workerId}`,
        `$JS.API.CONSUMER.MSG.NEXT.${stream}.${workerId}`,
        `$JS.ACK.${stream}.${workerId}.>`,
        observations.value,
        heartbeats.value,
      ],
      subscribe: [`_INBOX.${this.installationId}.${workerId}.>`],
    });
  }

  // A worker's replies arrive only under its own prefix (JetStream spike).
  inboxPrefix(workerId: string): Result<string> {
    const checked = checkToken('workerId', workerId);
    return checked.ok ? ok(`_INBOX.${this.installationId}.${workerId}`) : checked;
  }

  get #prefix(): string {
    return `taskelith.${this.installationId}`;
  }

  #workerSubject(workerId: string, kind: WorkerSubjectKind): Result<string> {
    const checked = checkToken('workerId', workerId);
    return checked.ok ? ok(`${this.#prefix}.workers.${workerId}.${kind}`) : checked;
  }

  #workerOf(subject: string, suffix: string): string | undefined {
    const prefix = `${this.#prefix}.workers.`;
    if (!subject.startsWith(prefix) || !subject.endsWith(suffix)) return undefined;
    const workerId = subject.slice(prefix.length, -suffix.length);
    return SUBJECT_TOKEN.test(workerId) ? workerId : undefined;
  }
}

export function checkToken(name: string, value: string): Result<void> {
  if (SUBJECT_TOKEN.test(value)) return ok(undefined);
  return err(failure('invalid', `${name} must be 1-64 letters, digits, '_' or '-'`, { [name]: value }));
}
