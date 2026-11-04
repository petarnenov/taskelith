import type { MantineColor } from '@mantine/core';
import type { HarnessFailure, Turn, TurnOutcome, TurnState } from './board';

// The words the session screen shows for each turn state and outcome; a
// test keeps every record's keys equal to the OpenAPI enum it labels.

export interface TurnLabel {
  readonly label: string;
  readonly color: MantineColor;
}

// Session turn model: a queued turn is delivered at the next turn boundary.
export const TURN_STATE_LABELS: Readonly<Record<TurnState, TurnLabel>> = {
  queued: { label: 'queued, delivered at the next turn boundary', color: 'gray' },
  delivered: { label: 'delivered', color: 'indigo' },
  ended: { label: 'ended', color: 'teal' },
  'outcome-unknown': { label: 'outcome unknown', color: 'orange' },
  refused: { label: 'refused', color: 'red' },
};

export const TURN_OUTCOME_LABELS: Readonly<Record<TurnOutcome, TurnLabel>> = {
  completed: { label: 'completed', color: 'teal' },
  interrupted: { label: 'interrupted', color: 'orange' },
  'turn-limit-reached': { label: 'turn limit reached', color: 'orange' },
  'account-limit-reached': { label: 'account limit reached', color: 'orange' },
  failed: { label: 'failed', color: 'red' },
};

export const HARNESS_FAILURE_LABELS: Readonly<Record<HarnessFailure, string>> = {
  authentication: 'authentication',
  transport: 'transport',
  'harness-exited': 'the harness exited',
  protocol: 'protocol',
  internal: 'internal',
};

// An ended turn is named by its outcome, and a failed one by its failure.
export function turnStateLabel(turn: Turn): TurnLabel {
  if (turn.state !== 'ended') return TURN_STATE_LABELS[turn.state];
  const outcome = TURN_OUTCOME_LABELS[turn.outcome];
  if (turn.outcome !== 'failed') return outcome;
  return { ...outcome, label: `${outcome.label}: ${HARNESS_FAILURE_LABELS[turn.failure]}` };
}
