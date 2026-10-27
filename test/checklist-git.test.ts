import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { archiveSnapshot, GIT_ENVIRONMENT } from '../scripts/checklist-environment.ts';
import { CHECKLIST_SCHEMA_PATH, LANDING_CHANGE } from '../scripts/checklist-record.ts';
import { PASS_SCHEMA_PATH, runFindings, SCHEMA_PATH } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';
import { commit, git, write } from './checklist-git-fixture.ts';

// The git adapter against real temporary repositories.

function withGitRepository(check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'checklist-git-'));
  try {
    git(root, 'init', '--quiet');
    for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH]) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      cpSync(path, join(root, path));
    }
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function finding(change: string, category: string): string {
  return `${JSON.stringify({
    change,
    pass: 1,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol' },
    session: 's',
    severity: 'medium',
    category,
    title: `A ${category} finding`,
    file: 'scripts/a.ts',
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'Fixed.',
  })}\n`;
}

const active = (change: string) => ({
  [`openspec/changes/${change}/.openspec.yaml`]: 'schema: spec-driven\n',
  [`openspec/changes/${change}/findings.jsonl`]: '',
  [`openspec/changes/${change}/passes.jsonl`]: '',
});

test('--save --at ranks the archive of the brief commit, not a later one', () => {
  withGitRepository((root) => {
    const brief = commit(root, {
      'openspec/changes/archive/2026-10-02-first/findings.jsonl': finding('first', 'naming'),
      ...active('new-change'),
    }, 'brief');
    commit(root, { 'openspec/changes/archive/2026-10-03-second/findings.jsonl': finding('second', 'redaction') }, 'later archive');
    const result = runFindings(['checklist', '--save', 'new-change', '--at', brief.slice(0, 7)], root, GIT_ENVIRONMENT);
    assert.equal(result.exitCode, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(root, 'openspec/changes/new-change/checklist.json'), 'utf8')) as {
      devCommit: string;
      review: { categories: { category: string }[]; baseline: { all: { findings: number } } };
    };
    assert.equal(record.devCommit, brief);
    assert.deepEqual(record.review.categories.map(({ category }) => category), ['naming']);
    assert.equal(record.review.baseline.all.findings, 1);
    const unknown = runFindings(['checklist', '--at', 'fedcba9'], root, GIT_ENVIRONMENT);
    assert.equal(unknown.exitCode, 1);
    assert.match(unknown.stderr, /^unknown commit "fedcba9"/);
  });
});

test('a change needs a checklist once opened after the landing commit or uncommitted', () => {
  withGitRepository((root) => {
    commit(root, active('opened-before'), 'before');
    assert.equal(GIT_ENVIRONMENT.landingCommit(root), undefined);
    assert.equal(runFindings(['validate'], root, GIT_ENVIRONMENT).exitCode, 0, 'nothing is required before the landing');
    const landing = commit(root, { [`openspec/changes/archive/2026-10-28-${LANDING_CHANGE}/proposal.md`]: '# Proposal\n' }, 'land');
    commit(root, active('opened-after'), 'after');
    write(root, active('uncommitted'));
    assert.equal(GIT_ENVIRONMENT.landingCommit(root), landing);
    assert.equal(GIT_ENVIRONMENT.openedAfter(root, 'openspec/changes/opened-before', landing), false);
    assert.equal(GIT_ENVIRONMENT.openedAfter(root, 'openspec/changes/opened-after', landing), true);
    assert.equal(GIT_ENVIRONMENT.openedAfter(root, 'openspec/changes/uncommitted', landing), true);
    const problems = runFindings(['validate'], root, GIT_ENVIRONMENT).stderr.split('\n');
    assert.deepEqual(problems.map((line) => line.split(':')[0]).slice(0, -1), [
      'openspec/changes/opened-after/checklist.json',
      'openspec/changes/uncommitted/checklist.json',
    ]);
  });
});

test('the git adapter finds no dev commit outside a repository with origin/dev', () => {
  withGitRepository((root) => {
    commit(root, { 'README.md': 'base\n' }, 'base');
    assert.equal(GIT_ENVIRONMENT.devCommit(root), undefined);
    assert.equal(GIT_ENVIRONMENT.archiveAt(root, 'fedcba9'), undefined);
  });
});

const LANDING_FILE = `openspec/changes/archive/2026-10-28-${LANDING_CHANGE}/proposal.md`;

test('a change opened before the landing stays exempt after its branch merges the landing', () => {
  withGitRepository((root) => {
    commit(root, { 'README.md': 'base\n' }, 'base');
    const main = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
    git(root, 'switch', '--quiet', '-c', 'old-branch');
    commit(root, active('opened-on-old'), 'open on the old branch');
    git(root, 'switch', '--quiet', main);
    commit(root, { [LANDING_FILE]: '# Proposal\n' }, 'land');
    git(root, 'switch', '--quiet', 'old-branch');
    git(root, 'merge', '--quiet', '--no-edit', main);
    const landing = GIT_ENVIRONMENT.landingCommit(root)!;
    assert.equal(GIT_ENVIRONMENT.openedAfter(root, 'openspec/changes/opened-on-old', landing), false);
    assert.equal(runFindings(['validate'], root, GIT_ENVIRONMENT).exitCode, 0);
  });
});

test('--save with an unknown --at writes nothing', () => {
  withGitRepository((root) => {
    commit(root, active('new-change'), 'open');
    const result = runFindings(['checklist', '--save', 'new-change', '--at', 'fedcba9'], root, GIT_ENVIRONMENT);
    assert.equal(result.exitCode, 1);
    assert.equal(existsSync(join(root, 'openspec/changes/new-change/checklist.json')), false);
  });
});

test('a shallow clone requires no checklist, because it cannot tell when a change was opened', () => {
  withGitRepository((source) => {
    commit(source, { [LANDING_FILE]: '# Proposal\n' }, 'land');
    commit(source, active('opened-after'), 'after');
    const parent = mkdtempSync(join(tmpdir(), 'checklist-shallow-'));
    try {
      git(parent, 'clone', '--quiet', '--depth', '1', `file://${source}`, 'clone');
      const clone = join(parent, 'clone');
      assert.equal(GIT_ENVIRONMENT.landingCommit(clone), undefined);
      assert.equal(runFindings(['validate'], clone, GIT_ENVIRONMENT).exitCode, 0);
      assert.ok(GIT_ENVIRONMENT.landingCommit(source) !== undefined, 'the full history has the landing');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

test('an archive snapshot fails as a whole when git cannot list or read it', () => {
  const findings = 'openspec/changes/archive/2026-10-02-first/findings.jsonl';
  const listing = [findings, 'openspec/changes/archive/2026-10-02-first/proposal.md', 'openspec/changes/archive/x/y/findings.jsonl'].join('\n');
  assert.deepEqual(archiveSnapshot('c', listing, () => 'line\n'), { commit: 'c', findings: [{ path: findings, text: 'line\n' }] });
  assert.equal(archiveSnapshot('c', undefined, () => 'line\n'), undefined);
  assert.equal(archiveSnapshot('c', listing, () => undefined), undefined);
  assert.deepEqual(archiveSnapshot('c', '', () => undefined), { commit: 'c', findings: [] });
});
