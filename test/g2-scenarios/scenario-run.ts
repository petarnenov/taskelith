import { Toxiproxy, acquireProcessLock, integrationEndpoint, scenarioRecorderFromEnvironment, type ScenarioRecorder } from '@taskelith/testing';
import { killProcessesNaming } from './leftover-processes.ts';
import { ScenarioInstallation, type PostgresRoute } from './scenario-installation.ts';

const recorder: ScenarioRecorder = scenarioRecorderFromEnvironment();

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
  return withCleanup(() => body(installation), async () => {
    await options.toxiproxy?.reset();
    killProcessesNaming(installation.base);
    await installation.close();
  });
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
  return withCleanup(() => body(toxiproxy), async () => {
    try {
      await toxiproxy.reset();
    } finally {
      await release();
    }
  });
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
