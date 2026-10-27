import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GIT_ROUTE_ENVIRONMENT, numstatFiles, statusPaths } from '../scripts/review-route-environment.ts';
import {
  archivedReviewsOf,
  capabilitiesUnder,
  capabilityHistory,
  hasExternalFacts,
  isSecurityPath,
  RouteRefusal,
  routeSubject,
  sizeOf,
  touchesOf,
} from '../scripts/review-route-features.ts';
import { commit, git, write } from './checklist-git-fixture.ts';

// Feature derivation: the pure parts directly, the git adapter against
// temporary repositories.

test('code, test, contract, and Docker paths set their flags', () => {
  const cases: readonly [string, keyof ReturnType<typeof touchesOf>][] = [
    ['src/cli.ts', 'code'],
    ['scripts/findings.ts', 'code'],
    ['packages/kernel/src/index.ts', 'code'],
    ['apps/worker/src/main.ts', 'code'],
    ['test/cli.test.ts', 'tests'],
    ['packages/kernel/test/a.test.ts', 'tests'],
    ['apps/worker/test/a.test.ts', 'tests'],
    ['packages/contracts/openapi/api.yaml', 'contracts'],
    ['docs/contracts/events.md', 'contracts'],
    ['api/control.openapi.yaml', 'contracts'],
    ['api/events.asyncapi.json', 'contracts'],
    ['apps/worker/Dockerfile', 'docker'],
    ['compose.yaml', 'docker'],
    ['deploy/compose.verify.yml', 'docker'],
    ['infra/nats/nats.conf', 'docker'],
  ];
  for (const [path, flag] of cases) {
    assert.equal(touchesOf([path], [])[flag], true, path);
  }
  assert.deepEqual(touchesOf(['README.txt'], []), {
    code: false, tests: false, contracts: false, specs: false, docker: false, security: false, docsOnly: false,
  });
});

test('security segments match whole segments in any case', () => {
  assert.equal(isSecurityPath('scripts/redact-output.ts'), true);
  assert.equal(isSecurityPath('packages/secrets/src/index.ts'), true);
  assert.equal(isSecurityPath('apps/worker/Seccomp_profile.json'), true);
  assert.equal(isSecurityPath('docs/trusted-setup.md'), false);
  assert.equal(isSecurityPath('src/tokenizer.ts'), false);
});

test('docsOnly needs documentation paths and no other flag but specs', () => {
  assert.equal(touchesOf([], []).docsOnly, true);
  assert.equal(touchesOf(['README.md', 'docs/governance.md'], ['review-process']).docsOnly, true);
  assert.equal(touchesOf(['docs/contracts/events.md'], []).docsOnly, false);
  assert.equal(touchesOf(['docs/secrets.md'], []).docsOnly, false);
  assert.equal(touchesOf(['README.md', 'Makefile'], []).docsOnly, false);
  assert.equal(touchesOf(['scripts/notes.md'], []).docsOnly, false);
});

test('specs is set exactly when the change has capabilities', () => {
  assert.equal(touchesOf([], ['review-process']).specs, true);
  assert.equal(touchesOf([], []).specs, false);
});

test('capabilities are the spec delta directories, sorted and unique', () => {
  const files = [
    'openspec/changes/c/proposal.md',
    'openspec/changes/c/specs/review-process/spec.md',
    'openspec/changes/c/specs/agent-task-protocol/spec.md',
    'openspec/changes/c/specs/review-process/notes.md',
    'openspec/changes/c/specs/stray.md',
  ];
  assert.deepEqual(capabilitiesUnder(files, 'openspec/changes/c'), ['agent-task-protocol', 'review-process']);
});

test('external facts need the exact section heading', () => {
  assert.equal(hasExternalFacts('# Design\n\n## External facts\n'), true);
  assert.equal(hasExternalFacts('# Design\n\n### External facts\n'), false);
  assert.equal(hasExternalFacts('No external facts here.'), false);
  assert.equal(hasExternalFacts(undefined), false);
});

test('the size comes from checklist.json and is null without one', () => {
  assert.equal(sizeOf(undefined), null);
  assert.equal(sizeOf('{"change":"c"}'), null);
  assert.equal(sizeOf('{"size":"M-L"}'), 'M-L');
  assert.throws(() => sizeOf('{"size":"XL"}'), RouteRefusal);
  assert.throws(() => sizeOf('{'), RouteRefusal);
});

const ARCHIVE = 'openspec/changes/archive';

function jsonLines(...records: object[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('');
}

const ARCHIVE_FILES: Readonly<Record<string, string>> = {
  [`${ARCHIVE}/2026-10-01-one/findings.jsonl`]: jsonLines({ pass: 1, severity: 'medium', capability: 'review-process' }, { pass: 3, severity: 'low' }),
  [`${ARCHIVE}/2026-10-01-one/passes.jsonl`]: jsonLines({ pass: 1 }, { pass: 2 }, { pass: 3 }),
  [`${ARCHIVE}/2026-10-02-two/specs/review-process/spec.md`]: '',
  [`${ARCHIVE}/2026-10-02-two/findings.jsonl`]: jsonLines({ pass: 1, severity: 'high' }, { pass: 2, severity: 'critical' }),
  [`${ARCHIVE}/2026-10-03-three/findings.jsonl`]: jsonLines({ pass: 1, severity: 'high', capability: 'other' }),
  [`${ARCHIVE}/2026-10-04-unreviewed/specs/review-process/spec.md`]: '',
  [`${ARCHIVE}/2026-10-05-none/findings.jsonl`]: jsonLines({ pass: 1, severity: 'low', capability: '(none)' }),
};

test('the capability history counts related reviewed changes only', () => {
  const reviews = archivedReviewsOf(Object.keys(ARCHIVE_FILES), (path) => ARCHIVE_FILES[path]!);
  assert.equal(reviews.length, 4);
  assert.deepEqual(capabilityHistory(reviews, ['review-process']), { changes: 2, thirdPassShare: 0.5, mediumOrWorsePerChange: 1.5 });
  assert.deepEqual(capabilityHistory(reviews, ['unknown']), { changes: 0, thirdPassShare: null, mediumOrWorsePerChange: null });
  assert.deepEqual(capabilityHistory(reviews, ['(none)']).changes, 0);
});

test('an archived record that is not JSON lines is refused', () => {
  const files: Readonly<Record<string, string>> = { [`${ARCHIVE}/2026-10-01-one/findings.jsonl`]: '{\n' };
  assert.throws(() => archivedReviewsOf(Object.keys(files), (path) => files[path]!), RouteRefusal);
});

test('the git output parsers read NUL-separated status and numstat', () => {
  assert.deepEqual(statusPaths(' M scripts/a.ts\0?? openspec/changes/c/route.json\0'), ['scripts/a.ts', 'openspec/changes/c/route.json']);
  assert.deepEqual(numstatFiles('3\t2\tscripts/a.ts\0-\t-\tdocs/logo.png\0'), [
    { path: 'scripts/a.ts', lines: 5 },
    { path: 'docs/logo.png', lines: 0 },
  ]);
});

function withRepository(check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'review-route-'));
  try {
    git(root, 'init', '--quiet');
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CHANGE = 'route-me';
const CHANGE_DIRECTORY = `openspec/changes/${CHANGE}`;

// A base commit as origin/dev with one reviewed archived change, and a
// branch with a change, its records, and code.
function branchWithChange(root: string): { base: string; head: string } {
  const base = commit(root, {
    'README.md': 'Base.\n',
    [`${ARCHIVE}/2026-10-01-earlier/specs/review-process/spec.md`]: '',
    [`${ARCHIVE}/2026-10-01-earlier/passes.jsonl`]: jsonLines({ pass: 1 }, { pass: 2 }, { pass: 3 }),
    [`${ARCHIVE}/2026-10-01-earlier/findings.jsonl`]: jsonLines({ pass: 2, severity: 'medium' }),
  }, 'base');
  git(root, 'update-ref', 'refs/remotes/origin/dev', base);
  const head = commit(root, {
    'scripts/redact.ts': 'a\nb\nc\n',
    'docs/logo.png': Buffer.from([0, 1, 2, 0]).toString('binary'),
    'docs/with space.md': 'x\n',
    [`${CHANGE_DIRECTORY}/proposal.md`]: 'A change.\n'.repeat(50),
    [`${CHANGE_DIRECTORY}/specs/review-process/spec.md`]: '## ADDED Requirements\n',
    [`${CHANGE_DIRECTORY}/design.md`]: '# Design\n\n## External facts\n',
    [`${CHANGE_DIRECTORY}/checklist.json`]: '{"size":"L"}\n',
    [`${ARCHIVE}/2026-10-09-later/specs/review-process/spec.md`]: '',
    [`${ARCHIVE}/2026-10-09-later/findings.jsonl`]: jsonLines({ pass: 1, severity: 'high' }),
  }, 'change');
  return { base, head };
}

test('features come from the diff against the merge base and the archive at it', () => {
  withRepository((root) => {
    const { base, head } = branchWithChange(root);
    write(root, { [`${CHANGE_DIRECTORY}/route.json`]: '{}' });
    const subject = routeSubject(root, CHANGE, GIT_ROUTE_ENVIRONMENT);
    assert.equal(subject.devCommit, base);
    assert.equal(subject.headCommit, head);
    assert.deepEqual(subject.features, {
      linesChanged: 4,
      filesChanged: 3,
      capabilities: ['review-process'],
      touches: { code: true, tests: false, contracts: false, specs: true, docker: false, security: true, docsOnly: false },
      externalFacts: true,
      size: 'L',
      capabilityHistory: { changes: 1, thirdPassShare: 1, mediumOrWorsePerChange: 1 },
    });
  });
});

test('uncommitted work outside the change is refused', () => {
  withRepository((root) => {
    branchWithChange(root);
    writeFileSync(join(root, 'README.md'), 'Edited.\n');
    assert.throws(() => routeSubject(root, CHANGE, GIT_ROUTE_ENVIRONMENT), /outside the change have uncommitted changes/);
  });
});

test('an untracked file outside the change is refused', () => {
  withRepository((root) => {
    branchWithChange(root);
    write(root, { 'scratch.txt': 'x' });
    assert.throws(() => routeSubject(root, CHANGE, GIT_ROUTE_ENVIRONMENT), RouteRefusal);
  });
});

test('an unknown change is refused', () => {
  withRepository((root) => {
    branchWithChange(root);
    assert.throws(() => routeSubject(root, 'no-such-change', GIT_ROUTE_ENVIRONMENT), /no committed active change "no-such-change"/);
  });
});

test('a repository without origin/dev has no merge base', () => {
  withRepository((root) => {
    commit(root, { 'README.md': 'x\n' }, 'only');
    assert.throws(() => routeSubject(root, CHANGE, GIT_ROUTE_ENVIRONMENT), /no merge base/);
  });
});

test('git failures read as unknown, never as empty', () => {
  withRepository((root) => {
    assert.equal(GIT_ROUTE_ENVIRONMENT.head(root), undefined);
    assert.equal(GIT_ROUTE_ENVIRONMENT.changedFiles(root, 'HEAD', 'HEAD'), undefined);
    assert.equal(GIT_ROUTE_ENVIRONMENT.listFiles(root, 'HEAD', ARCHIVE), undefined);
    assert.equal(GIT_ROUTE_ENVIRONMENT.readFile(root, 'HEAD', 'README.md'), undefined);
  });
  const notRepository = mkdtempSync(join(tmpdir(), 'review-route-plain-'));
  try {
    assert.equal(GIT_ROUTE_ENVIRONMENT.uncommittedPaths(notRepository), undefined);
  } finally {
    rmSync(notRepository, { recursive: true, force: true });
  }
});
