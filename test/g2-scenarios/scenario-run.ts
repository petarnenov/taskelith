import { after } from 'node:test';
import { Toxiproxy, acquireProcessLock, integrationEndpoint, scenarioRecorderFromEnvironment, type ScenarioRecorder } from '@taskelith/testing';
import { killProcessesNaming } from './leftover-processes.ts';
import { ScenarioInstallation, type PostgresRoute } from './scenario-installation.ts';
import { stopRunningWorkers } from './scenario-worker.ts';
import { within } from './waiting.ts';

const recorder: ScenarioRecorder = scenarioRecorderFromEnvironment();
const CLEANUP_STEP_MILLISECONDS = 30_000;
// How long a file may stay alive after its last hook before it is ended.
const EXIT_GRACE_MILLISECONDS = 30_000;
const openInstallations = new Set<ScenarioInstallation>();

// The scenarios compose the Linux process-group supervisor, which reads
// /proc; macOS is covered by the native acceptance (G2 item 25).
export const SCENARIO_HOST = process.platform === 'linux'
  ? {}
  : { skip: 'Linux only: the G2 harness composes the Linux process-group supervisor' };

export interface ScenarioIdentity {
  readonly scenario: string;
  readonly seed: number;
}

// Runs a scenario's body and records its outcome with target
// harness-composition; a failure is recorded, then rethrown.
export async function recordScenario(identity: ScenarioIdentity, body: () => Promise<string | undefined>): Promise<void> {
  let detail: string | undefined;
  try {
    detail = await body();
  } catch (error) {
    await recorder.record({ ...identity, target: 'harness-composition', outcome: 'failed', detail: messageOf(error) });
    throw error;
  }
  await recorder.record({ ...identity, target: 'harness-composition', outcome: 'passed', ...(detail === undefined ? {} : { detail }) });
}

export interface InstallationOptions {
  readonly postgres: PostgresRoute;
  // Healed before the installation closes, if the scenario partitioned it.
  readonly toxiproxy?: Toxiproxy;
}

// A fresh installation per scenario, so no worker of another scenario is
// a placement candidate.
export async function withInstallation<T>(options: InstallationOptions, body: (installation: ScenarioInstallation) => Promise<T>): Promise<T> {
  const installation = await ScenarioInstallation.create('g2', { postgres: options.postgres });
  openInstallations.add(installation);
  return withCleanup(() => body(installation), () => runCleanupSteps([
    ['the Toxiproxy reset', async () => options.toxiproxy?.reset()],
    ['the leftover process kill', async () => { killProcessesNaming(installation.base); }],
    ['the installation close', () => closeInstallation(installation)],
  ]));
}

// A partition scenario waits for the Toxiproxy lock within its timeout.
const PARTITION_LOCK_MILLISECONDS = 240_000;
export const PARTITION_TIMEOUT_MILLISECONDS = PARTITION_LOCK_MILLISECONDS + 90_000;

// Holds the Toxiproxy of the services for one scenario: other test files
// partition it too, so each partition waits its turn.
export async function withPartitions<T>(body: (toxiproxy: Toxiproxy) => Promise<T>): Promise<T> {
  const url = integrationEndpoint('TASKELITH_TOXIPROXY_URL');
  const release = await acquireProcessLock(`toxiproxy-${url.port}`, PARTITION_LOCK_MILLISECONDS);
  const toxiproxy = new Toxiproxy(url);
  return withCleanup(() => body(toxiproxy), () => runCleanupSteps([
    ['the Toxiproxy reset', () => toxiproxy.reset()],
    ['the Toxiproxy lock release', release],
  ]));
}

// After a file's last test, stops what a timed-out scenario left running;
// a file still alive after that is ended, naming what holds it.
export function guardScenarioFile(): void {
  after(async () => {
    await runCleanupSteps([
      ['the leftover workers', stopRunningWorkers],
      ['the leftover installations', () => runCleanupSteps([...openInstallations].map((installation) =>
        [`the close of ${installation.base}`, () => closeInstallation(installation)]))],
    ]).catch((error: unknown) => console.error(`scenario file cleanup failed: ${messageOf(error)}`));
    setTimeout(endHeldProcess, EXIT_GRACE_MILLISECONDS).unref();
  });
}

function endHeldProcess(): void {
  console.error(`scenario file still held after its tests by: ${process.getActiveResourcesInfo().join(', ')}`);
  process.exit(1);
}

async function closeInstallation(installation: ScenarioInstallation): Promise<void> {
  openInstallations.delete(installation);
  await installation.close();
}

type CleanupStep = readonly [name: string, run: () => Promise<void>];

// Runs every step, each within its bound, even after one fails; then
// fails naming each step that failed.
export async function runCleanupSteps(steps: readonly CleanupStep[], stepMilliseconds = CLEANUP_STEP_MILLISECONDS): Promise<void> {
  const failures: string[] = [];
  for (const [name, run] of steps) {
    await within(Promise.resolve().then(run), stepMilliseconds, name)
      .catch((error: unknown) => { failures.push(`${name}: ${messageOf(error)}`); });
  }
  if (failures.length > 0) throw new Error(`cleanup failed: ${failures.join('; ')}`);
}

// Runs the cleanup after the body; a cleanup failure is logged and does not
// replace the body's own failure, which is what the scenario reports.
async function withCleanup<T>(body: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let value: T;
  try {
    value = await body();
  } catch (error) {
    await cleanup().catch((cleanupError: unknown) => console.error(`scenario cleanup failed: ${messageOf(cleanupError)}`));
    throw error;
  }
  await cleanup();
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
