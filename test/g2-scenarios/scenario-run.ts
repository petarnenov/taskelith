import { scenarioRecorderFromEnvironment, type ScenarioRecorder, type Toxiproxy } from '@taskelith/testing';
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
  try {
    return await body(installation);
  } finally {
    await options.toxiproxy?.reset();
    killProcessesNaming(installation.base);
    await installation.close();
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
