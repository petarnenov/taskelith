import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { activeChanges, archiveProblem, directoryNames, validationProblems } from '../scripts/check-archive-dry-run.ts';

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

// A project whose one active change creates a capability without a Purpose.
function fixture(t: test.TestContext, linkedSpecs = false): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-archive-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const temporary = join(root, 'tmp');
  const specs = join(linkedSpecs ? root : join(project, 'openspec'), 'specs');
  const change = join(project, 'openspec', 'changes', 'add-demo');
  for (const directory of [temporary, specs, join(project, 'openspec', 'changes', 'archive'), join(change, 'specs', 'demo')]) {
    mkdirSync(directory, { recursive: true });
  }
  if (linkedSpecs) symlinkSync(specs, join(project, 'openspec', 'specs'));
  writeFileSync(join(change, 'proposal.md'), '## Why\nA fixture change whose new capability has no Purpose.\n\n## What Changes\n- demo\n');
  writeFileSync(join(change, 'specs', 'demo', 'spec.md'), DELTA_WITHOUT_PURPOSE);
  return { project, temporary, specs };
}

interface Run {
  readonly code: number | null;
  readonly stderr: string;
}

function runCheck({ project, temporary }: Fixture, onStart: (pid: number) => void = () => {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', SCRIPT], { cwd: project, env: { ...process.env, TMPDIR: temporary } });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
    onStart(child.pid ?? 0);
  });
}

function sendWhenCopied(temporary: string, pid: number, signal: NodeJS.Signals): void {
  const timer = setInterval(() => {
    if (readdirSync(temporary).length === 0) return;
    clearInterval(timer);
    process.kill(pid, signal);
  }, 10);
}

test('a change whose new capability has no Purpose fails, and the copy is removed', async (t) => {
  const project = fixture(t);
  const run = await runCheck(project);

  assert.equal(run.code, 1);
  assert.match(run.stderr, /^add-demo: spec demo: \[WARNING\] overview: Purpose section is still a placeholder/m);
  assert.deepEqual(readdirSync(project.temporary), []);
  assert.deepEqual(readdirSync(join(project.project, 'openspec', 'changes')).sort(), ['add-demo', 'archive']);
});

test('linked specs are copied, so archiving never writes through the link', async (t) => {
  const project = fixture(t, true);
  const run = await runCheck(project);

  assert.equal(run.code, 1);
  assert.deepEqual(readdirSync(project.specs), []);
  assert.equal(readFileSync(join(project.project, 'openspec', 'changes', 'add-demo', 'specs', 'demo', 'spec.md'), 'utf8'), DELTA_WITHOUT_PURPOSE);
});

test('SIGTERM stops the check and removes the copy', async (t) => {
  const project = fixture(t);
  const run = await runCheck(project, (pid) => sendWhenCopied(project.temporary, pid, 'SIGTERM'));

  assert.equal(run.code, 143);
  assert.match(run.stderr, /interrupted by SIGTERM/);
  assert.deepEqual(readdirSync(project.temporary), []);
});
