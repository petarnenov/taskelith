import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ajvSchemaCheck, SCHEMA_PATH } from '../scripts/findings.ts';
import {
  changeOfDirectory,
  checklist,
  findingsIndex,
  formatChecklist,
  formatIndex,
  formatProblem,
  MAX_LINE_BYTES,
  matchesQuery,
  parseFindings,
  parseVocabulary,
  reviewerKey,
  secretLikeStrings,
  VOCABULARY_PATH,
  type Finding,
} from '../scripts/review-findings.ts';

const checkSchema = ajvSchemaCheck(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object);
const vocabulary = parseVocabulary(readFileSync(VOCABULARY_PATH, 'utf8'));
const rules = { checkSchema, categories: new Set(vocabulary.categories.map(({ id }) => id)) };

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    change: 'demo-change',
    pass: 1,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: '01a17a52-073b-71c1-89a0-9d74b6b43624',
    severity: 'medium',
    category: 'stale-citation',
    title: 'verification.md cites an outdated line',
    file: 'openspec/changes/demo-change/verification.md',
    line: 12,
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'The citation now names the current line.',
    commit: 'b95ebe7',
    ...overrides,
  };
}

function parseLines(lines: readonly string[], change = 'demo-change') {
  return parseFindings({ path: 'findings.jsonl', change, text: lines.map((line) => `${line}\n`).join('') }, rules);
}

function messagesOf(lines: readonly string[]): string[] {
  return parseLines(lines).problems.map(formatProblem);
}

const SEEDED_CATEGORIES = [
  'stale-citation', 'evidence-mismatch', 'contract-drift', 'spec-wording', 'requirement-length',
  'missing-fail-before-test', 'test-flakiness', 'clock-mixing', 'concurrency-race', 'error-handling',
  'redaction', 'scope', 'naming', 'docs', 'process',
];

test('the vocabulary parses without problems and holds the seeded categories', () => {
  assert.deepEqual(vocabulary.problems, []);
  const ids = vocabulary.categories.map(({ id }) => id);
  for (const seeded of SEEDED_CATEGORIES) assert.ok(ids.includes(seeded), seeded);
});

test('one added vocabulary line admits a finding with the new category', () => {
  const known = new Set(vocabulary.categories.map(({ id }) => id));
  let added = 'added-category';
  for (let suffix = 1; known.has(added); suffix += 1) added = `added-category-${suffix}`;
  const text = `${readFileSync(VOCABULARY_PATH, 'utf8')}${added} A category added by this test.\n`;
  const extended = parseVocabulary(text);
  assert.deepEqual(extended.problems, []);
  const extendedRules = { checkSchema, categories: new Set(extended.categories.map(({ id }) => id)) };
  const source = { path: 'findings.jsonl', change: 'demo-change', text: `${JSON.stringify(finding({ category: added }))}\n` };
  assert.deepEqual(parseFindings(source, extendedRules).problems, []);
  assert.equal(parseFindings(source, rules).problems.length, 1);
});

test('a category id may have 64 characters but not 65', () => {
  const id = (length: number) => `a${'b'.repeat(length - 1)}`;
  const { categories, problems } = parseVocabulary(`${id(64)} Long.\n${id(65)} Too long.\n`);
  assert.deepEqual(categories.map((category) => category.id.length), [64]);
  assert.deepEqual(problems.map(formatProblem), [`${VOCABULARY_PATH}:2: category id is 65 characters (max 64)`]);
});

test('a vocabulary line needs an id and a description, and ids are unique', () => {
  const { categories, problems } = parseVocabulary('# comment\n\nscope A.\nscope Again.\nBad Id here\nlonely\n');
  assert.deepEqual(categories, [{ id: 'scope', description: 'A.' }]);
  assert.deepEqual(problems.map(formatProblem), [
    `${VOCABULARY_PATH}:4: duplicate category "scope"`,
    `${VOCABULARY_PATH}:5: expected "<category-id> <description>"`,
    `${VOCABULARY_PATH}:6: expected "<category-id> <description>"`,
  ]);
});

test('an empty file records no findings and no problems', () => {
  assert.deepEqual(parseFindings({ path: 'f', change: 'demo-change', text: '' }, rules), { findings: [], problems: [] });
});

test('a valid line becomes a finding, with optional fields omitted', () => {
  const minimal = { ...finding() } as Record<string, unknown>;
  delete minimal.line;
  delete minimal.capability;
  delete minimal.commit;
  minimal.reviewer = { harness: 'opencode', model: 'opencode-go/kimi-k3.1-pro' };
  const parsed = parseLines([JSON.stringify(finding()), JSON.stringify(minimal)]);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.findings, [finding(), minimal]);
});

test('every problem names the file and line', () => {
  assert.deepEqual(messagesOf(['{', '', '[]']), [
    'findings.jsonl:1: not a JSON value',
    'findings.jsonl:2: empty line; a change without findings has an empty file',
    'findings.jsonl:3: / must be object',
  ]);
});

const TOKEN = `ghp_${'a'.repeat(36)}`;

test('no diagnostic repeats a token from the input', () => {
  const lines = [
    `{"title": "${TOKEN}`,
    `{"title": ${TOKEN}}`,
    JSON.stringify({ ...finding(), [TOKEN]: 'x' }),
    JSON.stringify({ ...finding(), [`unknown_${'b'.repeat(10)}`]: 'x' }),
    JSON.stringify({ ...finding(), title: 7, resolution: `Removed ${TOKEN}.`, extra: TOKEN }),
  ];
  const messages = messagesOf(lines);
  assert.deepEqual(messages, [
    'findings.jsonl:1: not a JSON value',
    'findings.jsonl:2: not a JSON value',
    'findings.jsonl:3: holds a secret-like value; describe it instead',
    'findings.jsonl:4: / must NOT have additional properties',
    'findings.jsonl:5: holds a secret-like value; describe it instead',
  ]);
  for (const message of messages) assert.ok(!message.includes(TOKEN) && !message.includes('unknown_'), message);
});

test('unknown properties, missing fields, and wrong enums are rejected', () => {
  const unknown = { ...finding(), reviewerText: 'pasted' };
  const { title: _title, ...untitled } = finding();
  const messages = messagesOf([JSON.stringify(unknown), JSON.stringify(untitled), JSON.stringify(finding({ outcome: 'won' as never }))]);
  assert.deepEqual(messages, [
    'findings.jsonl:1: / must NOT have additional properties',
    "findings.jsonl:2: / must have required property 'title'",
    'findings.jsonl:3: /outcome must be equal to one of the allowed values',
  ]);
});

test('strings are bounded and single-line, and paths stay inside the repository', () => {
  const messages = messagesOf([
    JSON.stringify(finding({ title: 'x'.repeat(301) })),
    JSON.stringify(finding({ resolution: 'two\nlines' })),
    JSON.stringify(finding({ file: '../outside.ts' })),
    JSON.stringify(finding({ file: '/etc/passwd' })),
  ]);
  assert.equal(messages.length, 4);
  assert.match(messages[0], /:1: \/title must NOT have more than 300 characters/);
  assert.match(messages[1], /:2: \/resolution must match pattern/);
  assert.match(messages[2], /:3: \/file must match pattern/);
  assert.match(messages[3], /:4: \/file must match pattern/);
});

test('title and resolution reject C1 controls and Unicode line separators', () => {
  for (const character of ['\u0085', '\u009b', '\u2028', '\u2029', '\u007f']) {
    const messages = messagesOf([JSON.stringify(finding({ title: `a${character}b` })), JSON.stringify(finding({ resolution: `a${character}b` }))]);
    assert.equal(messages.length, 2, JSON.stringify(character));
    assert.match(messages[0], /:1: \/title must match pattern/);
    assert.match(messages[1], /:2: \/resolution must match pattern/);
  }
  assert.deepEqual(messagesOf([JSON.stringify(finding({ title: 'Ünïcödé — fine', resolution: 'a\u00a0b' }))]), []);
});

test('a line over the size bound is rejected before parsing', () => {
  const long = JSON.stringify(finding({ title: 'é'.repeat(MAX_LINE_BYTES / 2) }));
  assert.deepEqual(messagesOf([long]), [`findings.jsonl:1: line is ${Buffer.byteLength(long)} bytes (max ${MAX_LINE_BYTES})`]);
});

test('the category comes from the vocabulary and the change from the directory', () => {
  const messages = messagesOf([JSON.stringify(finding({ category: 'made-up' })), JSON.stringify(finding({ change: 'other-change' }))]);
  assert.deepEqual(messages, [
    `findings.jsonl:1: unknown category "made-up"; categories are listed in ${VOCABULARY_PATH}`,
    'findings.jsonl:2: change "other-change" is not this file\'s change "demo-change"',
  ]);
});

test('secret-like values are rejected wherever they appear', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  assert.deepEqual(messagesOf([JSON.stringify(finding({ resolution: `Removed ${token}.` }))]), [
    'findings.jsonl:1: holds a secret-like value; describe it instead',
  ]);
  const samples = [
    `tkop_${'b'.repeat(43)}`, 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl', '-----BEGIN OPENSSH PRIVATE KEY-----',
    `SU${'A'.repeat(56)}`, 'AKIAABCDEFGHIJKLMNOP', 'ASIAABCDEFGHIJKLMNOP', 'xoxb-1234567890-abc',
    `sk-${'c'.repeat(24)}`, 'postgres://owner:p4ss@db:5432/taskelith', 'https://my-secret-token@example.com',
    `github_pat_${'d'.repeat(30)}`,
  ];
  for (const sample of samples) assert.deepEqual(secretLikeStrings({ nested: [sample] }), [sample], sample);
  assert.deepEqual(secretLikeStrings({ [token]: 1 }), [token]);
  assert.deepEqual(secretLikeStrings(finding()), []);
  const plain = [null, 3, true, 'https://example.com/a@b', 'https://example.com/?to=a@b', 'mail a@b.c', 'ASIA1234'];
  assert.deepEqual(secretLikeStrings(plain), []);
});

test('NATS operator, account, user, server, cluster, and curve seeds are rejected', () => {
  const seed = (prefix: string) => `S${prefix}${'A'.repeat(56)}`;
  const lines = ['O', 'A', 'U', 'N', 'C', 'X'].map((prefix) => JSON.stringify(finding({ resolution: `Removed ${seed(prefix)}.` })));
  const messages = messagesOf(lines);
  assert.deepEqual(messages, lines.map((_, index) => `findings.jsonl:${index + 1}: holds a secret-like value; describe it instead`));
  for (const message of messages) assert.ok(!message.includes('A'.repeat(56)), message);
  assert.deepEqual(messagesOf([JSON.stringify(finding({ resolution: `Kept S${'A'.repeat(20)}.` }))]), []);
});

test('an archived directory name drops its date prefix', () => {
  assert.equal(changeOfDirectory('2026-10-27-record-review-findings'), 'record-review-findings');
  assert.equal(changeOfDirectory('record-review-findings'), 'record-review-findings');
});

const archive: Finding[] = [
  finding({ title: 'Old citation', outcome: 'fixed' }),
  finding({ title: 'Newest citation', outcome: 'declined', file: 'scripts/a.ts', capability: undefined }),
  finding({ category: 'docs', title: 'Missing doc', outcome: 'fixed-unreviewed', reviewer: { harness: 'claude', model: 'claude-opus-5-5' } }),
  finding({ category: 'scope', title: 'Out of scope', outcome: 'deferred', capability: 'agent-task-protocol', file: 'docs/x.md' }),
  finding({ category: 'docs', title: 'Accepted doc gap', outcome: 'owner-accepted', capability: 'agent-task-protocol', file: 'docs/x.md' }),
];

test('the index tallies each dimension with fixed, declined, and other outcomes', () => {
  const index = findingsIndex(archive);
  assert.deepEqual(index.all, [{ key: 'all', total: 5, fixed: 2, declined: 1, other: 2 }]);
  assert.deepEqual(index.category, [
    { key: 'docs', total: 2, fixed: 1, declined: 0, other: 1 },
    { key: 'stale-citation', total: 2, fixed: 1, declined: 1, other: 0 },
    { key: 'scope', total: 1, fixed: 0, declined: 0, other: 1 },
  ]);
  assert.deepEqual(index.capability.map(({ key, total }) => [key, total]), [['agent-task-protocol', 2], ['review-process', 2], ['(none)', 1]]);
  assert.deepEqual(index.reviewer.map(({ key }) => key), ['codex gpt-6.1-sol#medium', 'claude claude-opus-5-5']);
  assert.deepEqual(index.file.map(({ key }) => key), ['docs/x.md', 'openspec/changes/demo-change/verification.md', 'scripts/a.ts']);
});

test('the index text shows shares per group and an empty index says so', () => {
  const text = formatIndex(findingsIndex(archive));
  assert.match(text, /^Archived review findings: 5 \(fixed 2, declined 1, other 2\)\./);
  const cells = (...values: string[]) => values.map((value) => value.padStart(10)).join('');
  assert.ok(text.includes(`By category\n${cells('count', 'fixed', 'declined', 'other')}  key\n${cells('2', '50%', '0%', '50%')}  docs\n`));
  assert.ok(text.includes(`By reviewer\n${cells('count', 'fixed', 'declined', 'other')}  key\n${cells('4', '25%', '25%', '50%')}  codex gpt-6.1-sol#medium`));
  assert.equal(formatIndex(findingsIndex([])), 'Archived review findings: 0.');
});

test('a reviewer key names the variant only when there is one', () => {
  assert.equal(reviewerKey({ harness: 'codex', model: 'gpt-6.1-sol' }), 'codex gpt-6.1-sol');
  assert.equal(reviewerKey({ harness: 'opencode', model: 'kimi', variant: 'high' }), 'opencode kimi#high');
});

test('a query matches by capability or by file glob, and an empty query matches all', () => {
  const query = (capabilities: string[], files: string[]) => ({ capabilities, files, top: 7 });
  assert.equal(matchesQuery(archive[1], query([], [])), true);
  assert.equal(matchesQuery(archive[0], query(['review-process'], [])), true);
  assert.equal(matchesQuery(archive[1], query(['review-process'], [])), false);
  assert.equal(matchesQuery(archive[1], query(['review-process'], ['scripts/**'])), true);
  assert.equal(matchesQuery(archive[3], query([], ['scripts/*.ts', 'docs/{x,y}.md'])), true);
  assert.equal(matchesQuery(archive[3], query([], ['docs/*.ts'])), false);
});

test('the checklist lists the most frequent categories with the newest example', () => {
  const items = checklist(archive, vocabulary.categories, { capabilities: ['review-process'], files: ['scripts/**'], top: 7 });
  assert.deepEqual(items.map(({ category, count, example }) => [category, count, example]), [
    ['stale-citation', 2, 'Newest citation'],
    ['docs', 1, 'Missing doc'],
  ]);
  assert.match(items[0].description, /^A cited file line/);
  assert.equal(checklist(archive, vocabulary.categories, { capabilities: [], files: [], top: 1 }).length, 1);
  assert.equal(checklist(archive, [], { capabilities: [], files: [], top: 7 })[0].description, '');
});

test('the checklist text names its scope, and an empty one says nothing matched', () => {
  const query = { capabilities: ['review-process'], files: ['scripts/**'], top: 7 };
  const text = formatChecklist(checklist(archive, vocabulary.categories, query), query);
  assert.match(text, /^Review checklist \(capabilities review-process; files scripts\/\*\*\), most frequent/);
  assert.match(text, /\n1\. stale-citation \(2\): .+ Example: "Newest citation"\n2\. docs \(1\)/);
  const none = { capabilities: [], files: ['nothing/**'], top: 7 };
  assert.equal(formatChecklist(checklist(archive, vocabulary.categories, none), none), 'Review checklist (files nothing/**): no archived findings match.');
  const all = { capabilities: [], files: [], top: 7 };
  assert.match(formatChecklist([], all), /\(all archived findings\)/);
});
