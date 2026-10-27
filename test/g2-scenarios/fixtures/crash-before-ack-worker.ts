import { SeededRandom } from '@taskelith/testing';
import { interceptAck } from '../ack-interception.ts';
import { HELD_RUN, ScenarioWorker } from '../scenario-worker.ts';

// A scenario worker in its own process, killed by SIGKILL when it would
// acknowledge a command of the armed type: after W1, before the ack.
export interface CrashingWorkerArguments {
  readonly apiUrl: string;
  readonly base: string;
  readonly nats: string;
  readonly name: string;
  readonly seed: number;
  readonly enrollmentToken: string;
  // JSON writes `HELD_RUN` (Infinity) as null.
  readonly runMilliseconds: number | null;
  readonly commandType: string;
}

const parsed = JSON.parse(process.argv[2]!) as CrashingWorkerArguments;
const crash = () => process.kill(process.pid, 'SIGKILL');
const worker = new ScenarioWorker({ apiUrl: new URL(parsed.apiUrl), base: parsed.base }, {
  name: parsed.name, random: new SeededRandom(parsed.seed), nats: new URL(parsed.nats),
  runMilliseconds: parsed.runMilliseconds ?? HELD_RUN, enrollmentToken: parsed.enrollmentToken,
  transport: (transport) => interceptAck(transport, parsed.commandType, crash),
});
const running = await worker.start();
process.stdout.write(`${JSON.stringify({ workerId: running.identity.workerId })}\n`);
await running.stopped;
