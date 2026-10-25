import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkEnvironment, collectFacts, formatReport, readPins, setupSteps, shellNodeNotice, stepCommand,
  type CommandOutcome, type EnvironmentFacts
} from '../scripts/environment-checks.ts';

const pins = { node: '24.22.1', npm: '12.2.1' };

const healthy: EnvironmentFacts = {
  gitAvailable: true,
  nodeVersion: 'v24.22.1',
  npmVersion: '12.2.1',
  dependenciesInstalled: true,
  hooksPath: '.githooks',
  inventoryMergeDriver: 'true',
  dockerAvailable: true
};

function failing(facts: EnvironmentFacts): string[] {
  return checkEnvironment(facts, pins).filter((result) => !result.ok).map((result) => result.id);
}

test('a complete environment passes every check and needs no setup step', () => {
  const results = checkEnvironment(healthy, pins);
  assert.deepEqual(results.map((result) => result.id), ['git', 'node', 'npm', 'dependencies', 'hooks', 'merge-driver', 'docker']);
  assert.ok(results.every((result) => result.ok));
  assert.deepEqual(setupSteps(healthy, pins), []);
  assert.match(formatReport(results), /All checks passed\.$/);
});

test('each missing part fails only its own check', () => {
  assert.deepEqual(failing({ ...healthy, gitAvailable: false }), ['git']);
  assert.deepEqual(failing({ ...healthy, nodeVersion: 'v24.21.0' }), ['node']);
  assert.deepEqual(failing({ ...healthy, npmVersion: '11.6.0' }), ['npm']);
  assert.deepEqual(failing({ ...healthy, npmVersion: undefined }), ['npm']);
  assert.deepEqual(failing({ ...healthy, dependenciesInstalled: false }), ['dependencies']);
  assert.deepEqual(failing({ ...healthy, hooksPath: undefined }), ['hooks']);
  assert.deepEqual(failing({ ...healthy, hooksPath: '.husky' }), ['hooks']);
  assert.deepEqual(failing({ ...healthy, inventoryMergeDriver: undefined }), ['merge-driver']);
  assert.deepEqual(failing({ ...healthy, inventoryMergeDriver: 'git merge-file' }), ['merge-driver']);
  assert.deepEqual(failing({ ...healthy, dockerAvailable: false }), ['docker']);
});

test('without Docker, the check names its install and start, and setup adds no step', () => {
  const facts: EnvironmentFacts = { ...healthy, dockerAvailable: false };
  assert.match(formatReport(checkEnvironment(facts, pins)), /FAIL Docker daemon and Compose reachable: not reachable\n {5}Install Docker with the Compose plugin and start it/);
  assert.deepEqual(setupSteps(facts, pins), []);
});

test('without the pinned Node.js, the remedies name setup through nvm and fix the Node.js check before npm', () => {
  const report = formatReport(checkEnvironment({ ...healthy, nodeVersion: 'v24.21.0', npmVersion: '11.19.0' }, pins));
  assert.match(report, /FAIL Node\.js 24\.22\.1 \(\.nvmrc\): v24\.21\.0\n {5}With nvm, run make setup to install Node\.js 24\.22\.1; without nvm, install Node\.js 24\.22\.1 yourself\./);
  assert.match(report, /FAIL npm 12\.2\.1 \(CI pin\): 11\.19\.0\n {5}Fix the Node\.js check first; npm is checked under Node\.js 24\.22\.1\./);
});

test('with the pinned Node.js active, a wrong npm is fixed by setup', () => {
  assert.match(formatReport(checkEnvironment({ ...healthy, npmVersion: '11.19.0' }, pins)), /FAIL npm 12\.2\.1 \(CI pin\): 11\.19\.0\n {5}Run make setup\./);
});

test('the checks tell a shell on another Node.js to run nvm use for direct commands, and stay quiet otherwise', () => {
  assert.equal(shellNodeNotice({ shell: 'v24.22.1', checks: 'v24.22.1' }), undefined);
  assert.equal(
    shellNodeNotice({ shell: 'v24.21.0', checks: 'v24.22.1' }),
    "These checks ran under Node.js v24.22.1, which make doctor and make verify select on their own; your shell uses v24.21.0, so run 'nvm use' before running npm or node directly."
  );
  assert.match(shellNodeNotice({ shell: undefined, checks: 'v24.22.1' }) ?? '', /your shell uses none,/);
  assert.match(shellNodeNotice({ shell: '', checks: 'v24.22.1' }) ?? '', /your shell uses none,/);
});

test('setup installs npm before the dependencies and reinstalls them with the new npm', () => {
  assert.deepEqual(setupSteps({ ...healthy, npmVersion: '11.6.0', hooksPath: undefined }, pins), ['install-npm', 'install-dependencies', 'enable-hooks']);
  assert.deepEqual(setupSteps({ ...healthy, dependenciesInstalled: false }, pins), ['install-dependencies']);
});

test('setup configures a missing inventory merge driver after the hooks', () => {
  assert.deepEqual(setupSteps({ ...healthy, hooksPath: undefined, inventoryMergeDriver: undefined }, pins), ['enable-hooks', 'enable-merge-driver']);
  assert.deepEqual(setupSteps({ ...healthy, inventoryMergeDriver: undefined }, pins), ['enable-merge-driver']);
});

test('with the pinned Node.js active but no npm, the remedies name a Node.js reinstall and setup skips the npm steps', () => {
  const facts: EnvironmentFacts = { ...healthy, npmVersion: undefined, dependenciesInstalled: false, hooksPath: undefined };
  const report = formatReport(checkEnvironment(facts, pins));
  assert.match(report, /FAIL npm 12\.2\.1 \(CI pin\): not found\n {5}Reinstall Node\.js 24\.22\.1, which includes npm: with nvm, run nvm deactivate, nvm uninstall 24\.22\.1, and make setup; without nvm, reinstall Node\.js 24\.22\.1 yourself\./);
  assert.match(report, /FAIL Dependency tree complete \(npm ls --all\): missing or out of date\n {5}Fix the npm check first; dependencies are installed with npm\./);
  assert.deepEqual(setupSteps(facts, pins), ['enable-hooks']);
});

test('without the pinned Node.js, a missing npm and dependencies keep their usual remedies', () => {
  const report = formatReport(checkEnvironment({ ...healthy, nodeVersion: 'v24.21.0', npmVersion: undefined, dependenciesInstalled: false }, pins));
  assert.match(report, /FAIL npm 12\.2\.1 \(CI pin\): not found\n {5}Fix the Node\.js check first;/);
  assert.match(report, /FAIL Dependency tree complete \(npm ls --all\): missing or out of date\n {5}Run make setup\./);
});

test('without git, setup reports it and does not try to enable the hooks or the merge driver', () => {
  const facts: EnvironmentFacts = { ...healthy, gitAvailable: false, hooksPath: undefined, inventoryMergeDriver: undefined };
  const results = checkEnvironment(facts, pins);
  assert.deepEqual(setupSteps(facts, pins), []);
  assert.match(formatReport(results), /FAIL git: not found\n {5}Install git/);
  assert.match(formatReport(results), /FAIL pre-push and post-merge hooks enabled: not configured\n {5}Install git, then run make setup\./);
  assert.match(formatReport(results), /FAIL dependency inventory merge driver configured: not configured\n {5}Install git, then run make setup\./);
  assert.match(formatReport(results), /3 of 7 checks failed\.$/);
});

test('without the pinned Node.js, setup changes nothing', () => {
  assert.deepEqual(setupSteps({ ...healthy, nodeVersion: 'v20.0.0', npmVersion: '10.0.0', dependenciesInstalled: false, hooksPath: undefined }, pins), []);
});

test('setup steps use the pinned npm, the lockfile, the repository hooks, and the merge driver', () => {
  assert.deepEqual(stepCommand('install-npm', pins), { command: 'npm', args: ['install', '--global', 'npm@12.2.1', '--ignore-scripts'] });
  assert.deepEqual(stepCommand('install-dependencies', pins), { command: 'npm', args: ['ci', '--ignore-scripts'] });
  assert.deepEqual(stepCommand('enable-hooks', pins), { command: 'git', args: ['config', 'core.hooksPath', '.githooks'] });
  assert.deepEqual(stepCommand('enable-merge-driver', pins), { command: 'git', args: ['config', 'merge.dependency-inventory.driver', 'true'] });
});

test('facts come from git and npm, and a failing command counts as missing', () => {
  const outcomes: Record<string, CommandOutcome> = {
    'git --version': { status: 0, stdout: 'git version 2.50.1\n' },
    'npm -v': { status: 0, stdout: '12.2.1\n' },
    'npm ls --all': { status: 1, stdout: '' },
    'git config --get core.hooksPath': { status: 1, stdout: '' },
    'git config --get merge.dependency-inventory.driver': { status: 0, stdout: 'true\n' },
    'docker info': { status: 0, stdout: '' },
    'docker compose version': { status: 1, stdout: '' }
  };
  const calls: string[] = [];
  const facts = collectFacts((command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    return outcomes[key] ?? { status: null, stdout: '' };
  }, 'v24.22.1');
  assert.deepEqual(facts, { gitAvailable: true, nodeVersion: 'v24.22.1', npmVersion: '12.2.1', dependenciesInstalled: false, hooksPath: undefined, inventoryMergeDriver: 'true', dockerAvailable: false });
  assert.ok(calls.includes('npm ls --all'));
});

test('without npm, dependencies are not checked and count as missing', () => {
  const calls: string[] = [];
  const facts = collectFacts((command, args) => {
    calls.push([command, ...args].join(' '));
    return { status: command === 'npm' ? null : 0, stdout: '' };
  }, 'v24.22.1');
  assert.equal(facts.npmVersion, undefined);
  assert.equal(facts.dependenciesInstalled, false);
  assert.ok(!calls.includes('npm ls --all'));
});

test('pins must come from the Makefile', () => {
  assert.deepEqual(readPins({ NODE_PIN: '24.22.1\n', NPM_PIN: '12.2.1' }), pins);
  assert.throws(() => readPins({ NODE_PIN: '24.22.1' }), /NODE_PIN and NPM_PIN must be set/);
  assert.throws(() => readPins({ NODE_PIN: ' ', NPM_PIN: '12.2.1' }), /NODE_PIN and NPM_PIN must be set/);
});
