import { SeededRandom } from '@taskelith/testing';
import { interceptAck } from '../ack-interception.ts';
import { ScenarioWorker, type ScriptedRun } from '../scenario-worker.ts';

// A scenario worker in its own process, killed by SIGKILL when it would
// acknowledge a command of the armed type: after W1, before the ack.
export interface CrashingWorkerArguments {
  readonly apiUrl: string;
  // The installation CA file, whose fingerprint the worker enrolls with.
  readonly installationCa: string;
  readonly base: string;
  readonly nats: string;
  readonly name: string;
  readonly seed: number;
  readonly enrollmentToken: string;
  readonly runMilliseconds: ScriptedRun;
  readonly commandType: string;
}

const parsed = JSON.parse(process.argv[2]!) as CrashingWorkerArguments;
const crash = () => process.kill(process.pid, 'SIGKILL');
const worker = new ScenarioWorker({ apiUrl: new URL(parsed.apiUrl), installationCa: parsed.installationCa, base: parsed.base }, {
  name: parsed.name, random: new SeededRandom(parsed.seed), nats: new URL(parsed.nats),
  runMilliseconds: parsed.runMilliseconds, enrollmentToken: parsed.enrollmentToken,
  transport: (transport) => interceptAck(transport, parsed.commandType, crash),
});
const running = await worker.start();
process.stdout.write(`${JSON.stringify({ workerId: running.identity.workerId })}\n`);
await running.stopped;
