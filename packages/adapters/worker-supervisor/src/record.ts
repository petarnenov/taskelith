import { parseExitStatus, type ExitStatus } from '@taskelith/execution';
import { err, ok, type Result } from '@taskelith/kernel';
import type { ProcessIdentity } from './process-identity.js';

// The record format this build writes; it reads this one and the previous
// one, so that a worker reads what an older supervisor wrote (section 9).
export const RECORD_FORMAT = 1;
export const READABLE_RECORD_FORMATS: readonly number[] = Object.freeze([RECORD_FORMAT]);

export const RECORD_FILES = Object.freeze({
  intent: 'intent',
  lock: 'lock',
  launch: 'launch',
  handle: 'handle',
  events: 'events',
  exit: 'exit',
  cancel: 'cancel',
});

export function supervisorFile(serial: number): string {
  return `supervisor.${serial}`;
}

// A file that cannot be trusted makes the execution uncertain (section 3).
export interface RecordProblem {
  readonly file: string;
  readonly kind: 'corrupt' | 'newer-format';
  readonly detail: string;
}

export interface Command {
  readonly executable: string;
  readonly arguments: readonly string[];
}

export interface ExecutionAccount {
  readonly uid: number;
  readonly gid: number;
}

export interface IntentRecord {
  readonly executionId: string;
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  readonly launchAuthId: string;
  readonly deadline: { readonly bootId: string; readonly milliseconds: number };
  readonly namespaceIncarnation?: string;
  readonly supervisorVersion: string;
  readonly command: Command;
  readonly executionAccount?: ExecutionAccount;
}

export interface SupervisorRecord {
  readonly serial: number;
  readonly process: ProcessIdentity;
}

export const SEAL_REASONS = Object.freeze([
  'boot-changed',
  'deadline-unreadable',
  'deadline-passed',
  'containment-unavailable',
  'recovery',
] as const);

export type SealReason = (typeof SEAL_REASONS)[number];

export type LaunchRecord =
  | { readonly kind: 'claim'; readonly launchAuthId: string; readonly supervisor: number; readonly containment?: string }
  | { readonly kind: 'seal'; readonly by: 'worker' | 'supervisor'; readonly reason: SealReason };

export type HandleRecord =
  | { readonly kind: 'spawned'; readonly process: ProcessIdentity; readonly processGroupId: number }
  | { readonly kind: 'spawn-failed'; readonly failure: string };

export const TERMINATION_EVIDENCE = Object.freeze([
  'containment-empty',
  'process-group-empty',
  'never-spawned',
  'boot-changed',
  'namespace-ended',
] as const);

export type TerminationEvidence = (typeof TERMINATION_EVIDENCE)[number];

export interface ExitRecord {
  readonly status: ExitStatus;
  readonly startProven: boolean;
  readonly spawnFailure?: string;
  readonly termination: TerminationEvidence;
}

export interface CancelRecord {
  readonly reason: string;
}

export type EventEntry =
  | { readonly kind: 'descendant'; readonly process: ProcessIdentity }
  | { readonly kind: 'cancellation'; readonly step: 'terminate-sent' | 'kill-sent' | 'containment-killed' | 'not-applied' }
  | { readonly kind: 'survivors'; readonly processes: readonly ProcessIdentity[] };

type Fields = Record<string, unknown>;
type Reader<T> = (fields: Fields) => T | undefined;

export function encodeRecord(value: object): string {
  return `${JSON.stringify({ format: RECORD_FORMAT, ...value })}\n`;
}

export function parseIntent(text: string): Result<IntentRecord, RecordProblem> {
  return parseRecord(RECORD_FILES.intent, text, readIntent);
}

export function parseSupervisor(file: string, text: string): Result<SupervisorRecord, RecordProblem> {
  return parseRecord(file, text, (fields) => {
    const process = readProcess(fields.process);
    return isPositiveInteger(fields.serial) && process ? { serial: fields.serial, process } : undefined;
  });
}

export function parseLaunch(text: string): Result<LaunchRecord, RecordProblem> {
  return parseRecord(RECORD_FILES.launch, text, readLaunch);
}

export function parseHandle(text: string): Result<HandleRecord, RecordProblem> {
  return parseRecord(RECORD_FILES.handle, text, readHandle);
}

export function parseExit(text: string): Result<ExitRecord, RecordProblem> {
  return parseRecord(RECORD_FILES.exit, text, readExit);
}

export function parseCancel(text: string): Result<CancelRecord, RecordProblem> {
  return parseRecord(RECORD_FILES.cancel, text, (fields) => (isText(fields.reason) ? { reason: fields.reason } : undefined));
}

export function parseEventEntry(text: string): Result<EventEntry, RecordProblem> {
  return parseRecord(RECORD_FILES.events, text, readEvent);
}

function parseRecord<T>(file: string, text: string, read: Reader<T>): Result<T, RecordProblem> {
  let fields: unknown;
  try {
    fields = JSON.parse(text);
  } catch {
    return err({ file, kind: 'corrupt', detail: 'is not JSON' });
  }
  if (!isFields(fields) || !isPositiveInteger(fields.format)) return err({ file, kind: 'corrupt', detail: 'has no format version' });
  if (fields.format > RECORD_FORMAT) return err({ file, kind: 'newer-format', detail: `has format ${fields.format}` });
  if (!READABLE_RECORD_FORMATS.includes(fields.format)) return err({ file, kind: 'corrupt', detail: `has unreadable format ${fields.format}` });
  const value = read(fields);
  return value === undefined ? err({ file, kind: 'corrupt', detail: 'has invalid fields' }) : ok(Object.freeze(value));
}

function readIntent(fields: Fields): IntentRecord | undefined {
  const deadline = isFields(fields.deadline) ? fields.deadline : {};
  const command = readCommand(fields.command);
  const account = fields.executionAccount === undefined ? undefined : readAccount(fields.executionAccount);
  const valid = isText(fields.executionId) && isText(fields.attemptId) && isPositiveInteger(fields.ownershipGeneration)
    && isText(fields.launchAuthId) && isText(deadline.bootId) && isCount(deadline.milliseconds)
    && optionalText(fields.namespaceIncarnation) && isText(fields.supervisorVersion) && command !== undefined
    && (fields.executionAccount === undefined || account !== undefined);
  if (!valid) return undefined;
  return {
    executionId: fields.executionId as string,
    attemptId: fields.attemptId as string,
    ownershipGeneration: fields.ownershipGeneration as number,
    launchAuthId: fields.launchAuthId as string,
    deadline: { bootId: deadline.bootId as string, milliseconds: deadline.milliseconds as number },
    ...(fields.namespaceIncarnation === undefined ? {} : { namespaceIncarnation: fields.namespaceIncarnation as string }),
    supervisorVersion: fields.supervisorVersion as string,
    command,
    ...(account === undefined ? {} : { executionAccount: account }),
  };
}

function readLaunch(fields: Fields): LaunchRecord | undefined {
  if (fields.kind === 'claim' && isText(fields.launchAuthId) && fields.supervisor === 1 && optionalText(fields.containment)) {
    return {
      kind: 'claim',
      launchAuthId: fields.launchAuthId,
      supervisor: 1,
      ...(fields.containment === undefined ? {} : { containment: fields.containment as string }),
    };
  }
  const by = fields.by === 'worker' || fields.by === 'supervisor' ? fields.by : undefined;
  const reason = SEAL_REASONS.find((known) => known === fields.reason);
  return fields.kind === 'seal' && by && reason ? { kind: 'seal', by, reason } : undefined;
}

function readHandle(fields: Fields): HandleRecord | undefined {
  const process = readProcess(fields.process);
  if (fields.kind === 'spawned' && process && isPositiveInteger(fields.processGroupId)) {
    return { kind: 'spawned', process, processGroupId: fields.processGroupId };
  }
  return fields.kind === 'spawn-failed' && isText(fields.failure) ? { kind: 'spawn-failed', failure: fields.failure } : undefined;
}

function readExit(fields: Fields): ExitRecord | undefined {
  const status = isFields(fields.status) ? parseExitStatus(fields.status as { kind: string }) : undefined;
  const termination = TERMINATION_EVIDENCE.find((known) => known === fields.termination);
  if (!status?.ok || typeof fields.startProven !== 'boolean' || !termination || !optionalText(fields.spawnFailure)) return undefined;
  return {
    status: status.value,
    startProven: fields.startProven,
    ...(fields.spawnFailure === undefined ? {} : { spawnFailure: fields.spawnFailure as string }),
    termination,
  };
}

const CANCELLATION_STEPS = ['terminate-sent', 'kill-sent', 'containment-killed', 'not-applied'] as const;

function readEvent(fields: Fields): EventEntry | undefined {
  const process = readProcess(fields.process);
  if (fields.kind === 'descendant' && process) return { kind: 'descendant', process };
  const step = CANCELLATION_STEPS.find((known) => known === fields.step);
  if (fields.kind === 'cancellation' && step) return { kind: 'cancellation', step };
  if (fields.kind !== 'survivors' || !Array.isArray(fields.processes)) return undefined;
  const processes = fields.processes.map(readProcess);
  return processes.every((entry) => entry !== undefined) ? { kind: 'survivors', processes: processes as ProcessIdentity[] } : undefined;
}

function readProcess(value: unknown): ProcessIdentity | undefined {
  if (!isFields(value) || !isText(value.bootId) || !isPositiveInteger(value.pid) || !isCount(value.startTime)) return undefined;
  return Object.freeze({ bootId: value.bootId, pid: value.pid, startTime: value.startTime });
}

function readCommand(value: unknown): Command | undefined {
  if (!isFields(value) || !isText(value.executable) || !Array.isArray(value.arguments)) return undefined;
  const args = value.arguments;
  return args.every((argument) => typeof argument === 'string') ? { executable: value.executable, arguments: Object.freeze([...args]) } : undefined;
}

function readAccount(value: unknown): ExecutionAccount | undefined {
  return isFields(value) && isCount(value.uid) && isCount(value.gid) ? { uid: value.uid, gid: value.gid } : undefined;
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function optionalText(value: unknown): boolean {
  return value === undefined || isText(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
