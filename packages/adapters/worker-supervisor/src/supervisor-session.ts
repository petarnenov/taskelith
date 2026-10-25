import { err, ok, type Result } from '@taskelith/kernel';
import type { ExecutionLock, Platform, RecordStore, Spawner } from './ports.js';
import {
  encodeRecord,
  parseIntent,
  parseLaunch,
  RECORD_FILES,
  supervisorFile,
  type ExitRecord,
  type IntentRecord,
  type LaunchRecord,
  type RecordProblem,
  type SealReason,
} from './record.js';

export interface SupervisorTiming {
  readonly pollMilliseconds: number;
  readonly graceMilliseconds: number;
  readonly retryMilliseconds: number;
  // Unreadable polls or failed tries of one step before a supervisor gives
  // up without a fact, so that recovery decides.
  readonly unreadablePolls: number;
}

export interface SupervisorDependencies {
  readonly store: RecordStore;
  readonly lock: ExecutionLock;
  readonly platform: Platform;
  readonly spawner: Spawner;
  readonly selfPid: number;
  readonly timing: SupervisorTiming;
  readonly sleep: (milliseconds: number) => Promise<void>;
  // Names each step of contract section 4 for the test harness.
  readonly crashPoint: (point: string) => void;
}

export type SupervisorOutcome =
  | { readonly kind: 'lock-busy' }
  | { readonly kind: 'lock-unusable'; readonly reason: string }
  | { readonly kind: 'record-unusable'; readonly reason: string }
  | { readonly kind: 'not-first' }
  | { readonly kind: 'sealed'; readonly reason: SealReason }
  | { readonly kind: 'launch-exists'; readonly launch: LaunchRecord | undefined }
  | { readonly kind: 'write-failed'; readonly file: string }
  | { readonly kind: 'containment-unreadable' }
  | { readonly kind: 'containment-unusable' }
  | { readonly kind: 'termination-unprovable' }
  | { readonly kind: 'exited'; readonly exit: ExitRecord }
  | { readonly kind: 'child-gone' };

export interface Session {
  readonly serial: number | 'identity-unreadable' | 'list-failed' | 'write-failed';
  readonly intent: IntentRecord;
}

// Every supervisor holds `lock` for its whole life and writes the next
// supervisor record right after it takes the lock (contract sections 3, 6).
export async function withLock(
  dependencies: SupervisorDependencies,
  body: (session: Session) => Promise<SupervisorOutcome>,
): Promise<SupervisorOutcome> {
  const acquired = dependencies.lock.tryAcquire();
  if (!acquired.ok) return { kind: 'lock-unusable', reason: acquired.error.message };
  if (acquired.value === undefined) return { kind: 'lock-busy' };
  const held = acquired.value;
  try {
    const intent = await readParsed(dependencies.store, RECORD_FILES.intent, parseIntent);
    if (!intent.ok || intent.value === undefined) return { kind: 'record-unusable', reason: 'intent is missing or unreadable' };
    return await body({ serial: await writeSupervisorRecord(dependencies), intent: intent.value });
  } finally {
    held.release();
  }
}

async function writeSupervisorRecord(dependencies: SupervisorDependencies): Promise<Session['serial']> {
  const self = dependencies.platform.inspector.identity(dependencies.selfPid);
  if (!self.ok || self.value === undefined) return 'identity-unreadable';
  const names = await dependencies.store.list();
  if (!names.ok) return 'list-failed';
  let serial = highestSupervisor(names.value) + 1;
  for (;;) {
    const created = await dependencies.store.createOnce(supervisorFile(serial), encodeRecord({ serial, process: self.value }));
    if (!created.ok) return 'write-failed';
    if (created.value === 'created') return serial;
    serial += 1;
  }
}

export function highestSupervisor(names: readonly string[]): number {
  return names.reduce((highest, name) => {
    const match = /^supervisor\.([1-9]\d*)$/.exec(name);
    return match === null ? highest : Math.max(highest, Number(match[1]));
  }, 0);
}

// After the spawn, a failed durable write is retried while the child keeps
// running (contract section 4).
export async function persist<T>(dependencies: SupervisorDependencies, write: () => Promise<Result<T>>): Promise<void> {
  while (!(await write()).ok) await dependencies.sleep(dependencies.timing.retryMilliseconds);
}

// Retries a step at most `unreadablePolls` times.
export async function attempt<T>(dependencies: SupervisorDependencies, step: () => Result<T> | Promise<Result<T>>): Promise<boolean> {
  for (let tries = 1; ; tries += 1) {
    if ((await step()).ok) return true;
    if (tries >= dependencies.timing.unreadablePolls) return false;
    await dependencies.sleep(dependencies.timing.retryMilliseconds);
  }
}

export async function writeExit(dependencies: SupervisorDependencies, exit: ExitRecord): Promise<void> {
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.exit, encodeRecord(exit)));
}

export async function cancellationRequested(store: RecordStore): Promise<boolean> {
  const text = await store.read(RECORD_FILES.cancel);
  return text.ok && text.value !== undefined;
}

export async function readLaunch(store: RecordStore): Promise<LaunchRecord | undefined> {
  const launch = await readParsed(store, RECORD_FILES.launch, parseLaunch);
  return launch.ok ? launch.value : undefined;
}

export async function readParsed<T>(
  store: RecordStore,
  name: string,
  parse: (text: string) => Result<T, RecordProblem>,
): Promise<Result<T | undefined, RecordProblem | 'unreadable'>> {
  const text = await store.read(name);
  if (!text.ok) return err('unreadable');
  return text.value === undefined ? ok(undefined) : parse(text.value);
}
