import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROUTE_SCHEMA_PATH } from '../scripts/review-route.ts';
import { checklistEffect, formatChecklistEffect, type ArchivedChecklist } from '../scripts/checklist-effect.ts';
import { GIT_ENVIRONMENT, type ChecklistEnvironment } from '../scripts/checklist-environment.ts';
import { CHECKLIST_SCHEMA_PATH, type ChecklistRecord, type Size } from '../scripts/checklist-record.ts';
import { PASS_SCHEMA_PATH, runFindings, SCHEMA_PATH } from '../scripts/findings.ts';
import { VOCABULARY_PATH, type Finding, type Severity } from '../scripts/review-findings.ts';
import { git, NO_GIT } from './checklist-git-fixture.ts';

const RECORD_FILE = 'openspec/changes/archive/x/verification.md';

function found(category: string, severity: Severity, place: 'code' | 'record', pass = 1): Finding {
  return {
    change: 'x',
    pass,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol' },
    session: 's',
    severity,
    category,
    title: 'T',
    file: place === 'code' ? 'scripts/a.ts' : RECORD_FILE,
    outcome: 'fixed',
    resolution: 'R',
  };
}

type Counts = readonly [number, number];

function record(change: string, size: Size | undefined, review: readonly string[], reviewAll: Counts, reviewMedium: Counts,
  records: readonly string[], recordAll: Counts, recordMedium: Counts): ChecklistRecord {
  const share = ([findings, inChecklist]: Counts) => ({ findings, inChecklist });
  const categories = (names: readonly string[]) => names.map((category) => ({ category, count: 1 }));
  return {
    change,
    generatedAt: '2026-10-28T09:30:00.000Z',
    devCommit: 'a'.repeat(40),
    query: { capabilities: [], files: ['scripts/**'], top: 7 },
    ...(size === undefined ? {} : { size }),
    review: { categories: categories(review), baseline: { all: share(reviewAll), mediumOrWorse: share(reviewMedium) } },
    recordQuality: { categories: categories(records), baseline: { all: share(recordAll), mediumOrWorse: share(recordMedium) } },
  };
}

// alpha, size M: review baseline 5 of 10 (50%), >=Medium 1 of 4 (25%);
// record quality baseline 2 of 5 (40%), >=Medium 1 of 2 (50%).
const ALPHA: ArchivedChecklist = {
  change: 'alpha',
  archivedOn: '2026-10-28',
  record: record('alpha', 'M', ['contract-drift', 'naming'], [10, 5], [4, 1], ['evidence-mismatch'], [5, 2], [2, 1]),
  findings: [
    found('contract-drift', 'medium', 'code'),
    found('docs', 'low', 'code'),
    found('naming', 'low', 'code'),
    found('evidence-mismatch', 'low', 'record'),
    found('docs', 'medium', 'record'),
    found('contract-drift', 'high', 'code', 2),
  ],
};

// beta, no size, 400 changed lines: review lists docs, 1 of 4 (25%), no
// Medium or worse baseline; record quality lists nothing, 0 of 5 (0%).
const BETA: ArchivedChecklist = {
  change: 'beta',
  archivedOn: '2026-10-28',
  record: record('beta', undefined, ['docs'], [4, 1], [0, 0], [], [5, 0], [2, 0]),
  findings: [found('docs', 'low', 'code')],
  linesChanged: 400,
};

const DELTA: ArchivedChecklist = {
  change: 'delta',
  archivedOn: '2026-10-29',
  record: record('delta', 'S', ['docs'], [4, 2], [1, 0], ['docs'], [2, 1], [0, 0]),
  findings: [],
};

const observation = (findings: number, inChecklist: number, observed: number | null, expected: number | null) =>
  ({ findings, inChecklist, observed, expected });

test('the effect compares pass-1 findings with each checklist and its baseline', () => {
  const effect = checklistEffect([ALPHA, BETA, DELTA], ['gamma']);
  const [alpha, beta, delta] = effect.changes;
  // alpha: pass 1 has 3 code findings, contract-drift and naming listed:
  // 2/3 = 67% against 50%; the pass 2 finding is left out.
  assert.deepEqual(alpha, {
    change: 'alpha',
    archivedOn: '2026-10-28',
    size: 'M',
    linesChanged: null,
    passOneFindings: 5,
    perSizePoint: 2.5,
    per100Lines: null,
    review: { all: observation(3, 2, 0.67, 0.5), mediumOrWorse: observation(1, 1, 1, 0.25) },
    recordQuality: { all: observation(2, 1, 0.5, 0.4), mediumOrWorse: observation(1, 0, 0, 0.5) },
  });
  // beta: 1 finding per 400 lines is 0.25 per 100 lines; an empty baseline
  // has no expected share.
  assert.deepEqual([beta.passOneFindings, beta.perSizePoint, beta.per100Lines], [1, null, 0.25]);
  assert.deepEqual(beta.review, { all: observation(1, 1, 1, 0.25), mediumOrWorse: observation(0, 0, null, null) });
  assert.deepEqual(beta.recordQuality, { all: observation(0, 0, null, 0), mediumOrWorse: observation(0, 0, null, 0) });
  assert.deepEqual([delta.passOneFindings, delta.perSizePoint, delta.review.all], [0, 0, observation(0, 0, null, 0.5)]);
  assert.deepEqual(effect.noChecklist, ['gamma']);
});

test('the effect aggregates by archive date with findings-weighted expected shares', () => {
  const [day, nextDay] = checklistEffect([ALPHA, BETA, DELTA], []).byDate;
  // Review, all: 3 of 4 listed (75%); expected (3 * 50% + 1 * 25%) / 4 =
  // 43.75%. Size: alpha 5 per 2 points; lines: beta 1 per 400 lines.
  assert.deepEqual(day, {
    archivedOn: '2026-10-28',
    changes: ['alpha', 'beta'],
    passOneFindings: 6,
    perSizePoint: 2.5,
    per100Lines: 0.25,
    review: { all: observation(4, 3, 0.75, 0.44), mediumOrWorse: observation(1, 1, 1, 0.25) },
    recordQuality: { all: observation(2, 1, 0.5, 0.4), mediumOrWorse: observation(1, 0, 0, 0.5) },
  });
  assert.deepEqual(nextDay.review.all, observation(0, 0, null, null));
  assert.deepEqual([nextDay.passOneFindings, nextDay.perSizePoint, nextDay.per100Lines], [0, 0, null]);
});

test('the effect text shows observed against expected per change and per day', () => {
  const lines = formatChecklistEffect(checklistEffect([ALPHA, BETA, DELTA], ['gamma'])).split('\n');
  assert.equal(lines[0], 'Checklist effect over archived changes with checklist.json: 3 change(s); 1 archived change(s) without one are excluded.');
  for (const expected of [
    '2026-10-28 alpha: 5 pass-1 finding(s), size M, 2.50 per size point',
    '  review, all: 2 of 3 listed, 67% observed, 50% expected',
    '  record quality, >=medium: 0 of 1 listed, 0% observed, 50% expected',
    '2026-10-28 beta: 1 pass-1 finding(s), 400 changed lines, 0.25 per 100 changed lines',
    '  review, >=medium: 0 of 0 listed, no findings, no expected share',
    '2026-10-28: 2 change(s), 6 pass-1 finding(s), 2.50 per size point, 0.25 per 100 changed lines',
    '  review, all: 3 of 4 listed, 75% observed, 44% expected',
    'No checklist: gamma',
  ]) {
    assert.ok(lines.includes(expected), expected);
  }
});

test('the effect of no recorded checklist says so', () => {
  const text = formatChecklistEffect(checklistEffect([], ['gamma', 'zeta']));
  assert.match(text, /^Checklist effect over archived changes with checklist\.json: 0 change\(s\); 2 archived change\(s\) without one are excluded\.$/m);
  assert.match(text, /\n\nBy change\nnone\n\nBy archive date\nnone\n\nNo checklist: gamma, zeta$/);
});

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'checklist-effect-'));
  for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH, ROUTE_SCHEMA_PATH]) cpSync(path, join(root, path));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const jsonLines = (findings: readonly Finding[], change: string) =>
  findings.map((finding) => JSON.stringify({ ...finding, change, capability: finding.file.startsWith('scripts/') ? 'review-process' : undefined }))
    .join('\n') + '\n';

test('the effect of a change with zero changed lines has no rate', () => {
  const lines = formatChecklistEffect(checklistEffect([{ ...BETA, linesChanged: 0 }], [])).split('\n');
  assert.ok(lines.includes('2026-10-28 beta: 1 pass-1 finding(s), 0 changed lines, rate unknown'));
});

test('make findings effect keeps archives of a reused change name apart', () => {
  const root = repository({
    'openspec/specs/review-process/spec.md': '',
    'openspec/changes/archive/2026-10-28-alpha/checklist.json': JSON.stringify(ALPHA.record),
    'openspec/changes/archive/2026-10-28-alpha/findings.jsonl': jsonLines(ALPHA.findings.filter(({ pass }) => pass === 1), 'alpha'),
    'openspec/changes/archive/2026-10-30-alpha/checklist.json': JSON.stringify(DELTA.record).replace('"delta"', '"alpha"'),
    'openspec/changes/archive/2026-10-30-alpha/findings.jsonl': jsonLines([found('docs', 'low', 'code')], 'alpha'),
  });
  try {
    const json = JSON.parse(runFindings(['effect', '--json'], root, NO_GIT).stdout) as ReturnType<typeof checklistEffect>;
    assert.deepEqual(json.changes.map(({ archivedOn, passOneFindings }) => [archivedOn, passOneFindings]), [['2026-10-28', 5], ['2026-10-30', 1]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('make findings effect reads archived checklists and asks only for missing sizes', () => {
  const requests: string[] = [];
  const environment: ChecklistEnvironment = {
    ...NO_GIT,
    linesChanged: (_root, directory, devCommit) => {
      requests.push(`${directory} ${devCommit.slice(0, 3)}`);
      return 400;
    },
  };
  const root = repository({
    'openspec/specs/review-process/spec.md': '',
    'openspec/changes/archive/2026-10-28-alpha/checklist.json': JSON.stringify(ALPHA.record),
    'openspec/changes/archive/2026-10-28-alpha/findings.jsonl': jsonLines(ALPHA.findings.filter(({ pass }) => pass === 1), 'alpha'),
    'openspec/changes/archive/2026-10-28-beta/checklist.json': JSON.stringify(BETA.record),
    'openspec/changes/archive/2026-10-28-beta/findings.jsonl': jsonLines(BETA.findings, 'beta'),
    'openspec/changes/archive/2026-10-29-gamma/findings.jsonl': '',
  });
  try {
    const result = runFindings(['effect', '--json'], root, environment);
    assert.equal(result.exitCode, 0, result.stderr);
    const json = JSON.parse(result.stdout) as ReturnType<typeof checklistEffect>;
    assert.deepEqual(json.changes.map(({ change, passOneFindings, per100Lines }) => [change, passOneFindings, per100Lines]),
      [['alpha', 5, null], ['beta', 1, 0.25]]);
    assert.deepEqual(json.noChecklist, ['gamma']);
    assert.deepEqual(requests, ['2026-10-28-beta aaa']);
    assert.match(runFindings(['effect'], root, environment).stdout, /^2026-10-28: 2 change\(s\), 6 pass-1 finding\(s\)/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the git environment finds the dev commit and the lines a change archived', () => {
  const root = mkdtempSync(join(tmpdir(), 'checklist-git-'));
  try {
    git(root, 'init', '--quiet');
    writeFileSync(join(root, 'README.md'), 'base\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD');
    git(root, 'update-ref', 'refs/remotes/origin/dev', base);
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/x.ts'), 'one\ntwo\nthree\n');
    writeFileSync(join(root, 'README.md'), 'changed\n');
    const archive = 'openspec/changes/archive/2026-10-28-x';
    mkdirSync(join(root, archive), { recursive: true });
    writeFileSync(join(root, archive, 'checklist.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'archive');
    assert.equal(GIT_ENVIRONMENT.devCommit(root), base);
    // 3 added lines and README's 1 removed and 1 added; records excluded.
    assert.equal(GIT_ENVIRONMENT.linesChanged(root, '2026-10-28-x', base), 5);
    assert.equal(GIT_ENVIRONMENT.linesChanged(root, '2026-10-28-none', base), undefined);
    assert.equal(GIT_ENVIRONMENT.linesChanged(root, '2026-10-28-x', 'f'.repeat(40)), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
