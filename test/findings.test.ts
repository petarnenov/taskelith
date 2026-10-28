import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_TOP, PASS_SCHEMA_PATH, parseCommand, runFindings, SCHEMA_PATH, splitList, UsageError, USAGE } from '../scripts/findings.ts';
import { matchesQuery, VOCABULARY_PATH, type Finding } from '../scripts/review-findings.ts';
import { CHECKLIST_SCHEMA_PATH } from '../scripts/checklist-record.ts';
import { NO_GIT } from './checklist-git-fixture.ts';

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

const NO_COUNTS = { critical: 0, high: 0, medium: 0, low: 0 };

function summary(change: string, pass: number, counts: Partial<typeof NO_COUNTS> = {}, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    change,
    pass,
    role: pass === 2 ? 'B' : 'A',
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: 'session-1',
    counts: { ...NO_COUNTS, ...counts },
    ...extra,
  });
}

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'findings-'));
  for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH]) cpSync(path, join(root, path));
  mkdirSync(join(root, 'openspec/changes/archive/2026-10-01-old-change'), { recursive: true });
  mkdirSync(join(root, 'openspec/specs/review-process'), { recursive: true });
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
  'openspec/changes/active-change/passes.jsonl': '',
};

const FORMATS = `the formats are ${SCHEMA_PATH} and ${PASS_SCHEMA_PATH}`;

test('commands and their options parse, and misuse is a usage error', () => {
  assert.deepEqual(parseCommand(['validate']), { name: 'validate' });
  assert.deepEqual(parseCommand(['index', '--json']), { name: 'index', json: true });
  assert.deepEqual(parseCommand(['reviewers']), { name: 'reviewers', json: false });
  assert.deepEqual(parseCommand(['reviewers', '--json']), { name: 'reviewers', json: true });
  assert.deepEqual(parseCommand(['checklist', '--capability', 'a,b', '--capability', 'c', '--files', 'x/**,{y,z}.ts', '--top', '3']), {
    name: 'checklist',
    query: { capabilities: ['a', 'b', 'c'], files: ['x/**', '{y,z}.ts'], top: 3 },
    json: false,
  });
  assert.equal((parseCommand(['checklist']) as { query: { top: number } }).query.top, DEFAULT_TOP);
  for (const args of [[], ['nope'], ['validate', 'extra'], ['validate', '--json'], ['checklist', '--top', '0'], ['checklist', '--top', '11'], ['index', '--unknown'], ['reviewers', '--top', '3']]) {
    assert.throws(() => parseCommand(args), UsageError, args.join(' '));
  }
});

test('a nested brace glob from the command line matches as one glob', () => {
  const command = parseCommand(['checklist', '--files', 'src/{a,{b,c}}.ts,docs/**']);
  assert.ok(command.name === 'checklist');
  assert.deepEqual(command.query.files, ['src/{a,{b,c}}.ts', 'docs/**']);
  const of = (file: string) => ({ file } as Finding);
  assert.equal(matchesQuery(of('src/c.ts'), command.query), true);
  assert.equal(matchesQuery(of('docs/x.md'), command.query), true);
  assert.equal(matchesQuery(of('src/d.ts'), command.query), false);
});

test('a character class glob from the command line stays whole and matches', () => {
  const command = parseCommand(['checklist', '--files', 'scripts/[a,b]*.ts,docs/**']);
  assert.ok(command.name === 'checklist');
  assert.deepEqual(command.query.files, ['scripts/[a,b]*.ts', 'docs/**']);
  const of = (file: string) => ({ file } as Finding);
  assert.equal(matchesQuery(of('scripts/archive.ts'), command.query), true);
  assert.equal(matchesQuery(of('scripts/,x.ts'), command.query), true);
  assert.equal(matchesQuery(of('docs/x.md'), command.query), true);
  assert.equal(matchesQuery(of('scripts/check.ts'), command.query), false);
});

test('a list splits at commas outside braces and drops empty items', () => {
  assert.deepEqual(splitList(' a, ,b/{c,d}/**,'), ['a', 'b/{c,d}/**']);
  assert.deepEqual(splitList('src/{a,{b,c}}.ts,docs/**'), ['src/{a,{b,c}}.ts', 'docs/**']);
  assert.deepEqual(splitList('a},b'), ['a}', 'b']);
  assert.deepEqual(splitList('[],x],{a,[}]},y'), ['[],x]', '{a,[}]}', 'y']);
  assert.deepEqual(splitList('[!,]a,b'), ['[!,]a', 'b']);
  assert.deepEqual(splitList('a[,b'), ['a[', 'b']);
});

test('validate passes on valid files, empty active files, and archives without a file', () => {
  const root = repository(ARCHIVED);
  try {
    const stdout = 'Every findings file is valid: 3 file(s); every pass summary file is valid: 1 file(s).';
    assert.deepEqual(runFindings(['validate'], root, NO_GIT), { exitCode: 0, stdout, stderr: '' });
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
    const result = runFindings(['validate'], root, NO_GIT);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.stderr.split('\n'), [
      'openspec/changes/no-file/findings.jsonl: missing; an active change records its findings here, empty if none',
      'openspec/changes/no-file/passes.jsonl: missing; an active change records a summary of each review pass here, empty if none',
      `openspec/changes/archive/2026-10-02-first/findings.jsonl:1: unknown category "unknown-kind"; categories are listed in ${VOCABULARY_PATH}`,
      `Review findings: 3 problem(s); ${FORMATS}.`,
    ]);
    assert.equal(runFindings(['index'], root, NO_GIT).stderr.split('\n').length, 2, 'index ignores a missing active file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate requires an existing capability only for active code findings', () => {
  const outside = { file: 'scripts/x.ts', capability: undefined };
  const root = repository({
    'openspec/changes/archive/2026-10-02-first/findings.jsonl': `${line('first', 'docs', 'Old', outside)}\n`,
    'openspec/changes/active-change/findings.jsonl': [
      line('active-change', 'docs', 'No capability', outside),
      line('active-change', 'docs', 'Unknown capability', { capability: 'not-a-spec' }),
      line('active-change', 'docs', 'Record', { file: 'openspec/changes/active-change/verification.md', capability: undefined }),
    ].join('\n') + '\n',
    'openspec/changes/active-change/passes.jsonl': `${summary('active-change', 1, { low: 3 })}\n`,
  });
  try {
    const path = 'openspec/changes/active-change/findings.jsonl';
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${path}:1: capability is required outside openspec/changes/; name the closest one under openspec/specs`,
      `${path}:2: unknown capability "not-a-spec"; capabilities are the directories under openspec/specs`,
      `Review findings: 2 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('index and checklist read only archived findings', () => {
  const root = repository({
    ...ARCHIVED,
    'openspec/changes/active-change/findings.jsonl': `${line('active-change', 'scope', 'Active only')}\n`,
    'openspec/changes/active-change/passes.jsonl': `${summary('active-change', 1, { low: 1 })}\n`,
  });
  try {
    const index = runFindings(['index'], root, NO_GIT);
    assert.equal(index.exitCode, 0);
    assert.match(index.stdout, /^Archived review findings: 3 \(fixed 2, declined 1, other 0\)\./);
    assert.doesNotMatch(index.stdout, /scope/);
    const json = JSON.parse(runFindings(['index', '--json'], root, NO_GIT).stdout) as { category: { key: string }[] };
    assert.deepEqual(json.category.map(({ key }) => key), ['stale-citation', 'docs']);
    const list = runFindings(['checklist', '--capability', 'review-process', '--top', '5'], root, NO_GIT);
    assert.equal(list.exitCode, 0);
    assert.match(list.stdout, /\n1\. stale-citation \(2\): .+ Example: "New citation"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every checklist ends with the record quality of archived findings', () => {
  const record = { file: 'openspec/changes/archive/2026-10-04-third/verification.md', capability: undefined };
  const root = repository({
    ...ARCHIVED,
    'openspec/changes/archive/2026-10-04-third/findings.jsonl': `${line('third', 'evidence-mismatch', 'Wrong count', record)}\n`,
  });
  try {
    const section = 'Record quality (archived findings under openspec/changes/), most frequent finding categories first:\n'
      + '1. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "Wrong count"';
    for (const args of [[], ['--capability', 'review-process'], ['--files', 'docs/**'], ['--capability', 'none', '--files', 'none/**']]) {
      const { exitCode, stdout } = runFindings(['checklist', ...args], root, NO_GIT);
      assert.equal(exitCode, 0, args.join(' '));
      assert.ok(stdout.endsWith(`\n\n${section}`), args.join(' '));
    }
    assert.match(runFindings(['checklist', '--files', 'docs/**'], root, NO_GIT).stdout, /^Review checklist \(files docs\/\*\*\), most frequent finding categories first:\n1\. docs \(1\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate checks pass summaries against the findings of their change', () => {
  const active = 'openspec/changes/active-change';
  const root = repository({
    [`${active}/findings.jsonl`]: [
      line('active-change', 'docs', 'Counted', { severity: 'medium' }),
      line('active-change', 'docs', 'Unsummarized pass', { pass: 2 }),
      line('active-change', 'docs', 'Other session', { session: 'session-9' }),
    ].join('\n') + '\n',
    [`${active}/passes.jsonl`]: `${summary('active-change', 1, { medium: 2 })}\n`,
  });
  try {
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${active}/findings.jsonl:2: pass 2 has no summary in passes.jsonl`,
      `${active}/findings.jsonl:3: reviewer or session differs from the summary of pass 1 in passes.jsonl`,
      `${active}/passes.jsonl:1: counts of pass 1 differ from its lines in findings.jsonl: medium 2 here, 1 there, low 0 here, 1 there`,
      `Review findings: 3 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a broken line is reported once, without the cross-file checks', () => {
  const active = 'openspec/changes/active-change';
  const root = repository({
    [`${active}/findings.jsonl`]: `${line('active-change', 'docs', 'Pass 1')}\n`,
    [`${active}/passes.jsonl`]: `${summary('active-change', 1, {}, { role: 'C' })}\n`,
  });
  try {
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${active}/passes.jsonl:1: /role must be equal to one of the allowed values`,
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate checks missedBy against the summary of the missed pass', () => {
  const active = 'openspec/changes/active-change';
  const root = repository({
    [`${active}/findings.jsonl`]: [
      line('active-change', 'docs', 'Missed by A', { pass: 2, missedBy: { pass: 1, role: 'A' } }),
      line('active-change', 'docs', 'Wrong role', { pass: 2, missedBy: { pass: 1, role: 'B' } }),
      line('active-change', 'docs', 'Integration', { pass: 2, missedBy: 'integration' }),
    ].join('\n') + '\n',
    [`${active}/passes.jsonl`]: `${summary('active-change', 1)}\n${summary('active-change', 2, { low: 3 })}\n`,
  });
  try {
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${active}/findings.jsonl:2: missedBy role B is not role A of pass 1 in passes.jsonl`,
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate keys pass summaries by artifact and pass', () => {
  const active = 'openspec/changes/active-change';
  const root = repository({
    [`${active}/findings.jsonl`]: [
      line('active-change', 'docs', 'Of x', { artifact: 'x' }),
      line('active-change', 'docs', 'Missed by x', { artifact: 'y', pass: 2, missedBy: { pass: 1, role: 'A' } }),
    ].join('\n') + '\n',
    [`${active}/passes.jsonl`]: [
      summary('active-change', 1, { low: 1 }, { artifact: 'x' }),
      summary('active-change', 2, { low: 1 }, { artifact: 'y' }),
      summary('active-change', 2, {}, { artifact: 'y' }),
    ].join('\n') + '\n',
  });
  try {
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${active}/passes.jsonl:3: pass 2 of artifact "y" is already summarized on line 2`,
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
    const passes = `${summary('active-change', 1, { low: 1 }, { artifact: 'x' })}\n${summary('active-change', 2, { low: 1 }, { artifact: 'y' })}\n`;
    writeFileSync(join(root, active, 'passes.jsonl'), passes);
    assert.deepEqual(runFindings(['validate'], root, NO_GIT).stderr.split('\n'), [
      `${active}/findings.jsonl:2: missedBy pass 1 of artifact "y" has no summary in passes.jsonl`,
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const STATISTICS_ARCHIVE = {
  'openspec/changes/archive/2026-10-05-summarized/findings.jsonl': [
    line('summarized', 'docs', 'Medium of pass 2', { pass: 2, severity: 'medium', reviewer: { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' }, missedBy: { pass: 1, role: 'A' } }),
  ].join('\n') + '\n',
  'openspec/changes/archive/2026-10-05-summarized/passes.jsonl': [
    summary('summarized', 1),
    summary('summarized', 2, { medium: 1 }, { reviewer: { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' } }),
  ].join('\n') + '\n',
};

test('reviewers counts summarized passes, also without findings, and misses', () => {
  const root = repository(STATISTICS_ARCHIVE);
  try {
    const { exitCode, stdout } = runFindings(['reviewers'], root, NO_GIT);
    assert.equal(exitCode, 0);
    const lines = stdout.split('\n');
    assert.equal(lines[0], 'Reviewer statistics of archived changes: 1 change(s) with review records, 2 pass(es).');
    assert.equal(lines[4], 'Every archived change with review records has passes.jsonl; each of its passes is counted.');
    const cells = (...values: string[]) => values.map((value) => value.padStart(10)).join('');
    assert.ok(lines.includes(`${cells('1', '0', '0', '1', '0', '1.00', '100%', '0')}  claude claude-opus-5-5#high`));
    assert.ok(lines.includes(`${cells('1', '0', '0', '0', '0', '0.00', '0%', '1')}  codex gpt-6.1-sol#medium`));
    assert.ok(lines.includes(`${cells('1', '0', '0', '0', '0', '0.00', '0%', '1')}  A`));
    assert.ok(lines.includes(`${cells('1', '0', '0', '1', '0', '1.00', '100%', '0')}  B`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reviewers derives the passes of archives without summaries and says so', () => {
  const root = repository({ ...ARCHIVED, ...STATISTICS_ARCHIVE });
  try {
    const text = runFindings(['reviewers'], root, NO_GIT).stdout;
    assert.match(text, /^Reviewer statistics of archived changes: 3 change\(s\) with review records, 4 pass\(es\)\.$/m);
    assert.match(text, /^2 archived change\(s\) have findings\.jsonl but no passes\.jsonl\. A change without passes\.jsonl counts only its passes with findings, derived from findings\.jsonl, with role \(unknown\)\.$/m);
    const json = JSON.parse(runFindings(['reviewers', '--json'], root, NO_GIT).stdout) as {
      changes: number;
      unrecordedChanges: number;
      derivedChanges: string[];
      note: string;
      roles: { key: string; passes: number }[];
    };
    assert.deepEqual([json.changes, json.unrecordedChanges], [3, 1]);
    assert.deepEqual(json.derivedChanges, ['first', 'second']);
    assert.match(json.note, /counts only its passes with findings/);
    assert.deepEqual(json.roles.map(({ key, passes }) => [key, passes]), [['A', 1], ['B', 1], ['(unknown)', 2]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pass summaries without findings.jsonl are checked against no findings', () => {
  const archived = 'openspec/changes/archive/2026-10-07-summaries-only';
  const root = repository({ [`${archived}/passes.jsonl`]: `${summary('summaries-only', 1, { low: 2 })}\n` });
  try {
    assert.deepEqual(runFindings(['reviewers'], root, NO_GIT).stderr.split('\n'), [
      `${archived}/passes.jsonl:1: counts of pass 1 differ from its lines in findings.jsonl: low 2 here, 0 there`,
      `Review findings: 1 problem(s); ${FORMATS}.`,
    ]);
    writeFileSync(join(root, archived, 'passes.jsonl'), `${summary('summaries-only', 1)}\n`);
    assert.match(runFindings(['reviewers'], root, NO_GIT).stdout, /^Reviewer statistics of archived changes: 1 change\(s\) with review records, 1 pass\(es\)\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reviewers names the archived changes without any review record', () => {
  const root = repository({ 'openspec/changes/archive/2026-10-06-no-records/proposal.md': '# Proposal\n' });
  try {
    const { exitCode, stdout } = runFindings(['reviewers'], root, NO_GIT);
    assert.equal(exitCode, 0);
    assert.match(stdout, /^Reviewer statistics of archived changes: 0 change\(s\) with review records, 0 pass\(es\)\.\n\n/);
    assert.match(stdout, /^2 archived change\(s\) have neither findings\.jsonl nor passes\.jsonl and are not counted\.$/m);
    const json = JSON.parse(runFindings(['reviewers', '--json'], root, NO_GIT).stdout) as { changes: number; unrecordedChanges: number };
    assert.deepEqual([json.changes, json.unrecordedChanges], [0, 2]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reviewers leaves active changes out and fails on invalid records', () => {
  const active = 'openspec/changes/active-change';
  const root = repository({
    ...STATISTICS_ARCHIVE,
    [`${active}/findings.jsonl`]: `${line('active-change', 'docs', 'Active')}\n`,
    [`${active}/passes.jsonl`]: `${summary('active-change', 1, { low: 1 })}\n`,
  });
  try {
    assert.match(runFindings(['reviewers'], root, NO_GIT).stdout, /^Reviewer statistics of archived changes: 1 change\(s\) with review records, 2 pass\(es\)\./);
    writeFileSync(join(root, active, 'passes.jsonl'), `${summary('active-change', 1)}\n`);
    assert.equal(runFindings(['reviewers'], root, NO_GIT).exitCode, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate rejects a non-canonical reviewer key of an active change by file and line', () => {
  const cases = {
    'claude-code': { harness: 'claude-code', model: 'claude-opus-5-5', variant: 'high' },
    'no-provider': { harness: 'opencode', model: 'kimi-k2.7-code' },
    'with-provider': { harness: 'codex', model: 'openai/gpt-6.1-sol', variant: 'medium' },
  };
  const files = Object.entries(cases).flatMap(([change, reviewer]) => [
    [`openspec/changes/${change}/findings.jsonl`, `${line(change, 'docs', 'Finding', { reviewer })}\n`],
    [`openspec/changes/${change}/passes.jsonl`, `${summary(change, 1, { low: 1 }, { reviewer })}\n`],
  ]);
  const root = repository(Object.fromEntries(files));
  const rejected = (file: string, key: string, reason: string) => `${file}:1: reviewer "${key}" is not canonical: ${reason}`;
  const harness = 'harness "claude-code" is none of claude, codex, opencode, agy';
  const provider = 'an OpenCode model names its provider as its CLI takes it, for example opencode-go/kimi-k2.7-code';
  const variant = 'variant is missing; record the effort, "default" when the harness default ran';
  const prefixed = 'only an OpenCode model has a provider prefix; name the model as the codex CLI takes it';
  try {
    const result = runFindings(['validate'], root);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.stderr.split('\n'), [
      rejected('openspec/changes/claude-code/findings.jsonl', 'claude-code claude-opus-5-5#high', harness),
      rejected('openspec/changes/claude-code/passes.jsonl', 'claude-code claude-opus-5-5#high', harness),
      rejected('openspec/changes/no-provider/findings.jsonl', 'opencode kimi-k2.7-code', provider),
      rejected('openspec/changes/no-provider/findings.jsonl', 'opencode kimi-k2.7-code', variant),
      rejected('openspec/changes/no-provider/passes.jsonl', 'opencode kimi-k2.7-code', provider),
      rejected('openspec/changes/no-provider/passes.jsonl', 'opencode kimi-k2.7-code', variant),
      rejected('openspec/changes/with-provider/findings.jsonl', 'codex openai/gpt-6.1-sol#medium', prefixed),
      rejected('openspec/changes/with-provider/passes.jsonl', 'codex openai/gpt-6.1-sol#medium', prefixed),
      `Review findings: 8 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate accepts canonical reviewer keys in active changes and legacy ones in archives', () => {
  const canonical = [
    { harness: 'claude', model: 'claude-fable-5-1', variant: 'medium' },
    { harness: 'opencode', model: 'opencode-go/kimi-k2.7-code', variant: 'default' },
    { harness: 'agy', model: 'gemini-4-argon-medium', variant: 'medium' },
  ];
  const active = canonical.flatMap((reviewer, index) => [
    [`openspec/changes/active-${index}/findings.jsonl`, `${line(`active-${index}`, 'docs', 'Finding', { reviewer })}\n`],
    [`openspec/changes/active-${index}/passes.jsonl`, `${summary(`active-${index}`, 1, { low: 1 }, { reviewer })}\n`],
  ]);
  const legacy = { harness: 'claude-code', model: 'claude-opus-5-5' };
  const root = repository({
    ...Object.fromEntries(active),
    'openspec/changes/archive/2026-10-08-legacy/findings.jsonl': `${line('legacy', 'docs', 'Old', { reviewer: legacy })}\n`,
    'openspec/changes/archive/2026-10-08-legacy/passes.jsonl': `${summary('legacy', 1, { low: 1 }, { reviewer: legacy })}\n`,
  });
  try {
    assert.equal(runFindings(['validate'], root).exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate rejects an OpenCode model with an empty part only in active changes', () => {
  const reviewer = { harness: 'opencode', model: 'opencode-go/', variant: 'default' };
  const records = (directory: string, change: string) => ({
    [`${directory}/findings.jsonl`]: `${line(change, 'docs', 'Finding', { reviewer })}\n`,
    [`${directory}/passes.jsonl`]: `${summary(change, 1, { low: 1 }, { reviewer })}\n`,
  });
  const archived = repository(records('openspec/changes/archive/2026-10-10-empty-model', 'empty-model'));
  const active = repository(records('openspec/changes/empty-model', 'empty-model'));
  const reason = 'reviewer "opencode opencode-go/#default" is not canonical: '
    + 'an OpenCode model is <provider>/<model>, both parts non-empty';
  try {
    assert.equal(runFindings(['validate'], archived).exitCode, 0);
    assert.deepEqual(runFindings(['validate'], active).stderr.split('\n'), [
      `openspec/changes/empty-model/findings.jsonl:1: ${reason}`,
      `openspec/changes/empty-model/passes.jsonl:1: ${reason}`,
      `Review findings: 2 problem(s); ${FORMATS}.`,
    ]);
  } finally {
    rmSync(archived, { recursive: true, force: true });
    rmSync(active, { recursive: true, force: true });
  }
});

const OPUS = { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' };
const KIMI_K2_7_CODE = { harness: 'opencode', model: 'opencode-go/kimi-k2.7-code', variant: 'default' };

const LEGACY_SPELLINGS = [
  { legacy: { harness: 'claude-code', model: 'claude-opus-5-5', variant: 'high' }, canonical: OPUS },
  { legacy: { harness: 'opencode', model: 'kimi-k2.7-code', variant: 'default' }, canonical: KIMI_K2_7_CODE },
  { legacy: { harness: 'opencode', model: 'opencode-go/kimi-k2.7-code' }, canonical: KIMI_K2_7_CODE },
];

for (const { legacy, canonical } of LEGACY_SPELLINGS) {
  const spelling = `${legacy.harness} ${legacy.model}${'variant' in legacy ? `#${legacy.variant}` : ''}`;
  test(`reviewers and index count the archived spelling "${spelling}" as its canonical reviewer`, () => {
    const records = (change: string, reviewer: object) => ({
      [`openspec/changes/archive/2026-10-09-${change}/findings.jsonl`]: `${line(change, 'docs', 'Finding', { reviewer })}\n`,
      [`openspec/changes/archive/2026-10-09-${change}/passes.jsonl`]: `${summary(change, 1, { low: 1 }, { reviewer })}\n`,
    });
    const files = { ...records('legacy', legacy), ...records('canonical', canonical) };
    const root = repository(files);
    const key = `${canonical.harness} ${canonical.model}#${canonical.variant}`;
    try {
      assert.equal(runFindings(['validate'], root).exitCode, 0);
      const statistics = JSON.parse(runFindings(['reviewers', '--json'], root).stdout) as { reviewers: { key: string; passes: number }[] };
      assert.deepEqual(statistics.reviewers.map(({ key, passes }) => [key, passes]), [[key, 2]]);
      const index = JSON.parse(runFindings(['index', '--json'], root).stdout) as { reviewer: { key: string; total: number }[] };
      assert.deepEqual(index.reviewer.map(({ key, total }) => [key, total]), [[key, 2]]);
      for (const [path, text] of Object.entries(files)) assert.equal(readFileSync(join(root, path), 'utf8'), text, path);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('a usage error prints the usage and exits with 2', () => {
  const result = runFindings(['checklist', '--top', 'many'], '/nonexistent', NO_GIT);
  assert.deepEqual(result, { exitCode: 2, stdout: '', stderr: `--top must be 1 to 10\n${USAGE}` });
});

test('make findings passes a glob through without shell expansion', () => {
  const output = execFileSync('make', ['--no-print-directory', 'findings', 'ARGS=checklist --files scripts/*.ts --top 3'], { encoding: 'utf8' });
  assert.match(output, /^Review checklist \(files scripts\/\*\.ts\)/);
});

test('the npm script validates this repository', () => {
  const output = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/findings.ts', 'validate'], { encoding: 'utf8' });
  assert.match(output, /^Every findings file is valid: \d+ file\(s\); every pass summary file is valid: \d+ file\(s\)\.\n$/);
});
