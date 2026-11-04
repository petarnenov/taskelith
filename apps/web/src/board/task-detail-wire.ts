import type { TaskDetail } from './board';
import {
  ADMISSION_STATE_LABELS,
  COLUMN_LABELS,
  END_LABELS,
  EVIDENCE_KIND_LABELS,
  FRESHNESS_LABELS,
  GATE_LABELS,
  OUTCOME_LABELS,
  STAGE_ORIGINS,
  STAGE_STATE_LABELS,
} from './board-labels';
import { isActivity, isBoardCard, isCount, isInstant, isKey, isObstacle, isPosition, isRecord, isText } from './board-wire';

// readTaskDetail's answer, checked for every field the task detail shows;
// anything else reads as an unreachable plane, as for the board.

const BINDING_FIELDS = [
  'pluginId',
  'pluginVersion',
  'upstreamToolVersion',
  'workflowId',
  'workflowVersion',
  'workflowDigest',
  'configurationRevision',
  'policyRevision',
] as const;

const MAX_DELEGATION_DEPTH = 3;

export function taskDetailOf(body: unknown): TaskDetail | undefined {
  if (!isRecord(body) || !isInstant(body.asOf) || !isPosition(body.position) || !isBoardCard(body.card)) {
    return undefined;
  }
  if (!isListOf(body.stages, isStageView) || !isListOf(body.traceability, isTraceLink)) return undefined;
  if (!isRunBinding(body.runBinding) || !isListOf(body.tasks, isTaskView)) return undefined;
  return body as unknown as TaskDetail;
}

function isStageView(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.stageId) || !STAGE_ORIGINS.includes(value.origin as never)) return false;
  if (!isKey(STAGE_STATE_LABELS, value.state) || !isKey(COLUMN_LABELS, value.column)) return false;
  return isListOf(value.gates, isGateView);
}

function isGateView(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.gateId) || !isKey(GATE_LABELS, value.state)) return false;
  if (!isKey(EVIDENCE_KIND_LABELS, value.requiredEvidence)) return false;
  return value.blockReason === undefined || isText(value.blockReason);
}

function isTraceLink(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.requirement) || !isKey(FRESHNESS_LABELS, value.evidence)) return false;
  return isListOf(value.workItemIds, isText) && isListOf(value.attemptIds, isText);
}

function isRunBinding(value: unknown): boolean {
  return isRecord(value) && BINDING_FIELDS.every((field) => isText(value[field]));
}

function isTaskView(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.taskId) || !isText(value.taskRunId)) return false;
  if (!isGeneration(value.ownershipGeneration) || !isAdmission(value.admission) || !isActivity(value.session)) {
    return false;
  }
  if (value.delegation !== undefined && !isDelegation(value.delegation)) return false;
  if (value.obstacle !== undefined && !isObstacle(value.obstacle)) return false;
  return value.end === undefined || isTaskEnd(value.end);
}

function isAdmission(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.admissionId) || !isText(value.stageId)) return false;
  if (!isKey(ADMISSION_STATE_LABELS, value.state) || !isText(value.policyRevision)) return false;
  if (value.workItemId !== undefined && !isText(value.workItemId)) return false;
  return value.dispatchedGeneration === undefined || isGeneration(value.dispatchedGeneration);
}

function isDelegation(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.parentTaskId) || !isCount(value.depth)) return false;
  return value.depth >= 1 && value.depth <= MAX_DELEGATION_DEPTH;
}

function isTaskEnd(value: unknown): boolean {
  if (!isRecord(value) || !isKey(END_LABELS, value.kind) || !isText(value.attemptId)) return false;
  return isOutcome(value.outcome);
}

function isOutcome(value: unknown): boolean {
  if (!isRecord(value) || !isKey(OUTCOME_LABELS, value.kind) || !isInstant(value.endedAt)) return false;
  if (value.kind === 'exited') return isExitStatus(value.status);
  return value.kind !== 'operator-resolved' || isText(value.evidence);
}

function isExitStatus(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'code') return isCount(value.code);
  if (value.kind === 'signal') return isText(value.signal);
  return value.kind === 'unknown';
}

function isGeneration(value: unknown): boolean {
  return isCount(value) && value >= 1;
}

function isListOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(isItem);
}
