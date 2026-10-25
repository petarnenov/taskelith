// A gauge reports the current value; a distribution reports one sample per
// occurrence, which a registry summarizes.
export const SIGNAL_KINDS = Object.freeze(['gauge', 'distribution'] as const);

export type SignalKind = (typeof SIGNAL_KINDS)[number];

export type SignalUnit = 'seconds' | 'count';

export interface SignalDefinition {
  readonly kind: SignalKind;
  readonly unit: SignalUnit;
  readonly description: string;
}

// The architecture section 12 signals that G2 produces; queue depth,
// projection lag, embeddings, and retrieval time come with later items.
export const G2_SIGNALS = Object.freeze({
  'outbox.lag': signal('gauge', 'seconds', 'Age of the oldest unpublished outbox row'),
  'outbox.pending': signal('gauge', 'count', 'Unpublished outbox rows'),
  'inbox.lag': signal('distribution', 'seconds', 'Time from the stream append to the receiver commit'),
  'assignment.age': signal('gauge', 'seconds', 'Age of the oldest assignment offered and not yet accepted'),
  'assignment.offered': signal('gauge', 'count', 'Assignments offered and not yet accepted'),
  'execution.unknown': signal('gauge', 'count', 'Executions not terminal that carry uncertain evidence'),
  'worker.capacity.slots': signal('gauge', 'count', 'Slots of the workers eligible for placement'),
  'worker.capacity.held': signal('gauge', 'count', 'Slots held by reservations'),
  'event-loop.lag': signal('gauge', 'seconds', 'p99 event-loop delay over the last sample window'),
  'database.latency': signal('distribution', 'seconds', 'Duration of one database transaction attempt'),
} as const satisfies Record<string, SignalDefinition>);

export type SignalName = keyof typeof G2_SIGNALS;

export type SignalLabels = Readonly<Record<string, string>>;

export interface Measurement {
  readonly signal: SignalName;
  readonly value: number;
  readonly labels: SignalLabels;
}

export function measurement(name: SignalName, value: number, labels: SignalLabels = {}): Measurement {
  return Object.freeze({ signal: name, value, labels: Object.freeze({ ...labels }) });
}

function signal(kind: SignalKind, unit: SignalUnit, description: string): SignalDefinition {
  return Object.freeze({ kind, unit, description });
}
