import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_TOP, parseCommand, runFindings, SCHEMA_PATH, splitList, UsageError, USAGE } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';

function line(change: string, category: string, title: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    change,
    pass: 1,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: 'session-1',
    severity: 'low',
    category,
    title,
    file: 'scripts/findings.ts',
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'Fixed.',
    ...extra,
  });
}

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'findings-'));
  for (const path of [SCHEMA_PATH, VOCABULARY_PATH]) cpSync(path, join(root, path));
  mkdirSync(join(root, 'openspec/changes/archive/2026-10-01-old-change'), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const ARCHIVED = {
  'openspec/changes/archive/2026-10-02-first/findings.jsonl': [
    line('first', 'stale-citation', 'Old citation'),
    line('first', 'docs', 'Doc gap', { outcome: 'declined', capability: 'agent-task-protocol', file: 'docs/a.md' }),
  ].join('\n') + '\n',
  'openspec/changes/archive/2026-10-03-second/findings.jsonl': `${line('second', 'stale-citation', 'New citation')}\n`,
  'openspec/changes/active-change/findings.jsonl': '',
};

test('commands and their options parse, and misuse is a usage error', () => {
  assert.deepEqual(parseCommand(['validate']), { name: 'validate' });
  assert.deepEqual(parseCommand(['index', '--json']), { name: 'index', json: true });
  assert.deepEqual(parseCommand(['checklist', '--capability', 'a,b', '--capability', 'c', '--files', 'x/**,{y,z}.ts', '--top', '3']), {
    name: 'checklist',
    query: { capabilities: ['a', 'b', 'c'], files: ['x/**', '{y,z}.ts'], top: 3 },
  });
  assert.equal((parseCommand(['checklist']) as { query: { top: number } }).query.top, DEFAULT_TOP);
  for (const args of [[], ['nope'], ['validate', 'extra'], ['validate', '--json'], ['checklist', '--top', '0'], ['checklist', '--top', '11'], ['index', '--unknown']]) {
    assert.throws(() => parseCommand(args), UsageError, args.join(' '));
  }
});

test('a list splits at commas outside braces and drops empty items', () => {
  assert.deepEqual(splitList(' a, ,b/{c,d}/**,'), ['a', 'b/{c,d}/**']);
});

test('validate passes on valid files, empty active files, and archives without a file', () => {
  const root = repository(ARCHIVED);
  try {
    assert.deepEqual(runFindings(['validate'], root), { exitCode: 0, stdout: 'Every findings file is valid: 3 file(s).', stderr: '' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate requires a file in every active change and reports each problem', () => {
  const root = repository({
    'openspec/changes/no-file/proposal.md': '# Proposal\n',
    'openspec/changes/archive/2026-10-02-first/findings.jsonl': `${line('first', 'unknown-kind', 'Bad')}\n`,
  });
  try {
    const result = runFindings(['validate'], root);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.stderr.split('\n'), [
      'openspec/changes/no-file/findings.jsonl: missing; an active change records its findings here, empty if none',
      `openspec/changes/archive/2026-10-02-first/findings.jsonl:1: unknown category "unknown-kind"; categories are listed in ${VOCABULARY_PATH}`,
      `Review findings: 2 problem(s); the format is ${SCHEMA_PATH}.`,
    ]);
    assert.equal(runFindings(['index'], root).stderr.split('\n').length, 2, 'index ignores a missing active file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('index and checklist read only archived findings', () => {
  const root = repository({
    ...ARCHIVED,
    'openspec/changes/active-change/findings.jsonl': `${line('active-change', 'scope', 'Active only')}\n`,
  });
  try {
    const index = runFindings(['index'], root);
    assert.equal(index.exitCode, 0);
    assert.match(index.stdout, /^Archived review findings: 3 \(fixed 2, declined 1, other 0\)\./);
    assert.doesNotMatch(index.stdout, /scope/);
    const json = JSON.parse(runFindings(['index', '--json'], root).stdout) as { category: { key: string }[] };
    assert.deepEqual(json.category.map(({ key }) => key), ['stale-citation', 'docs']);
    const list = runFindings(['checklist', '--capability', 'review-process', '--top', '5'], root);
    assert.equal(list.exitCode, 0);
    assert.match(list.stdout, /\n1\. stale-citation \(2\): .+ Example: "New citation"$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a usage error prints the usage and exits with 2', () => {
  const result = runFindings(['checklist', '--top', 'many'], '/nonexistent');
  assert.deepEqual(result, { exitCode: 2, stdout: '', stderr: `--top must be 1 to 10\n${USAGE}` });
});

test('the npm script validates this repository', () => {
  const output = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/findings.ts', 'validate'], { encoding: 'utf8' });
  assert.match(output, /^Every findings file is valid: \d+ file\(s\)\.\n$/);
});
