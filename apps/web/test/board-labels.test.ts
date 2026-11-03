import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LABELS,
  ADMISSION_STATE_LABELS,
  COLUMN_LABELS,
  COLUMNS,
  END_LABELS,
  EVIDENCE_KIND_LABELS,
  FRESHNESS_LABELS,
  formatInstant,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  OUTCOME_LABELS,
  reasonLabel,
  STAGE_ORIGINS,
  STAGE_STATE_LABELS,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from '../src/board/board-labels';

interface Schema {
  readonly enum?: readonly string[];
  readonly oneOf?: readonly Schema[];
  readonly properties?: Readonly<Record<string, Schema & { readonly const?: string }>>;
}

// Vitest runs in apps/web, two levels below the repository root.
const DOCUMENT = resolve(process.cwd(), '../../packages/contracts/documents/control-plane.openapi.json');
const SCHEMAS: Readonly<Record<string, Schema>> = JSON.parse(readFileSync(DOCUMENT, 'utf8')).components.schemas;

function enumOf(name: string): string[] {
  return [...(SCHEMAS[name]?.enum ?? [])].sort();
}

// SessionActivity is a oneOf of an enum and a const state, and
// AttemptOutcome a oneOf of const kinds.
function oneOfValues(name: string, property: string): string[] {
  const values = (SCHEMAS[name]?.oneOf ?? []).flatMap(({ properties }) => {
    const value = properties?.[property];
    return value?.enum ?? (value?.const === undefined ? [] : [value.const]);
  });
  return values.sort();
}

const keys = (record: object) => Object.keys(record).sort();

describe('the board labels', () => {
  it.each([
    ['BoardColumn', COLUMN_LABELS],
    ['GateState', GATE_LABELS],
    ['StageState', STAGE_STATE_LABELS],
    ['CardWait', WAIT_LABELS],
    ['MergeGateState', MERGE_GATE_LABELS],
    ['TaskEndKind', END_LABELS],
    ['WorkType', WORK_TYPE_LABELS],
    ['EvidenceKind', EVIDENCE_KIND_LABELS],
    ['EvidenceFreshness', FRESHNESS_LABELS],
    ['AdmissionState', ADMISSION_STATE_LABELS],
  ] as const)('label every value of %s in the OpenAPI document and no other', (name, record) => {
    expect(keys(record)).toEqual(enumOf(name));
  });

  it('label every session activity state and every stage origin', () => {
    expect(keys(ACTIVITY_LABELS)).toEqual(oneOfValues('SessionActivity', 'state'));
    expect([...STAGE_ORIGINS].sort()).toEqual(enumOf('StageOrigin'));
  });

  it('label every kind of attempt outcome', () => {
    expect(keys(OUTCOME_LABELS)).toEqual(oneOfValues('AttemptOutcome', 'kind'));
  });

  it('keep the lifecycle order of the columns and their short labels', () => {
    expect(COLUMNS).toEqual(['propose', 'specify', 'implement', 'verify', 'review', 'archived']);
    expect(COLUMNS.map((column) => COLUMN_LABELS[column].label)).toEqual([
      'Propose',
      'Specify',
      'Implement',
      'Verify',
      'Review',
      'Archived',
    ]);
  });

  it('spin only for a working session, and mute a stopped or absent one', () => {
    const tones = Object.fromEntries(Object.entries(ACTIVITY_LABELS).map(([state, { tone }]) => [state, tone]));
    expect(tones).toEqual({
      none: 'muted',
      working: 'spins',
      'waiting-for-person': 'still',
      'waiting-for-admission': 'still',
      stopped: 'muted',
      'worker-unreachable': 'still',
      'process-uncertain': 'danger',
    });
  });

  it('turn a reason identifier into words and an instant into local time', () => {
    expect(reasonLabel('worker-capacity-exhausted')).toBe('worker capacity exhausted');
    const instant = '2026-11-03T09:00:00.000Z';
    expect(formatInstant(instant)).toBe(new Date(instant).toLocaleString());
  });
});
