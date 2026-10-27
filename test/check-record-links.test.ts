import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyBaseline,
  BASELINE_PATH,
  baselineLine,
  findLinkProblems,
  headingAnchors,
  linkReport,
  localDate,
  markdownLinks,
  parseBaseline,
  type LinkProblem,
} from '../scripts/check-record-links.ts';

const ARCHIVE_DATE = '2026-10-27';
const ACTIVE = 'openspec/changes/add-demo';
const ARCHIVED = 'openspec/changes/archive/2026-10-01-old-change';

function repository(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-record-links-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function problemsIn(files: Readonly<Record<string, string>>): LinkProblem[] {
  const root = repository(files);
  try {
    return findLinkProblems(root, ARCHIVE_DATE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const BASE_FILES = {
  'docs/governance.md': '# Governance\n\n## Independent review process\n',
  [`${ACTIVE}/proposal.md`]: '# Proposal\n\n## Why\n',
  [`${ACTIVE}/specs/demo/spec.md`]: '## ADDED Requirements\n',
  [`${ARCHIVED}/design.md`]: '# Design\n',
};

test('collects inline links and images with their line numbers', () => {
  const text = ['# Title', 'See [a](a.md) and ![b](img/b.png "B").', '[c](<c d.md>)'].join('\n');
  assert.deepEqual(markdownLinks(text), [
    { line: 2, target: 'a.md' },
    { line: 2, target: 'img/b.png' },
    { line: 3, target: 'c d.md' },
  ]);
});

test('ignores links in fenced code blocks and inline code', () => {
  const text = ['```md', '[a](../a.md)', '```', '~~~', '[b](../b.md)', '~~~', 'Use `[c](../c.md)` here, ``[d](../d.md)`` too.', '[e](e.md)'].join('\n');
  assert.deepEqual(markdownLinks(text), [{ line: 8, target: 'e.md' }]);
});

test('derives GitHub heading anchors with duplicates, punctuation, backticks, and case', () => {
  const text = [
    '# Worker steps',
    '## Worker steps',
    '## The `make verify` check: 2.0!',
    '### Links [in](x.md) *headings*',
    '```',
    '# Not a heading',
    '```',
  ].join('\n');
  assert.deepEqual([...headingAnchors(text)], [
    'worker-steps',
    'worker-steps-1',
    'the-make-verify-check-20',
    'links-in-headings',
  ]);
});

test('accepts same-directory, subtree, and root-relative links that resolve', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    [`${ACTIVE}/design.md`]: [
      '[proposal](proposal.md#why)',
      '[proposal](./proposal.md)',
      '[delta](specs/demo/spec.md)',
      '[governance](/docs/governance.md#independent-review-process)',
      '[old](/openspec/changes/archive/2026-10-01-old-change/design.md#design)',
      '[self](#design)',
      '# Design',
    ].join('\n'),
  });
  assert.deepEqual(problems, []);
});

test('rejects a relative link that escapes the change directory', () => {
  const problems = problemsIn({ ...BASE_FILES, [`${ACTIVE}/design.md`]: '[governance](../../../docs/governance.md)\n' });
  assert.deepEqual(problems, [{
    file: `${ACTIVE}/design.md`,
    line: 1,
    target: '../../../docs/governance.md',
    reason: 'relative link leaves the change directory; use a root-relative link',
  }]);
});

test('checks an active change as if it were at its archived path', () => {
  const twoLevels = '[governance](../../docs/governance.md)\n';
  const problems = problemsIn({ ...BASE_FILES, [`${ACTIVE}/design.md`]: twoLevels });
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /leaves the change directory/);
  const ownArchivedPath = `[proposal](/openspec/changes/archive/${ARCHIVE_DATE}-add-demo/proposal.md#why)\n`;
  assert.deepEqual(problemsIn({ ...BASE_FILES, [`${ACTIVE}/design.md`]: ownArchivedPath }), []);
});

test('accepts only root-relative links in a spec delta', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    [`${ACTIVE}/specs/demo/spec.md`]: ['[governance](/docs/governance.md)', '[design](../../proposal.md)'].join('\n'),
  });
  assert.deepEqual(problems.map(({ line, reason }) => ({ line, reason })), [
    { line: 2, reason: 'relative link in a spec delta; use a root-relative link' },
  ]);
});

test('rejects a relative link that escapes a main spec directory', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    'openspec/specs/demo/spec.md': '[other](../other/spec.md)\n',
    'openspec/specs/other/spec.md': '# other\n',
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /leaves the spec directory/);
});

test('rejects a link to an active change from records and docs', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    [`${ARCHIVED}/verification.md`]: '[active](/openspec/changes/add-demo/proposal.md)\n',
    'docs/plan.md': '[active](../openspec/changes/add-demo/proposal.md)\n',
  });
  assert.deepEqual(problems.map(({ file, reason }) => ({ file, reason })), [
    { file: 'docs/plan.md', reason: 'links to the active change add-demo, which moves when archived' },
    { file: `${ARCHIVED}/verification.md`, reason: 'links to the active change add-demo, which moves when archived' },
  ]);
});

test('reports a missing target and a missing anchor', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    [`${ACTIVE}/design.md`]: ['[gone](tasks.md)', '[anchor](/docs/governance.md#no-such-section)'].join('\n'),
  });
  assert.deepEqual(problems.map(({ line, reason }) => ({ line, reason })), [
    { line: 1, reason: 'target does not exist' },
    { line: 2, reason: 'anchor does not exist in the target' },
  ]);
});

test('resolves an anchor of a duplicate heading', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    'docs/steps.md': ['# Steps', '## Check', '## Check', '[second](#check-1)', '[third](#check-2)'].join('\n'),
  });
  assert.deepEqual(problems.map(({ line, target }) => ({ line, target })), [{ line: 5, target: '#check-2' }]);
});

test('ignores external links and links in code', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    [`${ACTIVE}/design.md`]: [
      '[site](https://example.com/a/../b)',
      '[web](http://example.com)',
      '[mail](mailto:owner@example.com)',
      '`[code](../../x.md)`',
      '```',
      '[fenced](../../x.md)',
      '```',
    ].join('\n'),
  });
  assert.deepEqual(problems, []);
});

test('checks relative links and anchors under docs', () => {
  const problems = problemsIn({
    ...BASE_FILES,
    'docs/decisions/0001-demo.md': [
      '[governance](../governance.md#independent-review-process)',
      '[missing](../missing.md)',
      '[anchor](../governance.md#missing)',
      '[outside](../../../outside.md)',
    ].join('\n'),
  });
  assert.deepEqual(problems.map(({ line, reason }) => ({ line, reason })), [
    { line: 2, reason: 'target does not exist' },
    { line: 3, reason: 'anchor does not exist in the target' },
    { line: 4, reason: 'relative link leaves the repository' },
  ]);
});

test('a baseline suppresses known archived problems and reports stale entries', () => {
  const known: LinkProblem = { file: `${ARCHIVED}/design.md`, line: 3, target: '../../docs/a.md', reason: 'target does not exist' };
  const fresh: LinkProblem = { file: `${ARCHIVED}/tasks.md`, line: 1, target: 'gone.md', reason: 'target does not exist' };
  const baseline = parseBaseline([
    baselineLine(known),
    `${ARCHIVED}/proposal.md\t../../docs/fixed.md`,
    '',
  ].join('\n'));

  const result = applyBaseline([known, fresh], baseline);

  assert.deepEqual(result.unbaselined, [fresh]);
  assert.equal(result.baselined, 1);
  assert.deepEqual(result.stale, [{ file: `${ARCHIVED}/proposal.md`, target: '../../docs/fixed.md' }]);
});

test('a baseline entry matches one occurrence of a repeated link', () => {
  const problem: LinkProblem = { file: `${ARCHIVED}/design.md`, line: 3, target: 'gone.md', reason: 'target does not exist' };
  const repeated = { ...problem, line: 4 };
  const result = applyBaseline([problem, repeated], parseBaseline(`${baselineLine(problem)}\n`));
  assert.deepEqual(result.unbaselined, [repeated]);
});

test('a baseline accepts only archived records', () => {
  assert.throws(() => parseBaseline('docs/plan.md\tgone.md\n'), /docs\/plan\.md.*openspec\/changes\/archive\//);
  assert.throws(() => parseBaseline(`${ARCHIVED}/design.md\n`), /tab/);
});

test('the report lists problems and stale entries, or counts the baseline', () => {
  const archivedLink = '../../docs/governance.md';
  const root = repository({
    ...BASE_FILES,
    [`${ARCHIVED}/tasks.md`]: `[governance](${archivedLink})\n`,
    [BASELINE_PATH]: `${ARCHIVED}/tasks.md\t${archivedLink}\n`,
  });
  try {
    assert.deepEqual(linkReport(root, ARCHIVE_DATE), {
      errors: [],
      summary: `Every checked link conforms; 1 archived links remain in ${BASELINE_PATH}.`,
    });
    writeFileSync(join(root, `${ACTIVE}/tasks.md`), '[gone](gone.md)\n');
    writeFileSync(join(root, BASELINE_PATH), `${ARCHIVED}/tasks.md\t${archivedLink}\n${ARCHIVED}/tasks.md\tfixed.md\n`);
    assert.deepEqual(linkReport(root, ARCHIVE_DATE), {
      errors: [
        `${ACTIVE}/tasks.md:1: target does not exist: gone.md`,
        `${BASELINE_PATH}: stale entry, remove it: ${ARCHIVED}/tasks.md\tfixed.md`,
      ],
      summary: 'Record link problems: 1, stale baseline entries: 1; see docs/agent-task-protocol.md step 6.',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the archive date is the local calendar date', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
