import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CHECKLIST_REQUIRED_FROM, CHECKLIST_SCHEMA_PATH, createdDate, requiresChecklist } from '../scripts/checklist-record.ts';
import { GIT_ENVIRONMENT, type ChecklistEnvironment } from '../scripts/checklist-environment.ts';
import { PASS_SCHEMA_PATH, parseCommand, runFindings, SCHEMA_PATH, UsageError } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';

const DEV_COMMIT = 'a'.repeat(40);
const ENVIRONMENT: ChecklistEnvironment = {
  now: () => new Date('2026-10-28T09:30:00.000Z'),
  devCommit: () => DEV_COMMIT,
  linesChanged: () => undefined,
};

function finding(change: string, category: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    change,
    pass: 1,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: 'session-1',
    severity: 'low',
    category,
    title: `A ${category} finding`,
    file: 'scripts/a.ts',
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'Fixed.',
    ...extra,
  });
}

const RECORD = 'openspec/changes/archive/2026-10-02-first/verification.md';

// Code findings: contract-drift (medium), naming, docs; record findings:
// evidence-mismatch (high), docs.
const ARCHIVE = {
  'openspec/changes/archive/2026-10-02-first/findings.jsonl': [
    finding('first', 'contract-drift', { severity: 'medium' }),
    finding('first', 'naming', { file: 'scripts/b.ts' }),
    finding('first', 'docs', { file: 'docs/x.md', capability: 'agent-task-protocol' }),
    finding('first', 'evidence-mismatch', { severity: 'high', file: RECORD, capability: undefined }),
    finding('first', 'docs', { file: RECORD, capability: undefined }),
  ].join('\n') + '\n',
};

function activeChange(change: string, created: string | undefined): Record<string, string> {
  const directory = `openspec/changes/${change}`;
  return {
    [`${directory}/findings.jsonl`]: '',
    [`${directory}/passes.jsonl`]: '',
    ...(created === undefined ? {} : { [`${directory}/.openspec.yaml`]: `schema: spec-driven\ncreated: ${created}\n` }),
  };
}

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'checklist-record-'));
  for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH]) cpSync(path, join(root, path));
  mkdirSync(join(root, 'openspec/specs/review-process'), { recursive: true });
  mkdirSync(join(root, 'openspec/specs/agent-task-protocol'), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function withRepository(files: Readonly<Record<string, string>>, check: (root: string) => void): void {
  const root = repository(files);
  try {
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SAVED = {
  change: 'new-change',
  generatedAt: '2026-10-28T09:30:00.000Z',
  devCommit: DEV_COMMIT,
  query: { capabilities: [], files: ['scripts/**'], top: 1 },
  size: 'S-M',
  // contract-drift and naming tie at 1; the tie goes to the first by name.
  // Baseline: 3 code findings, 1 contract-drift; Medium or worse 1, 1.
  review: {
    categories: [{ category: 'contract-drift', count: 1 }],
    baseline: { all: { findings: 3, inChecklist: 1 }, mediumOrWorse: { findings: 1, inChecklist: 1 } },
  },
  // 2 record findings, 1 docs; Medium or worse 1 (evidence-mismatch), 0.
  recordQuality: {
    categories: [{ category: 'docs', count: 1 }],
    baseline: { all: { findings: 2, inChecklist: 1 }, mediumOrWorse: { findings: 1, inChecklist: 0 } },
  },
};

// A problem with a checklist record also names the checklist schema.
const FORMATS = `the formats are ${SCHEMA_PATH}, ${PASS_SCHEMA_PATH}, and ${CHECKLIST_SCHEMA_PATH}`;

const MISSING_CHECKLIST = (change: string) => `openspec/changes/${change}/checklist.json: missing; an active change created `
  + `on or after ${CHECKLIST_REQUIRED_FROM} records its brief's checklist here (checklist ... --save ${change})`;

test('checklist takes --json, or --save with an optional --size', () => {
  const query = { capabilities: [], files: ['scripts/**'], top: 7 };
  assert.deepEqual(parseCommand(['checklist', '--files', 'scripts/**', '--json']), { name: 'checklist', query, json: true });
  assert.deepEqual(parseCommand(['checklist', '--files', 'scripts/**', '--save', 'new-change', '--size', 'M-L']), {
    name: 'checklist', query, json: false, save: { change: 'new-change', size: 'M-L' },
  });
  assert.deepEqual(parseCommand(['checklist', '--save', 'new-change']), {
    name: 'checklist', query: { ...query, files: [] }, json: false, save: { change: 'new-change' },
  });
  assert.deepEqual(parseCommand(['effect', '--json']), { name: 'effect', json: true });
  for (const args of [['checklist', '--size', 'M'], ['checklist', '--save', 'x', '--json'], ['checklist', '--save', 'x', '--size', 'XL'], ['checklist', '--save', '../x'], ['effect', '--top', '3']]) {
    assert.throws(() => parseCommand(args), UsageError, args.join(' '));
  }
});

test('a created date before the cutoff exempts an active change, and none requires it', () => {
  assert.equal(createdDate('schema: spec-driven\ncreated: 2026-10-27\n'), '2026-10-27');
  assert.equal(createdDate('schema: spec-driven\n'), undefined);
  assert.equal(createdDate(undefined), undefined);
  assert.equal(requiresChecklist('2026-10-27'), false);
  assert.equal(requiresChecklist('2026-10-28'), true);
  assert.equal(requiresChecklist('2026-11-03'), true);
  assert.equal(requiresChecklist(undefined), true);
});

test('--save writes the record of the invocation with its baselines', () => {
  withRepository({ ...ARCHIVE, ...activeChange('new-change', '2026-10-28') }, (root) => {
    const args = ['checklist', '--files', 'scripts/**', '--top', '1', '--save', 'new-change', '--size', 'S-M'];
    const result = runFindings(args, root, ENVIRONMENT);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /^Review checklist \(files scripts\/\*\*\), most frequent finding categories first:\n1\. contract-drift \(1\)/);
    assert.ok(result.stdout.endsWith('\n\nSaved the checklist to openspec/changes/new-change/checklist.json.'));
    const path = join(root, 'openspec/changes/new-change/checklist.json');
    assert.equal(readFileSync(path, 'utf8'), `${JSON.stringify(SAVED, null, 2)}\n`);
    assert.equal(runFindings(['validate'], root, ENVIRONMENT).exitCode, 0);
  });
});

test('--save refuses an existing record and a change that is not active', () => {
  const saved = `${JSON.stringify(SAVED)}\n`;
  withRepository({ ...ARCHIVE, ...activeChange('new-change', '2026-10-28'), 'openspec/changes/new-change/checklist.json': saved }, (root) => {
    const existing = runFindings(['checklist', '--save', 'new-change'], root, ENVIRONMENT);
    assert.equal(existing.exitCode, 1);
    assert.equal(existing.stderr, 'openspec/changes/new-change/checklist.json already exists; the checklist is recorded once, at plan time.');
    assert.equal(readFileSync(join(root, 'openspec/changes/new-change/checklist.json'), 'utf8'), saved);
    const absent = runFindings(['checklist', '--save', 'other-change'], root, ENVIRONMENT);
    assert.equal(absent.exitCode, 1);
    assert.equal(absent.stderr, 'openspec/changes/other-change is not an active change; create the change first.');
    assert.equal(existsSync(join(root, 'openspec/changes/other-change')), false);
  });
});

test('--save without a dev commit fails and writes nothing', () => {
  withRepository({ ...ARCHIVE, ...activeChange('new-change', '2026-10-28') }, (root) => {
    const environment = { ...ENVIRONMENT, devCommit: () => GIT_ENVIRONMENT.devCommit(root) };
    const result = runFindings(['checklist', '--save', 'new-change'], root, environment);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, 'git merge-base HEAD origin/dev found no dev commit; fetch origin first.');
    assert.equal(existsSync(join(root, 'openspec/changes/new-change/checklist.json')), false);
  });
});

test('checklist --json prints both sections with descriptions and examples', () => {
  withRepository(ARCHIVE, (root) => {
    const { exitCode, stdout } = runFindings(['checklist', '--files', 'docs/**', '--json'], root, ENVIRONMENT);
    assert.equal(exitCode, 0);
    const json = JSON.parse(stdout) as { query: unknown; review: { category: string; count: number; example: string }[]; recordQuality: { category: string }[] };
    assert.deepEqual(json.query, { capabilities: [], files: ['docs/**'], top: 7 });
    assert.deepEqual(json.review.map(({ category, count, example }) => [category, count, example]), [['docs', 1, 'A docs finding']]);
    assert.deepEqual(json.recordQuality.map(({ category }) => category), ['docs', 'evidence-mismatch']);
  });
});

test('validate requires a checklist only in active changes created from the cutoff on', () => {
  const files = {
    ...ARCHIVE,
    ...activeChange('after-cutoff', '2026-10-28'),
    ...activeChange('before-cutoff', '2026-10-27'),
    ...activeChange('no-date', undefined),
  };
  withRepository(files, (root) => {
    assert.deepEqual(runFindings(['validate'], root, ENVIRONMENT).stderr.split('\n'), [
      MISSING_CHECKLIST('after-cutoff'),
      MISSING_CHECKLIST('no-date'),
      `Review findings: 2 problem(s); ${FORMATS}.`,
    ]);
    assert.equal(runFindings(['index'], root, ENVIRONMENT).exitCode, 0, 'only validate requires the record');
  });
});

test('validate checks every checklist record, archived ones included', () => {
  const archived = 'openspec/changes/archive/2026-10-03-second/checklist.json';
  const active = 'openspec/changes/after-cutoff/checklist.json';
  const files = {
    ...ARCHIVE,
    ...activeChange('after-cutoff', '2026-10-28'),
    [archived]: JSON.stringify({ ...SAVED, change: 'other', review: { ...SAVED.review, categories: [{ category: 'no-such-kind', count: 1 }] } }),
    [active]: JSON.stringify({ ...SAVED, change: 'after-cutoff', devCommit: 'abc' }),
    'openspec/changes/archive/2026-10-04-third/checklist.json': '{not json',
  };
  withRepository(files, (root) => {
    assert.deepEqual(runFindings(['validate'], root, ENVIRONMENT).stderr.split('\n'), [
      `${active}: /devCommit must match pattern "^[0-9a-f]{40}$"`,
      `${archived}: change "other" is not this change "second"`,
      `${archived}: unknown category "no-such-kind"; categories are listed in ${VOCABULARY_PATH}`,
      'openspec/changes/archive/2026-10-04-third/checklist.json: not a JSON value',
      `Review findings: 4 problem(s); ${FORMATS}.`,
    ]);
  });
});
