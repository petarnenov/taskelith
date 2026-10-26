import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  ACCOUNT_SIGNALS,
  CLASSIFIED_OPERATION_KINDS,
  HARNESS_CAPABILITIES,
  HARNESS_FAILURES,
  HARNESS_PLATFORMS,
  MAX_HARNESS_TEXT_LENGTH,
  REQUIRED_HARNESS_CAPABILITIES,
  SESSION_END_REASONS,
  SUBSCRIPTION_MECHANISMS,
  TURN_OUTCOMES,
  type AccountSignal,
  type ClassifiedOperationKind,
  type HarnessCapability,
  type HarnessFailure,
  type HarnessPlatform,
  type SessionEndReason,
  type SubscriptionMechanism,
  type TurnOutcome,
} from './agent-harness.js';

// The module's parsers of plugin data, apart from the port types. Each reads
// own data properties only, so a getter or a proxy cannot run plugin code.

export interface PinnedBinary {
  readonly platform: HarnessPlatform;
  readonly version: string;
  readonly sha256: string;
}

export interface ParsedAgentHarnessCapabilities {
  readonly supported: readonly HarnessCapability[];
  readonly subscriptionMechanisms: readonly SubscriptionMechanism[];
  readonly accountSignals: readonly AccountSignal[];
  readonly binaries: readonly PinnedBinary[];
}

export interface ClassifiedOperation {
  readonly kind: ClassifiedOperationKind;
  readonly ref: string;
}

export type HarnessRequestKind = 'permission-request' | 'input-request' | 'delegation-request';

export type HarnessEvent =
  | { readonly kind: 'output'; readonly turnId: string; readonly text: string }
  | {
    readonly kind: 'permission-request';
    readonly turnId: string;
    readonly nativeRequestId: string;
    readonly summary: string;
    readonly operation?: ClassifiedOperation;
  }
  | { readonly kind: 'input-request'; readonly turnId: string; readonly nativeRequestId: string; readonly prompt: string }
  | { readonly kind: 'delegation-request'; readonly turnId: string; readonly nativeRequestId: string; readonly instructions: string }
  | { readonly kind: 'account-signal'; readonly signal: 'usage'; readonly usage: number }
  | { readonly kind: 'account-signal'; readonly signal: 'limit'; readonly resetsAt?: string }
  | { readonly kind: 'turn-ended'; readonly turnId: string; readonly outcome: TurnOutcome; readonly failure?: HarnessFailure }
  | { readonly kind: 'session-ended'; readonly reason: SessionEndReason; readonly exitCode?: number; readonly signal?: string };

type Fields = Readonly<Record<string, unknown>>;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_LABEL_LENGTH = 128;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function parseAgentHarnessCapabilities(raw: unknown): Result<ParsedAgentHarnessCapabilities> {
  return guarded('capabilities', () => {
    const fields = readFields('capabilities', raw, ['supported', 'subscriptionMechanisms', 'accountSignals', 'binaries']);
    if (!fields.ok) return fields;
    const supported = readValues('capabilities.supported', fields.value.supported, HARNESS_CAPABILITIES);
    if (!supported.ok) return supported;
    const missing = REQUIRED_HARNESS_CAPABILITIES.filter((required) => !supported.value.includes(required));
    if (missing.length > 0) return invalid('capabilities.supported', `must include ${missing.join(', ')}`);
    const mechanisms = readValues('capabilities.subscriptionMechanisms', fields.value.subscriptionMechanisms, SUBSCRIPTION_MECHANISMS);
    if (!mechanisms.ok) return mechanisms;
    if (mechanisms.value.length === 0) return invalid('capabilities.subscriptionMechanisms', 'must name a mechanism');
    const signals = readValues('capabilities.accountSignals', fields.value.accountSignals, ACCOUNT_SIGNALS);
    if (!signals.ok) return signals;
    if (signals.value.includes('reset-time') && !signals.value.includes('limit')) {
      return invalid('capabilities.accountSignals', 'reset-time needs limit');
    }
    const binaries = readBinaries(fields.value.binaries);
    if (!binaries.ok) return binaries;
    return ok(Object.freeze({
      supported: supported.value,
      subscriptionMechanisms: mechanisms.value,
      accountSignals: signals.value,
      binaries: binaries.value,
    }));
  });
}

// An event names only declared capabilities and signals; the order of
// events within a session is the host's check, not the parser's.
export function parseHarnessEvent(raw: unknown, capabilities: ParsedAgentHarnessCapabilities): Result<HarnessEvent> {
  return guarded('event', () => {
    const kind = readFields('event', raw, ['kind'], OPTIONAL_EVENT_FIELDS);
    if (!kind.ok) return kind;
    switch (kind.value.kind) {
      case 'output': return parseOutput(raw);
      case 'permission-request': return parseRequest(raw, 'permission-request', 'summary', capabilities);
      case 'input-request': return parseRequest(raw, 'input-request', 'prompt', capabilities);
      case 'delegation-request': return parseRequest(raw, 'delegation-request', 'instructions', capabilities);
      case 'account-signal': return parseAccountSignal(raw, capabilities);
      case 'turn-ended': return parseTurnEnded(raw);
      case 'session-ended': return parseSessionEnded(raw);
      default: return invalid('event.kind', 'is not an event kind');
    }
  });
}

export function capabilityOfRequest(kind: HarnessRequestKind): HarnessCapability {
  return REQUEST_CAPABILITY[kind];
}

const REQUEST_CAPABILITY: Readonly<Record<HarnessRequestKind, HarnessCapability>> = Object.freeze({
  'permission-request': 'permission-requests',
  'input-request': 'input-requests',
  'delegation-request': 'delegation',
});

const OPTIONAL_EVENT_FIELDS = [
  'turnId', 'text', 'nativeRequestId', 'summary', 'operation', 'prompt', 'instructions',
  'signal', 'usage', 'resetsAt', 'outcome', 'failure', 'reason', 'exitCode',
];

function parseOutput(raw: unknown): Result<HarnessEvent> {
  const fields = readFields('event', raw, ['kind', 'turnId', 'text']);
  if (!fields.ok) return fields;
  const turnId = readLabel('event.turnId', fields.value.turnId);
  const text = readText('event.text', fields.value.text);
  if (!turnId.ok) return turnId;
  if (!text.ok) return text;
  return ok(Object.freeze({ kind: 'output', turnId: turnId.value, text: text.value }));
}

function parseRequest(
  raw: unknown,
  kind: HarnessRequestKind,
  textField: 'summary' | 'prompt' | 'instructions',
  capabilities: ParsedAgentHarnessCapabilities,
): Result<HarnessEvent> {
  if (!capabilities.supported.includes(REQUEST_CAPABILITY[kind])) return invalid('event.kind', `${kind} is not declared`);
  const optional = kind === 'permission-request' ? ['operation'] : [];
  const fields = readFields('event', raw, ['kind', 'turnId', 'nativeRequestId', textField], optional);
  if (!fields.ok) return fields;
  const turnId = readLabel('event.turnId', fields.value.turnId);
  if (!turnId.ok) return turnId;
  const nativeRequestId = readLabel('event.nativeRequestId', fields.value.nativeRequestId);
  if (!nativeRequestId.ok) return nativeRequestId;
  const text = readText(`event.${textField}`, fields.value[textField]);
  if (!text.ok) return text;
  const base = { kind, turnId: turnId.value, nativeRequestId: nativeRequestId.value, [textField]: text.value };
  if (fields.value.operation === undefined) return ok(Object.freeze(base) as HarnessEvent);
  const operation = readOperation(fields.value.operation);
  return operation.ok ? ok(Object.freeze({ ...base, operation: operation.value }) as HarnessEvent) : operation;
}

function readOperation(raw: unknown): Result<ClassifiedOperation> {
  const fields = readFields('event.operation', raw, ['kind', 'ref']);
  if (!fields.ok) return fields;
  const kind = readValue('event.operation.kind', fields.value.kind, CLASSIFIED_OPERATION_KINDS);
  if (!kind.ok) return kind;
  const ref = readLabel('event.operation.ref', fields.value.ref);
  if (!ref.ok) return ref;
  if (!ref.value.startsWith('refs/heads/')) return invalid('event.operation.ref', 'must be a full branch ref');
  return ok(Object.freeze({ kind: kind.value, ref: ref.value }));
}

function parseAccountSignal(raw: unknown, capabilities: ParsedAgentHarnessCapabilities): Result<HarnessEvent> {
  const signal = readFields('event', raw, ['kind', 'signal'], ['usage', 'resetsAt']);
  if (!signal.ok) return signal;
  if (signal.value.signal === 'usage') return parseUsage(raw, capabilities);
  if (signal.value.signal === 'limit') return parseLimit(raw, capabilities);
  return invalid('event.signal', 'must be usage or limit');
}

function parseUsage(raw: unknown, capabilities: ParsedAgentHarnessCapabilities): Result<HarnessEvent> {
  if (!capabilities.accountSignals.includes('usage')) return invalid('event.signal', 'usage is not declared');
  const fields = readFields('event', raw, ['kind', 'signal', 'usage']);
  if (!fields.ok) return fields;
  const usage = fields.value.usage;
  if (typeof usage !== 'number' || !(usage >= 0 && usage <= 1)) return invalid('event.usage', 'must be a fraction from 0 to 1');
  return ok(Object.freeze({ kind: 'account-signal', signal: 'usage', usage }));
}

function parseLimit(raw: unknown, capabilities: ParsedAgentHarnessCapabilities): Result<HarnessEvent> {
  if (!capabilities.accountSignals.includes('limit')) return invalid('event.signal', 'limit is not declared');
  const fields = readFields('event', raw, ['kind', 'signal'], ['resetsAt']);
  if (!fields.ok) return fields;
  const resetsAt = fields.value.resetsAt;
  if (resetsAt === undefined) return ok(Object.freeze({ kind: 'account-signal', signal: 'limit' }));
  if (!capabilities.accountSignals.includes('reset-time')) return invalid('event.resetsAt', 'reset-time is not declared');
  if (typeof resetsAt !== 'string' || !ISO_INSTANT.test(resetsAt) || Number.isNaN(Date.parse(resetsAt))) {
    return invalid('event.resetsAt', 'must be an ISO 8601 UTC instant');
  }
  return ok(Object.freeze({ kind: 'account-signal', signal: 'limit', resetsAt }));
}

function parseTurnEnded(raw: unknown): Result<HarnessEvent> {
  const fields = readFields('event', raw, ['kind', 'turnId', 'outcome'], ['failure']);
  if (!fields.ok) return fields;
  const turnId = readLabel('event.turnId', fields.value.turnId);
  if (!turnId.ok) return turnId;
  const outcome = readValue('event.outcome', fields.value.outcome, TURN_OUTCOMES);
  if (!outcome.ok) return outcome;
  const base = { kind: 'turn-ended', turnId: turnId.value, outcome: outcome.value } as const;
  if (outcome.value !== 'failed') {
    return fields.value.failure === undefined ? ok(Object.freeze(base)) : invalid('event.failure', 'only a failed turn has one');
  }
  const reason = readValue('event.failure', fields.value.failure, HARNESS_FAILURES);
  return reason.ok ? ok(Object.freeze({ ...base, failure: reason.value })) : reason;
}

function parseSessionEnded(raw: unknown): Result<HarnessEvent> {
  const fields = readFields('event', raw, ['kind', 'reason'], ['exitCode', 'signal']);
  if (!fields.ok) return fields;
  const reason = readValue('event.reason', fields.value.reason, SESSION_END_REASONS);
  if (!reason.ok) return reason;
  const { exitCode, signal } = fields.value;
  if (exitCode !== undefined && !(Number.isInteger(exitCode) && (exitCode as number) >= 0 && (exitCode as number) <= 255)) {
    return invalid('event.exitCode', 'must be an integer from 0 to 255');
  }
  if (signal !== undefined && !(typeof signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(signal))) {
    return invalid('event.signal', 'must be a signal name');
  }
  return ok(Object.freeze({
    kind: 'session-ended',
    reason: reason.value,
    ...(exitCode === undefined ? {} : { exitCode: exitCode as number }),
    ...(signal === undefined ? {} : { signal: signal as string }),
  }));
}

function readBinaries(raw: unknown): Result<readonly PinnedBinary[]> {
  const items = readArray('capabilities.binaries', raw);
  if (!items.ok) return items;
  if (items.value.length === 0) return invalid('capabilities.binaries', 'must pin a binary');
  const binaries: PinnedBinary[] = [];
  for (const [index, item] of items.value.entries()) {
    const path = `capabilities.binaries[${index}]`;
    const fields = readFields(path, item, ['platform', 'version', 'sha256']);
    if (!fields.ok) return fields;
    const platform = readValue(`${path}.platform`, fields.value.platform, HARNESS_PLATFORMS);
    if (!platform.ok) return platform;
    if (binaries.some((binary) => binary.platform === platform.value)) return invalid(`${path}.platform`, 'is pinned twice');
    const version = readLabel(`${path}.version`, fields.value.version);
    if (!version.ok) return version;
    const { sha256 } = fields.value;
    if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return invalid(`${path}.sha256`, 'must be 64 lowercase hex digits');
    binaries.push(Object.freeze({ platform: platform.value, version: version.value, sha256 }));
  }
  return ok(Object.freeze(binaries));
}

function readValues<Value extends string>(path: string, raw: unknown, allowed: readonly Value[]): Result<readonly Value[]> {
  const items = readArray(path, raw);
  if (!items.ok) return items;
  const values: Value[] = [];
  for (const [index, item] of items.value.entries()) {
    const value = readValue(`${path}[${index}]`, item, allowed);
    if (!value.ok) return value;
    if (values.includes(value.value)) return invalid(path, `${value.value} is listed twice`);
    values.push(value.value);
  }
  return ok(Object.freeze(values));
}

function readValue<Value extends string>(path: string, raw: unknown, allowed: readonly Value[]): Result<Value> {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? ok(raw as Value)
    : invalid(path, `must be one of ${allowed.join(', ')}`);
}

function readLabel(path: string, raw: unknown): Result<string> {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_LABEL_LENGTH
    ? ok(raw)
    : invalid(path, `must be a string of 1-${MAX_LABEL_LENGTH} characters`);
}

function readText(path: string, raw: unknown): Result<string> {
  return typeof raw === 'string' && raw.length <= MAX_HARNESS_TEXT_LENGTH
    ? ok(raw)
    : invalid(path, `must be a string of at most ${MAX_HARNESS_TEXT_LENGTH} characters`);
}

function readArray(path: string, raw: unknown): Result<readonly unknown[]> {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) return invalid(path, 'must be a plain array');
  const items: unknown[] = [];
  for (const key of Reflect.ownKeys(raw)) {
    if (key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
    if (typeof key !== 'string' || String(items.length) !== key || !('value' in descriptor)) {
      return invalid(path, 'must hold only data elements');
    }
    items.push(descriptor.value);
  }
  return items.length === raw.length ? ok(items) : invalid(path, 'must have no holes');
}

// Exactly the named fields, as own data properties of a plain object.
function readFields(path: string, raw: unknown, required: readonly string[], optional: readonly string[] = []): Result<Fields> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return invalid(path, 'must be an object');
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) return invalid(path, 'must be a plain object');
  const fields: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string' || !(required.includes(key) || optional.includes(key))) {
      return invalid(path, `${String(key)} is not a defined field`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
    if (!('value' in descriptor)) return invalid(`${path}.${key}`, 'must be a data property');
    fields[key] = descriptor.value;
  }
  const missing = required.find((key) => !Object.hasOwn(fields, key));
  return missing === undefined ? ok(fields) : invalid(`${path}.${missing}`, 'is missing');
}

function guarded<Value>(path: string, parse: () => Result<Value>): Result<Value> {
  try {
    return parse();
  } catch {
    return invalid(path, 'could not be read');
  }
}

function invalid(field: string, message: string): Result<never> {
  return err(failure('invalid', `${field} ${message}`, { field }));
}
