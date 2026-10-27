import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { uncoveredEnvironment } from '@taskelith/testing';
import {
  activeChanges,
  archiveProblem,
  capabilityIds,
  CommandFailure,
  CommandInterrupted,
  directoryNames,
  runCommand,
  validationProblems,
} from '../scripts/check-archive-dry-run.ts';

function entry(name: string, directory = true) {
  return { name, isDirectory: () => directory };
}

test('directory names are sorted and exclude files', () => {
  assert.deepEqual(directoryNames([entry('b'), entry('README.md', false), entry('a')]), ['a', 'b']);
});

test('active changes exclude the archive directory', () => {
  assert.deepEqual(activeChanges([entry('archive'), entry('fix-b'), entry('add-a')]), ['add-a', 'fix-b']);
  assert.deepEqual(activeChanges([entry('archive')]), []);
});

test('capabilities are the directories holding a spec.md, nested ones included', () => {
  const paths = ['integration-flow', join('integration-flow', 'spec.md'), join('area', 'demo', 'spec.md'), join('area', 'notes.md'), 'spec.md'];
  assert.deepEqual(capabilityIds(paths), ['area/demo', 'integration-flow']);
});

test('invalid items are named after the change itself or the changes whose deltas touch them', () => {
  const report = {
    items: [
      { id: 'integration-flow', type: 'spec', valid: true, issues: [] },
      { id: 'demo', type: 'spec', valid: false, issues: [{ level: 'WARNING', path: 'overview', message: 'Purpose is a placeholder' }] },
      { id: 'orphan', type: 'spec', valid: false, issues: [{ level: 'ERROR', path: 'requirements[0]', message: 'too long' }] },
      { id: 'stuck', type: 'change', valid: false, issues: [{ level: 'ERROR', path: 'deltas', message: 'not found' }] },
    ],
  };
  const capabilitiesByChange = new Map([['add-demo', ['demo']], ['tune-demo', ['demo', 'integration-flow']]]);

  assert.deepEqual(validationProblems(report, capabilitiesByChange), [
    'add-demo, tune-demo: spec demo: [WARNING] overview: Purpose is a placeholder',
    'no active change: spec orphan: [ERROR] requirements[0]: too long',
    'stuck: change stuck: [ERROR] deltas: not found',
  ]);
});

test('a valid report has no problems', () => {
  assert.deepEqual(validationProblems({ items: [{ id: 'a', type: 'spec', valid: true, issues: [] }] }, new Map()), []);
});

test('an archive failure names the change and the trimmed output', () => {
  assert.equal(archiveProblem('add-demo', '  MODIFIED requirement not found\n'), 'add-demo: openspec archive failed: MODIFIED requirement not found');
});

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'check-archive-dry-run.ts');
const DELTA_WITHOUT_PURPOSE = '## ADDED Requirements\n\n### Requirement: Demo\nThe system SHALL demo.\n\n'
  + '#### Scenario: Demo\n- **WHEN** it runs\n- **THEN** it demos\n';

interface Fixture {
  readonly project: string;
  readonly temporary: string;
  readonly specs: string;
}

interface FixtureOptions {
  readonly linkedSpecs?: boolean;
  readonly capability?: string;
}

// A project whose one active change creates a capability without a Purpose.
function fixture(t: test.TestContext, { linkedSpecs = false, capability = 'demo' }: FixtureOptions = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-archive-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const temporary = join(root, 'tmp');
  const specs = join(linkedSpecs ? root : join(project, 'openspec'), 'specs');
  const change = join(project, 'openspec', 'changes', 'add-demo');
  for (const directory of [temporary, specs, join(project, 'openspec', 'changes', 'archive'), join(change, 'specs', capability)]) {
    mkdirSync(directory, { recursive: true });
  }
  if (linkedSpecs) symlinkSync(specs, join(project, 'openspec', 'specs'));
  writeFileSync(join(change, 'proposal.md'), '## Why\nA fixture change whose new capability has no Purpose.\n\n## What Changes\n- demo\n');
  writeFileSync(join(change, 'specs', capability, 'spec.md'), DELTA_WITHOUT_PURPOSE);
  return { project, temporary, specs };
}

interface Run {
  readonly code: number | null;
  readonly stderr: string;
}

// Optionally sends a signal once the check has created its copy.
function runCheck({ project, temporary }: Fixture, signal?: NodeJS.Signals): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', SCRIPT], { cwd: project, env: { ...uncoveredEnvironment(), TMPDIR: temporary } });
    const timer = setInterval(() => {
      if (signal === undefined || readdirSync(temporary).length === 0) return;
      clearInterval(timer);
      child.kill(signal);
    }, 10);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearInterval(timer);
      resolve({ code, stderr });
    });
  });
}

// Polls until the condition holds, rejecting when the signal aborts.
function waitFor(condition: () => boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearInterval(timer);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      stop();
      reject(signal.reason);
    };
    const timer = setInterval(() => {
      if (!condition()) return;
      stop();
      resolve();
    }, 10);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

test('a change whose new capability has no Purpose fails, and the copy is removed', async (t) => {
  const project = fixture(t);
  const run = await runCheck(project);

  assert.equal(run.code, 1);
  assert.match(run.stderr, /^add-demo: spec demo: \[WARNING\] overview: Purpose section is still a placeholder/m);
  assert.deepEqual(readdirSync(project.temporary), []);
  assert.deepEqual(readdirSync(join(project.project, 'openspec', 'changes')).sort(), ['add-demo', 'archive']);
});

test('a nested capability is named after its change', async (t) => {
  const project = fixture(t, { capability: join('area', 'demo') });
  const run = await runCheck(project);

  assert.equal(run.code, 1);
  assert.match(run.stderr, /^add-demo: spec area\/demo: \[WARNING\] overview: Purpose section is still a placeholder/m);
});

test('linked specs are copied, so archiving never writes through the link', async (t) => {
  const project = fixture(t, { linkedSpecs: true });
  const run = await runCheck(project);

  assert.equal(run.code, 1);
  assert.deepEqual(readdirSync(project.specs), []);
  assert.equal(readFileSync(join(project.project, 'openspec', 'changes', 'add-demo', 'specs', 'demo', 'spec.md'), 'utf8'), DELTA_WITHOUT_PURPOSE);
});

test('SIGTERM stops the check and removes the copy', { timeout: 60_000 }, async (t) => {
  const project = fixture(t);
  const run = await runCheck(project, 'SIGTERM');

  assert.equal(run.code, 143);
  assert.match(run.stderr, /interrupted by SIGTERM/);
  assert.deepEqual(readdirSync(project.temporary), []);
});

const NODE = process.execPath;

test('a command resolves with its output, and a failing one rejects with it', async () => {
  const options = { cwd: tmpdir(), env: process.env };
  const never = new AbortController().signal;

  assert.equal(await runCommand(NODE, ['-e', 'process.stdout.write("ok")'], options, never), 'ok');
  await assert.rejects(runCommand(NODE, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], options, never), (error) => {
    assert.ok(error instanceof CommandFailure);
    assert.equal(error.stdout, 'out\n');
    assert.equal(error.stderr, 'err\n');
    return true;
  });
});

test('an interrupted command settles only after it has exited', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-command-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ready = join(directory, 'ready');
  const exited = join(directory, 'exited');
  const program = 'const fs = require("node:fs");'
    + `process.on("SIGTERM", () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(exited)}, ""); process.exit(0); }, 200));`
    + `fs.writeFileSync(${JSON.stringify(ready)}, ""); setInterval(() => {}, 1000);`;
  const interruption = new AbortController();
  t.after(() => interruption.abort());
  const command = runCommand(NODE, ['-e', program], { cwd: directory, env: process.env }, interruption.signal);

  await waitFor(() => existsSync(ready), AbortSignal.any([t.signal, AbortSignal.timeout(10_000)]));
  interruption.abort();
  await assert.rejects(command, CommandInterrupted);
  assert.ok(existsSync(exited));
});

test('an interruption before the start runs nothing', async () => {
  const interruption = new AbortController();
  interruption.abort();
  await assert.rejects(runCommand(NODE, ['-e', ''], { cwd: tmpdir(), env: process.env }, interruption.signal), CommandInterrupted);
});
