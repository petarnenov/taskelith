import { writeSync } from 'node:fs';
import { crashPointsFromEnvironment } from '@taskelith/testing';
import { runSupervisorProgram } from '@taskelith/worker-supervisor';

// A supervisor process for real-process tests: the real program, with the
// crash point that TASKELITH_CRASH_POINT arms killing it.
const points = crashPointsFromEnvironment();
const outcome = await runSupervisorProgram(process.argv.slice(2), {
  crashPoint: (point) => points.reach(point),
  timing: { pollMilliseconds: 50, graceMilliseconds: 200, retryMilliseconds: 50, unreadablePolls: 20 },
});
writeSync(1, `${JSON.stringify(outcome)}\n`);
