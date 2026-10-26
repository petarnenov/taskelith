import { appendFileSync } from 'node:fs';
import { CRASH_POINT_VARIABLE, crashPointsFromEnvironment } from '@taskelith/testing';

// The file a composed process appends its armed crash point to, just before
// it kills itself, so that the test sees which process died where.
export const CRASH_TRACE_VARIABLE = 'TASKELITH_CRASH_TRACE';

const points = crashPointsFromEnvironment();
const armed = process.env[CRASH_POINT_VARIABLE];
const trace = process.env[CRASH_TRACE_VARIABLE];

// One instance per process, shared by the worker's journal and supervision.
export function reachCrashPoint(point: string): void {
  if (point === armed && trace !== undefined) appendFileSync(trace, `${point}\n`);
  points.reach(point);
}
