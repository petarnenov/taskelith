import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkEnvironment, collectFacts, formatReport, readPins, setupSteps, stepCommand,
  type CommandOutcome, type EnvironmentFacts
} from '../scripts/environment-checks.ts';

const pins = { node: '24.22.1', npm: '12.2.1' };

const healthy: EnvironmentFacts = {
  gitAvailable: true,
  nodeVersion: 'v24.22.1',
  npmVersion: '12.2.1',
  dependenciesInstalled: true,
  hooksPath: '.githooks'
};

function failing(facts: EnvironmentFacts): string[] {
  return checkEnvironment(facts, pins).filter((result) => !result.ok).map((result) => result.id);
}

test('a complete environment passes every check and needs no setup step', () => {
  const results = checkEnvironment(healthy, pins);
  assert.deepEqual(results.map((result) => result.id), ['git', 'node', 'npm', 'dependencies', 'hooks']);
  assert.ok(results.every((result) => result.ok));
  assert.deepEqual(setupSteps(results), []);
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
});

test('setup installs npm before the dependencies and reinstalls them with the new npm', () => {
  const results = checkEnvironment({ ...healthy, npmVersion: '11.6.0', hooksPath: undefined }, pins);
  assert.deepEqual(setupSteps(results), ['install-npm', 'install-dependencies', 'enable-hooks']);
  assert.deepEqual(setupSteps(checkEnvironment({ ...healthy, dependenciesInstalled: false }, pins)), ['install-dependencies']);
});

test('without git, setup reports it and does not try to enable the hook', () => {
  const results = checkEnvironment({ ...healthy, gitAvailable: false, hooksPath: undefined }, pins);
  assert.deepEqual(setupSteps(results), []);
  assert.match(formatReport(results), /FAIL git: not found\n {5}Install git/);
  assert.match(formatReport(results), /2 of 5 checks failed\.$/);
});

test('without the pinned Node.js, setup changes nothing', () => {
  const results = checkEnvironment({ ...healthy, nodeVersion: 'v20.0.0', npmVersion: '10.0.0', dependenciesInstalled: false, hooksPath: undefined }, pins);
  assert.deepEqual(setupSteps(results), []);
});

test('setup steps use the pinned npm, the lockfile, and the repository hooks', () => {
  assert.deepEqual(stepCommand('install-npm', pins), { command: 'npm', args: ['install', '--global', 'npm@12.2.1', '--ignore-scripts'] });
  assert.deepEqual(stepCommand('install-dependencies', pins), { command: 'npm', args: ['ci', '--ignore-scripts'] });
  assert.deepEqual(stepCommand('enable-hooks', pins), { command: 'git', args: ['config', 'core.hooksPath', '.githooks'] });
});

test('facts come from git and npm, and a failing command counts as missing', () => {
  const outcomes: Record<string, CommandOutcome> = {
    'git --version': { status: 0, stdout: 'git version 2.50.1\n' },
    'npm -v': { status: 0, stdout: '12.2.1\n' },
    'npm ls --all': { status: 1, stdout: '' },
    'git config --get core.hooksPath': { status: 1, stdout: '' }
  };
  const calls: string[] = [];
  const facts = collectFacts((command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    return outcomes[key] ?? { status: null, stdout: '' };
  }, 'v24.22.1');
  assert.deepEqual(facts, { gitAvailable: true, nodeVersion: 'v24.22.1', npmVersion: '12.2.1', dependenciesInstalled: false, hooksPath: undefined });
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
