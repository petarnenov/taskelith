// Checks behind `make doctor` and `make setup`: whether this clone has what it
// needs to build and verify, and which missing parts setup can add itself.

export interface Pins {
  readonly node: string;
  readonly npm: string;
}

export interface EnvironmentFacts {
  readonly gitAvailable: boolean;
  readonly nodeVersion: string;
  readonly npmVersion: string | undefined;
  readonly dependenciesInstalled: boolean;
  readonly hooksPath: string | undefined;
}

export type CheckId = 'git' | 'node' | 'npm' | 'dependencies' | 'hooks';

export interface CheckResult {
  readonly id: CheckId;
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly remedy: string;
}

export type SetupStep = 'install-npm' | 'install-dependencies' | 'enable-hooks';

export interface CommandOutcome {
  readonly status: number | null;
  readonly stdout: string;
}

export type CommandRunner = (command: string, args: readonly string[]) => CommandOutcome;

export const HOOKS_PATH = '.githooks';

export function readPins(env: Readonly<Record<string, string | undefined>>): Pins {
  const node = env.NODE_PIN?.trim();
  const npm = env.NPM_PIN?.trim();
  if (!node || !npm) {
    throw new Error('NODE_PIN and NPM_PIN must be set; run this through make doctor or make setup.');
  }
  return { node, npm };
}

export function collectFacts(run: CommandRunner, nodeVersion: string): EnvironmentFacts {
  const git = run('git', ['--version']);
  const npm = run('npm', ['-v']);
  const hooks = run('git', ['config', '--get', 'core.hooksPath']);
  return {
    gitAvailable: git.status === 0,
    nodeVersion,
    npmVersion: npm.status === 0 ? npm.stdout.trim() : undefined,
    dependenciesInstalled: npm.status === 0 && run('npm', ['ls', '--all']).status === 0,
    hooksPath: hooks.status === 0 ? hooks.stdout.trim() : undefined
  };
}

export function checkEnvironment(facts: EnvironmentFacts, pins: Pins): CheckResult[] {
  return [
    {
      id: 'git',
      label: 'git',
      ok: facts.gitAvailable,
      detail: facts.gitAvailable ? 'available' : 'not found',
      remedy: 'Install git with your system package manager.'
    },
    {
      id: 'node',
      label: `Node.js ${pins.node} (.nvmrc)`,
      ok: facts.nodeVersion === `v${pins.node}`,
      detail: facts.nodeVersion,
      remedy: `Run make setup (it installs Node.js ${pins.node} through nvm), then nvm use; without nvm, install Node.js ${pins.node} yourself.`
    },
    {
      id: 'npm',
      label: `npm ${pins.npm} (CI pin)`,
      ok: facts.npmVersion === pins.npm,
      detail: facts.npmVersion ?? 'not found',
      remedy: 'Run make setup.'
    },
    {
      id: 'dependencies',
      label: 'Dependencies installed from package-lock.json',
      ok: facts.dependenciesInstalled,
      detail: facts.dependenciesInstalled ? 'complete' : 'missing or out of date',
      remedy: 'Run make setup.'
    },
    {
      id: 'hooks',
      label: 'pre-push hook enabled',
      ok: facts.hooksPath === HOOKS_PATH,
      detail: facts.hooksPath ?? 'not configured',
      remedy: 'Run make setup.'
    }
  ];
}

// Git and Node.js are installed outside the repository (Node.js through nvm in
// the setup wrapper), so setup only adds what it can install from this clone.
// The order matters: dependencies are installed with the pinned npm.
export function setupSteps(results: readonly CheckResult[]): SetupStep[] {
  const failing = new Set(results.filter((result) => !result.ok).map((result) => result.id));
  const steps: SetupStep[] = [];
  if (failing.has('npm')) steps.push('install-npm');
  if (failing.has('npm') || failing.has('dependencies')) steps.push('install-dependencies');
  if (failing.has('hooks')) steps.push('enable-hooks');
  return steps;
}

export function stepCommand(step: SetupStep, pins: Pins): { command: string; args: string[] } {
  switch (step) {
    case 'install-npm':
      return { command: 'npm', args: ['install', '--global', `npm@${pins.npm}`, '--ignore-scripts'] };
    case 'install-dependencies':
      return { command: 'npm', args: ['ci', '--ignore-scripts'] };
    case 'enable-hooks':
      return { command: 'git', args: ['config', 'core.hooksPath', HOOKS_PATH] };
  }
}

export function formatReport(results: readonly CheckResult[]): string {
  const lines = results.map((result) => {
    const line = `${result.ok ? 'ok  ' : 'FAIL'} ${result.label}: ${result.detail}`;
    return result.ok ? line : `${line}\n     ${result.remedy}`;
  });
  const failures = results.filter((result) => !result.ok).length;
  const summary = failures === 0 ? 'All checks passed.' : `${failures} of ${results.length} checks failed.`;
  return [...lines, summary].join('\n');
}
