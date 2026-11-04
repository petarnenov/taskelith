import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HARNESS_FAILURE_LABELS,
  TURN_OUTCOME_LABELS,
  TURN_STATE_LABELS,
  turnStateLabel,
} from '../src/agent-session/session-labels';
import { turn } from './fakes';

interface Schema {
  readonly enum?: readonly string[];
}

// Vitest runs in apps/web, two levels below the repository root.
const DOCUMENT = resolve(process.cwd(), '../../packages/contracts/documents/control-plane.openapi.json');
const SCHEMAS: Readonly<Record<string, Schema>> = JSON.parse(readFileSync(DOCUMENT, 'utf8')).components.schemas;

const enumOf = (name: string) => [...(SCHEMAS[name]?.enum ?? [])].sort();
const keys = (record: object) => Object.keys(record).sort();

describe('the session labels', () => {
  it.each([
    ['TurnState', TURN_STATE_LABELS],
    ['TurnOutcome', TURN_OUTCOME_LABELS],
    ['HarnessFailure', HARNESS_FAILURE_LABELS],
  ])('label every value of %s and no other', (schema, labels) => {
    expect(keys(labels)).toEqual(enumOf(schema));
    expect(enumOf(schema).length).toBeGreaterThan(0);
  });

  it('names a queued turn as delivered at the next turn boundary, and an ended one by its outcome', () => {
    expect(turnStateLabel(turn({ state: 'queued' })).label).toBe('queued, delivered at the next turn boundary');
    expect(turnStateLabel(turn({ state: 'delivered', generation: 2 }))).toEqual({ label: 'delivered', color: 'indigo' });
    expect(turnStateLabel(turn({ state: 'ended', generation: 1, outcome: 'interrupted' })).label).toBe('interrupted');
  });

  it('names a failed turn by its harness failure', () => {
    const failed = turn({ state: 'ended', generation: 1, outcome: 'failed', failure: 'harness-exited' });
    expect(turnStateLabel(failed)).toEqual({ label: 'failed: the harness exited', color: 'red' });
  });
});
