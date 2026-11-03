import type { MantineColor } from '@mantine/core';
import type {
  BoardColumn,
  CardWait,
  GateState,
  MergeGateState,
  SessionActivityState,
  StageOrigin,
  StageState,
  TaskEndKind,
  WorkType,
} from './board';

// The words the board shows for each value of the control plane's views;
// a test keeps every record's keys equal to the OpenAPI enum it labels.

export interface ColumnLabel {
  readonly label: string;
  readonly stage: string;
}

// Product ports section 3.1: the lifecycle stages under short labels.
export const COLUMN_LABELS: Readonly<Record<BoardColumn, ColumnLabel>> = {
  propose: { label: 'Propose', stage: 'Propose and inspect' },
  specify: { label: 'Specify', stage: 'Specify and design' },
  implement: { label: 'Implement', stage: 'Implement' },
  verify: { label: 'Verify', stage: 'Verify' },
  review: { label: 'Review', stage: 'Review' },
  archived: { label: 'Archived', stage: 'Close' },
};

export const COLUMNS = Object.keys(COLUMN_LABELS) as readonly BoardColumn[];

export interface GateLabel {
  readonly label: string;
  readonly color: MantineColor;
}

export const GATE_LABELS: Readonly<Record<GateState, GateLabel>> = {
  pending: { label: 'pending', color: 'gray' },
  passed: { label: 'passed', color: 'teal' },
  failed: { label: 'failed', color: 'red' },
  stale: { label: 'stale', color: 'orange' },
  blocked: { label: 'blocked', color: 'orange' },
};

export const STAGE_ORIGINS: readonly StageOrigin[] = ['native', 'platform-managed'];

export const STAGE_STATE_LABELS: Readonly<Record<StageState, string>> = {
  'not-started': 'not started',
  'in-progress': 'in progress',
  completed: 'completed',
};

export const WAIT_LABELS: Readonly<Record<CardWait, string>> = {
  person: 'a person',
  'stage-admission': 'its stage admission',
  reviewer: 'a reviewer',
  capacity: 'capacity',
  'merge-queue': 'the merge queue',
};

export const MERGE_GATE_LABELS: Readonly<Record<MergeGateState, string>> = {
  'not-ready': 'not ready',
  ready: 'ready, auto-merge queues it',
  'awaiting-manual-merge': 'awaiting a manual merge',
  withdrawn: 'withdrawn',
  queued: 'queued',
  merging: 'merging',
  'resolving-conflict': 'resolving a conflict',
  'returned-to-specify': 'returned to Specify',
  escalated: 'escalated to a maintainer',
  integrated: 'integrated',
};

export const END_LABELS: Readonly<Record<TaskEndKind, string>> = {
  cancelled: 'cancelled',
  rejected: 'rejected',
  'retries-exhausted': 'retries exhausted',
  'uncertain-exit': 'uncertain exit',
};

export const WORK_TYPE_LABELS: Readonly<Record<WorkType, string>> = {
  feature: 'Feature',
  bug: 'Bug',
  improvement: 'Improvement',
  documentation: 'Documentation',
  maintenance: 'Maintenance',
  emergency: 'Emergency',
};

// spins: the indicator spins; muted and danger: still, gray or red.
export type IndicatorTone = 'spins' | 'still' | 'muted' | 'danger';

export interface ActivityLabel {
  readonly label: string;
  readonly tone: IndicatorTone;
}

// Product ports section 3.6 and the "Session activity indicator" rule.
export const ACTIVITY_LABELS: Readonly<Record<SessionActivityState, ActivityLabel>> = {
  none: { label: 'No session', tone: 'muted' },
  working: { label: 'Session working', tone: 'spins' },
  'waiting-for-person': { label: 'Waiting for a person', tone: 'still' },
  'waiting-for-admission': { label: 'Waiting for its next stage admission', tone: 'still' },
  stopped: { label: 'Session stopped', tone: 'muted' },
  'worker-unreachable': { label: 'Worker unreachable', tone: 'still' },
  'process-uncertain': { label: 'Process state uncertain', tone: 'danger' },
};

// An obstacle reason as words: its identifier without the hyphens.
export function reasonLabel(reason: string): string {
  return reason.replaceAll('-', ' ');
}

// A control-plane instant in the browser's locale and time zone.
export function formatInstant(instant: string): string {
  return new Date(instant).toLocaleString();
}
