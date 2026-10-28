import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROUTE_SCHEMA_PATH } from '../scripts/review-route.ts';
import { CHECKLIST_SCHEMA_PATH, LANDING_CHANGE } from '../scripts/checklist-record.ts';
import type { ArchiveSnapshot, ChecklistEnvironment } from '../scripts/checklist-environment.ts';
import { PASS_SCHEMA_PATH, parseCommand, runFindings, SCHEMA_PATH, UsageError } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';

const DEV_COMMIT = 'a'.repeat(40);
const BRIEF_COMMIT = 'abc1234';
const LANDING = 'b'.repeat(40);

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

const FIRST_FINDINGS = 'openspec/changes/archive/2026-10-02-first/findings.jsonl';

// The brief's commit holds only the first archive; the working tree also
// holds a later one, which --at must leave out.
const LATER_ARCHIVE = {
  'openspec/changes/archive/2026-10-05-later/findings.jsonl': `${finding('later', 'redaction', { severity: 'high' })}\n`,
};

function snapshotAt(commit: string): ArchiveSnapshot | undefined {
  if (commit !== BRIEF_COMMIT) return undefined;
  return { commit: DEV_COMMIT, findings: [{ path: FIRST_FINDINGS, text: ARCHIVE[FIRST_FINDINGS] }] };
}

// Before the landing of this rule unless a test says otherwise.
const ENVIRONMENT: ChecklistEnvironment = {
  now: () => new Date('2026-10-28T09:30:00.000Z'),
  devCommit: () => BRIEF_COMMIT,
  archiveAt: (_root, commit) => snapshotAt(commit),
  landingCommit: () => undefined,
  openedAfter: () => false,
  linesChanged: () => undefined,
};

function activeChange(change: string): Record<string, string> {
  const directory = `openspec/changes/${change}`;
  return { [`${directory}/findings.jsonl`]: '', [`${directory}/passes.jsonl`]: '' };
}

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'checklist-record-'));
  for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH, ROUTE_SCHEMA_PATH]) cpSync(path, join(root, path));
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

const MISSING_CHECKLIST = (change: string) => `openspec/changes/${change}/checklist.json: missing; an active change opened `
  + `after ${LANDING_CHANGE} was archived records its brief's checklist here `
  + `(checklist ... --save ${change} --at <dev commit of the brief>)`;

test('checklist takes --at and --json, or --save with --at and an optional --size', () => {
  const query = { capabilities: [], files: ['scripts/**'], top: 7 };
  assert.deepEqual(parseCommand(['checklist', '--files', 'scripts/**', '--json']), { name: 'checklist', query, json: true });
  assert.deepEqual(parseCommand(['checklist', '--files', 'scripts/**', '--at', BRIEF_COMMIT]), { name: 'checklist', query, json: false, at: BRIEF_COMMIT });
  assert.deepEqual(parseCommand(['checklist', '--files', 'scripts/**', '--save', 'new-change', '--at', BRIEF_COMMIT, '--size', 'M-L']), {
    name: 'checklist', query, json: false, at: BRIEF_COMMIT, save: { change: 'new-change', size: 'M-L' },
  });
  assert.deepEqual(parseCommand(['effect', '--json']), { name: 'effect', json: true });
  const misuse = [
    ['checklist', '--size', 'M'],
    ['checklist', '--save', 'x'],
    ['checklist', '--save', 'x', '--at', BRIEF_COMMIT, '--json'],
    ['checklist', '--save', 'x', '--at', BRIEF_COMMIT, '--size', 'XL'],
    ['checklist', '--save', '../x', '--at', BRIEF_COMMIT],
    ['checklist', '--at', 'HEAD'],
    ['checklist', '--at', '--output=x'],
    ['effect', '--top', '3'],
  ];
  for (const args of misuse) assert.throws(() => parseCommand(args), UsageError, args.join(' '));
});

test('--save writes the record of the archive at the brief commit', () => {
  withRepository({ ...ARCHIVE, ...LATER_ARCHIVE, ...activeChange('new-change') }, (root) => {
    const args = ['checklist', '--files', 'scripts/**', '--top', '1', '--save', 'new-change', '--at', BRIEF_COMMIT, '--size', 'S-M'];
    const result = runFindings(args, root, ENVIRONMENT);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /^Review checklist \(files scripts\/\*\*\), most frequent finding categories first:\n1\. contract-drift \(1\)/);
    assert.ok(result.stdout.endsWith(`\n\nDev commit: ${DEV_COMMIT}.\n\nSaved the checklist to openspec/changes/new-change/checklist.json.`));
    const path = join(root, 'openspec/changes/new-change/checklist.json');
    assert.equal(readFileSync(path, 'utf8'), `${JSON.stringify(SAVED, null, 2)}\n`);
    assert.equal(runFindings(['validate'], root, ENVIRONMENT).exitCode, 0);
  });
});

test('without --at the checklist ranks the archive of its dev commit and names it', () => {
  withRepository({ ...ARCHIVE, ...LATER_ARCHIVE }, (root) => {
    const atDev = runFindings(['checklist'], root, ENVIRONMENT).stdout;
    assert.ok(atDev.endsWith(`\n\nDev commit: ${DEV_COMMIT}.`));
    assert.doesNotMatch(atDev, /redaction/, 'the working tree archive is not what the line names');
    assert.equal(atDev, runFindings(['checklist', '--at', BRIEF_COMMIT], root, ENVIRONMENT).stdout);
    for (const devCommit of [() => undefined, () => 'fedcba9']) {
      const tree = runFindings(['checklist'], root, { ...ENVIRONMENT, devCommit }).stdout;
      assert.match(tree, /redaction/, 'without a readable dev commit the working tree archive counts');
      assert.doesNotMatch(tree, /Dev commit/);
    }
  });
});

test('--save refuses an existing record, a change that is not active, and an unknown commit', () => {
  const saved = `${JSON.stringify(SAVED)}\n`;
  const files = { ...ARCHIVE, ...activeChange('new-change'), 'openspec/changes/new-change/checklist.json': saved, 'openspec/changes/a-file': '' };
  withRepository(files, (root) => {
    const save = (change: string, at = BRIEF_COMMIT) => runFindings(['checklist', '--save', change, '--at', at], root, ENVIRONMENT);
    assert.deepEqual(save('new-change'), {
      exitCode: 1, stdout: '', stderr: 'openspec/changes/new-change/checklist.json already exists; the checklist is recorded once, at plan time.',
    });
    assert.equal(readFileSync(join(root, 'openspec/changes/new-change/checklist.json'), 'utf8'), saved);
    for (const change of ['other-change', 'archive', 'a-file']) {
      assert.deepEqual(save(change), {
        exitCode: 1, stdout: '', stderr: `openspec/changes/${change} is not an active change; create the change first.`,
      });
    }
    assert.equal(existsSync(join(root, 'openspec/changes/other-change')), false);
    assert.equal(existsSync(join(root, 'openspec/changes/archive/checklist.json')), false);
    const unknown = save('new-change', 'fedcba9');
    assert.deepEqual(unknown, { exitCode: 1, stdout: '', stderr: 'unknown commit "fedcba9"; give the dev commit that the brief\'s checklist names.' });
  });
});

test('checklist --json prints both sections with descriptions, examples, and the dev commit', () => {
  withRepository(ARCHIVE, (root) => {
    const { exitCode, stdout } = runFindings(['checklist', '--files', 'docs/**', '--json'], root, ENVIRONMENT);
    assert.equal(exitCode, 0);
    const json = JSON.parse(stdout) as {
      query: unknown;
      devCommit: string;
      review: { category: string; count: number; example: string }[];
      recordQuality: { category: string }[];
    };
    assert.deepEqual(json.query, { capabilities: [], files: ['docs/**'], top: 7 });
    assert.equal(json.devCommit, DEV_COMMIT);
    assert.deepEqual(json.review.map(({ category, count, example }) => [category, count, example]), [['docs', 1, 'A docs finding']]);
    assert.deepEqual(json.recordQuality.map(({ category }) => category), ['docs', 'evidence-mismatch']);
  });
});

test('validate requires a checklist only in active changes opened after the landing', () => {
  const files = { ...ARCHIVE, ...activeChange('opened-before'), ...activeChange('opened-after') };
  withRepository(files, (root) => {
    assert.equal(runFindings(['validate'], root, ENVIRONMENT).exitCode, 0, 'nothing is required before the landing');
    const asked: string[] = [];
    const landed: ChecklistEnvironment = {
      ...ENVIRONMENT,
      landingCommit: () => LANDING,
      openedAfter: (_root, directory, landing) => {
        asked.push(`${directory} ${landing.slice(0, 1)}`);
        return directory.endsWith('opened-after');
      },
    };
    assert.deepEqual(runFindings(['validate'], root, landed).stderr.split('\n'), [
      MISSING_CHECKLIST('opened-after'),
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
    assert.deepEqual(asked, ['openspec/changes/opened-after b', 'openspec/changes/opened-before b']);
    assert.equal(runFindings(['index'], root, landed).exitCode, 0, 'only validate requires the record');
  });
});

test('validate checks every checklist record, archived ones included', () => {
  const archived = 'openspec/changes/archive/2026-10-03-second/checklist.json';
  const active = 'openspec/changes/opened-after/checklist.json';
  const files = {
    ...ARCHIVE,
    ...activeChange('opened-after'),
    [archived]: JSON.stringify({ ...SAVED, change: 'other', review: { ...SAVED.review, categories: [{ category: 'no-such-kind', count: 1 }] } }),
    [active]: JSON.stringify({ ...SAVED, change: 'opened-after', devCommit: 'abc' }),
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

const share = (findings: number, inChecklist: number) => ({ findings, inChecklist });
const ranked = (...entries: [string, number][]) => entries.map(([category, count]) => ({ category, count }));

test('validate rejects a checklist record whose counts, ranks, or time are impossible', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['an impossible time', { generatedAt: '2026-99-99T99:99:99.999Z' }, 'generatedAt "2026-99-99T99:99:99.999Z" is not a real time'],
    ['more listed than findings', { review: { ...SAVED.review, baseline: { ...SAVED.review.baseline, all: share(3, 6) } } },
      'review baseline all lists 6 of 3 findings'],
    ['more Medium or worse than all', { review: { ...SAVED.review, baseline: { all: share(3, 1), mediumOrWorse: share(4, 1) } } },
      'review baseline has 4 Medium or worse findings of 3'],
    ['more Medium or worse listed than all listed', { review: { ...SAVED.review, baseline: { all: share(3, 0), mediumOrWorse: share(1, 1) } } },
      'review baseline lists 1 Medium or worse findings of 0 listed'],
    ['a duplicate category', { query: { ...SAVED.query, top: 2 }, recordQuality: { ...SAVED.recordQuality, categories: ranked(['docs', 1], ['docs', 1]) } },
      'recordQuality lists category "docs" twice'],
    ['an unranked list', { query: { ...SAVED.query, top: 2 }, review: { ...SAVED.review, categories: ranked(['naming', 1], ['docs', 2]) } },
      'review is not ranked by count: "docs" (2) follows "naming" (1)'],
    ['more categories than top', { review: { ...SAVED.review, categories: ranked(['naming', 2], ['docs', 1]) } },
      'review lists 2 categories, more than top 1'],
  ];
  const path = 'openspec/changes/archive/2026-10-03-second/checklist.json';
  for (const [name, change, message] of cases) {
    withRepository({ ...ARCHIVE, [path]: JSON.stringify({ ...SAVED, change: 'second', ...change }) }, (root) => {
      assert.deepEqual(runFindings(['validate'], root, ENVIRONMENT).stderr.split('\n'), [
        `${path}: ${message}`,
        `Review findings: 1 problem(s); ${FORMATS}.`,
      ], name);
    });
  }
});
