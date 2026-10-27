import { runSupervisorProgram } from '@taskelith/worker-supervisor';
import { reachCrashPoint } from './crash-hook.ts';

// The real supervisor program of a composed worker's launches, with its
// crash points CP5 to CP11 wired to the armed crash point.
await runSupervisorProgram(process.argv.slice(2), {
  crashPoint: reachCrashPoint,
  timing: { pollMilliseconds: 50, graceMilliseconds: 200, retryMilliseconds: 50, unreadablePolls: 20 },
});
