import assert from 'node:assert/strict';
import test from 'node:test';
import { RouteRefusal, type ArchivedReview, type FeatureEnvironment } from '../scripts/review-route-features.ts';
import {
  archivedReference,
  changeContentAt,
  markdownSection,
  recordedLinesOf,
  referenceRates,
  shadowInputAt,
} from '../scripts/review-route-shadow-input.ts';
import { QUIET_FEATURES } from './review-route-fake.ts';

// The shadow input beyond the features: leave-one-out reference rates
// and the proposal content, read through a fake environment.

const ARCHIVE = 'openspec/changes/archive';
const DEV_COMMIT = 'd'.repeat(40);
const HEAD_COMMIT = 'e'.repeat(40);

function review(change: string, highestPass: number, severalArtifacts = false): ArchivedReview {
  return { change, capabilities: new Set(['review-process']), highestPass, mediumOrWorse: 0, severalArtifacts };
}

const REVIEWS = [
  review('small', 3), review('small-quiet', 2), review('medium', 2), review('large', 3), review('unmeasured', 1), review('routed', 3),
  review('plan-and-code', 3, true),
];
const LINES = new Map([['small', 40], ['small-quiet', 99], ['medium', 100], ['large', 400], ['routed', 30], ['plan-and-code', 20]]);

test('the reference rates leave the routed change and several artifacts out', () => {
  const rates = referenceRates({ reviews: REVIEWS, recordedLines: LINES }, 'routed');
  assert.equal(rates.changes, 5);
  assert.equal(rates.thirdPassShare, 2 / 5);
  assert.deepEqual(rates.byLinesChanged, [
    { band: 'under 100 lines', changes: 2, thirdPassShare: 0.5 },
    { band: '100 to 399 lines', changes: 1, thirdPassShare: 0 },
    { band: '400 lines and more', changes: 1, thirdPassShare: 1 },
  ]);
  const withRouted = referenceRates({ reviews: REVIEWS, recordedLines: LINES }, 'another');
  assert.equal(withRouted.changes, 6);
  assert.equal(withRouted.byLinesChanged[0]!.changes, 3);
});

test('an empty archive gives unknown rates', () => {
  const rates = referenceRates({ reviews: [], recordedLines: new Map() }, 'routed');
  assert.equal(rates.thirdPassShare, null);
  assert.ok(rates.byLinesChanged.every(({ changes, thirdPassShare }) => changes === 0 && thirdPassShare === null));
});

const ARCHIVED_FILES: Readonly<Record<string, string>> = {
  [`${ARCHIVE}/2026-10-01-measured/evaluation.jsonl`]:
    '{"change":"early","features":{"linesChanged":12}}\n{"change":"routed-later","features":{"linesChanged":50}}\n',
  [`${ARCHIVE}/2026-10-02-routed-later/route.json`]: '{"change":"routed-later","features":{"linesChanged":70}}',
  [`${ARCHIVE}/2026-10-02-routed-later/passes.jsonl`]: '{"pass":1}\n{"pass":2}\n{"pass":3}\n',
  [`${ARCHIVE}/2026-10-03-odd/passes.jsonl`]: '{"pass":1,"artifact":"plan"}\n',
  [`${ARCHIVE}/2026-10-03-odd/route.json`]: '{"change":"odd","features":{}}',
  [`${ARCHIVE}/2026-10-04-deep/nested/route.json`]: '{"change":"deep","features":{"linesChanged":5}}',
};

const readArchived = (path: string) => ARCHIVED_FILES[path]!;

test('recorded lines come from archived evaluations and route records', () => {
  const lines = recordedLinesOf(Object.keys(ARCHIVED_FILES), readArchived);
  assert.deepEqual([...lines].sort(), [['early', 12], ['routed-later', 70]]);
});

test('an archived route record that is no JSON is refused', () => {
  const path = `${ARCHIVE}/2026-10-05-broken/route.json`;
  assert.throws(() => recordedLinesOf([path], () => '{'), (error: Error) => error instanceof RouteRefusal && error.message.includes(path));
});

function fakeEnvironment(files: Readonly<Record<string, string>>, overrides: Partial<FeatureEnvironment> = {}): FeatureEnvironment {
  return {
    changedFiles: () => [],
    listFiles: (_root, _commit, directory) => Object.keys(files).filter((path) => path.startsWith(`${directory}/`)),
    readFile: (_root, _commit, path) => files[path],
    ...overrides,
  };
}

test('the archived reference holds the reviews and the recorded lines', () => {
  const reference = archivedReference(fakeEnvironment(ARCHIVED_FILES), 'root', DEV_COMMIT);
  assert.deepEqual(reference.reviews.map(({ change, highestPass, severalArtifacts }) => [change, highestPass, severalArtifacts]), [
    ['routed-later', 3, false],
    ['odd', 1, true],
  ]);
  assert.equal(reference.recordedLines.get('routed-later'), 70);
  const unlisted = fakeEnvironment(ARCHIVED_FILES, { listFiles: () => undefined });
  assert.throws(() => archivedReference(unlisted, 'root', DEV_COMMIT), /cannot list the archive/);
});

const PROPOSAL = [
  '## Why',
  '',
  'The request is badly shaped.',
  '',
  '### Detail',
  'More.',
  '## What Changes',
  '- One question.',
  '# Impact',
  'None.',
].join('\n');

test('a proposal section ends at the next heading of level 1 or 2', () => {
  assert.equal(markdownSection(PROPOSAL, 'Why'), 'The request is badly shaped.\n\n### Detail\nMore.');
  assert.equal(markdownSection(PROPOSAL, 'What Changes'), '- One question.');
  assert.equal(markdownSection(PROPOSAL, 'Impact'), '');
  assert.equal(markdownSection('## Why\nLast section.\n', 'Why'), 'Last section.');
});

const CHANGE_DIRECTORY = 'openspec/changes/routed';
const CHANGE_FILES: Readonly<Record<string, string>> = {
  [`${CHANGE_DIRECTORY}/proposal.md`]: PROPOSAL,
  [`${CHANGE_DIRECTORY}/tasks.md`]: '## 1. Work\n\n- [x] 1.1 Done\n- [ ] 1.2 Open\n  - [X] 1.2.1 Nested\n- not a task\n',
  [`${CHANGE_DIRECTORY}/specs/review-process/spec.md`]: '### Requirement: One\n### Requirement: Two\n#### Scenario: S\n',
  [`${CHANGE_DIRECTORY}/specs/other/spec.md`]: '## ADDED Requirements\n### Requirement: Three\n',
  [`${CHANGE_DIRECTORY}/specs/other/notes.md`]: '### Requirement: Not a spec\n',
};
const REVISION = { devCommit: DEV_COMMIT, revision: HEAD_COMMIT, directory: CHANGE_DIRECTORY };

test('the change content holds the proposal sections and the counts', () => {
  assert.deepEqual(changeContentAt('root', fakeEnvironment(CHANGE_FILES), REVISION), {
    why: 'The request is badly shaped.\n\n### Detail\nMore.',
    whatChanges: '- One question.',
    taskCount: 3,
    specRequirementCount: 3,
  });
});

test('a change without proposal, tasks, or specs has empty content', () => {
  assert.deepEqual(changeContentAt('root', fakeEnvironment({}, { listFiles: () => undefined }), REVISION), {
    why: '',
    whatChanges: '',
    taskCount: 0,
    specRequirementCount: 0,
  });
});

test('the shadow input excludes the change that its directory names', () => {
  const reference = { reviews: REVIEWS, recordedLines: LINES };
  const asked: string[] = [];
  const referenceAt = (commit: string) => { asked.push(commit); return reference; };
  const input = shadowInputAt('root', fakeEnvironment(CHANGE_FILES), REVISION, QUIET_FEATURES, referenceAt);
  assert.deepEqual(asked, [DEV_COMMIT]);
  assert.equal(input.features, QUIET_FEATURES);
  assert.equal(input.reference.changes, 5);
  assert.equal(input.content.taskCount, 3);
  const archived = { ...REVISION, directory: `${ARCHIVE}/2026-10-06-routed` };
  assert.equal(shadowInputAt('root', fakeEnvironment({}), archived, QUIET_FEATURES, referenceAt).reference.changes, 5);
});
