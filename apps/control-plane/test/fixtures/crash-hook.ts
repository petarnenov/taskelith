import { appendFileSync } from 'node:fs';
import { CRASH_POINT_VARIABLE, crashPointsFromEnvironment } from '@taskelith/testing';

// The file a composed process appends its armed crash point to, just before
// it kills itself, so that the test sees which process died where.
export const CRASH_TRACE_VARIABLE = 'TASKELITH_CRASH_TRACE';
// The file the test-side barriers append the order they established to.
export const ORDER_TRACE_VARIABLE = 'TASKELITH_ORDER_TRACE';
// Set for the D1 windows: see NotStartedHold of the worker composition.
export const HOLD_NOT_STARTED_VARIABLE = 'TASKELITH_HOLD_NOT_STARTED';
// Set for a runtime seal: the first preparation of the process fails.
export const FAIL_FIRST_PREPARE_VARIABLE = 'TASKELITH_FAIL_FIRST_PREPARE';

const points = crashPointsFromEnvironment();
// `W2.after@2` arms the second W2.after; the trace names it as armed.
export const armedPoint = process.env[CRASH_POINT_VARIABLE];
const [armedName, armedOccurrence = '1'] = armedPoint?.split('@') ?? [];
const trace = process.env[CRASH_TRACE_VARIABLE];
const orderTrace = process.env[ORDER_TRACE_VARIABLE];
let armedReached = 0;

// One instance per process, shared by the worker's journal and supervision.
export function reachCrashPoint(point: string): void {
  if (point === armedName) armedReached += 1;
  const crashes = point === armedName && armedReached === Number(armedOccurrence);
  if (crashes && trace !== undefined) appendFileSync(trace, `${armedPoint}\n`);
  points.reach(point);
}

export function noteOrder(step: string): void {
  if (orderTrace !== undefined) appendFileSync(orderTrace, `${step}\n`);
}
