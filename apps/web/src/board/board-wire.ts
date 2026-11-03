import type { Board, BoardCard, CardChange, Project, WorkersChange } from './board';
import {
  ACTIVITY_LABELS,
  COLUMN_LABELS,
  END_LABELS,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  STAGE_ORIGINS,
  STAGE_STATE_LABELS,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from './board-labels';

// The typed fetch does not check bodies, so each answer is checked for the
// fields the board shows; anything else reads as an unreachable plane.

type Fields = Record<string, unknown>;

const POSITION = /^(0|[1-9][0-9]{0,15})$/;

export function projectPageOf(body: unknown): { readonly projects: Project[]; readonly next?: string } | undefined {
  if (!isRecord(body) || !Array.isArray(body.projects)) return undefined;
  if (body.next !== undefined && !isText(body.next)) return undefined;
  if (!body.projects.every(isProject)) return undefined;
  const projects = body.projects.map(({ projectId, name }) => ({ projectId, name }));
  return body.next === undefined ? { projects } : { projects, next: body.next };
}

export function boardOf(body: unknown): Board | undefined {
  if (!isRecord(body) || !isInstant(body.asOf) || !isPosition(body.position)) return undefined;
  if (!isText(body.projectId) || !isCount(body.workersOnline) || typeof body.callerMayAct !== 'boolean') return undefined;
  if (!Array.isArray(body.cards) || !body.cards.every(isBoardCard)) return undefined;
  return body as unknown as Board;
}

export function cardChangeOf(data: unknown): CardChange | undefined {
  if (!isRecord(data) || data.type !== 'card-changed' || !isStamped(data) || !isBoardCard(data.card)) return undefined;
  return { kind: 'card-changed', position: data.position as string, occurredAt: data.occurredAt as string, card: data.card };
}

export function workersChangeOf(data: unknown): WorkersChange | undefined {
  if (!isRecord(data) || data.type !== 'board-changed' || !isStamped(data) || !isCount(data.workersOnline)) {
    return undefined;
  }
  const { position, occurredAt, workersOnline } = data as { position: string; occurredAt: string; workersOnline: number };
  return { kind: 'board-changed', position, occurredAt, workersOnline };
}

export function failureReason(body: unknown): unknown {
  return isRecord(body) && isRecord(body.details) ? body.details.reason : undefined;
}

function isBoardCard(value: unknown): value is BoardCard {
  if (!isRecord(value) || !isText(value.runId) || !isText(value.title) || !isCount(value.needsYou)) return false;
  if (!isKey(WORK_TYPE_LABELS, value.workType) || !isKey(COLUMN_LABELS, value.column)) return false;
  if (!isKey(MERGE_GATE_LABELS, value.integration) || !isFramework(value.framework)) return false;
  if (!isStage(value.stage) || !isActivity(value.session)) return false;
  if (value.gate !== undefined && !isKey(GATE_LABELS, value.gate)) return false;
  if (value.waitingFor !== undefined && !isKey(WAIT_LABELS, value.waitingFor)) return false;
  if (value.obstacle !== undefined && !isObstacle(value.obstacle)) return false;
  return value.end === undefined || (isRecord(value.end) && isKey(END_LABELS, value.end.kind));
}

function isProject(value: unknown): value is Project {
  return isRecord(value) && isText(value.projectId) && isText(value.name);
}

function isFramework(value: unknown): boolean {
  return isRecord(value) && isText(value.pluginId) && isText(value.pluginVersion);
}

function isStage(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.stageId)) return false;
  return STAGE_ORIGINS.includes(value.origin as never) && isKey(STAGE_STATE_LABELS, value.state);
}

function isActivity(value: unknown): boolean {
  if (!isRecord(value) || !isKey(ACTIVITY_LABELS, value.state)) return false;
  return value.state !== 'worker-unreachable' || isInstant(value.lastContactAt);
}

function isObstacle(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.reason) || !isText(value.source)) return false;
  if (value.disposition !== 'waiting' && value.disposition !== 'rejected') return false;
  return isInstant(value.observedAt) && (value.retryNumber === undefined || isCount(value.retryNumber));
}

function isStamped(value: Fields): boolean {
  return isPosition(value.position) && isInstant(value.occurredAt);
}

function isKey(record: object, value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(record, value);
}

function isPosition(value: unknown): value is string {
  return typeof value === 'string' && POSITION.test(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}
