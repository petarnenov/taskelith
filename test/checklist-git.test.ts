import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GIT_ENVIRONMENT } from '../scripts/checklist-environment.ts';
import { CHECKLIST_SCHEMA_PATH, LANDING_CHANGE } from '../scripts/checklist-record.ts';
import { PASS_SCHEMA_PATH, runFindings, SCHEMA_PATH } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';

// The git adapter against real temporary repositories.

function git(root: string, ...args: string[]): string {
  const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false'];
  return execFileSync('git', [...identity, ...args], { cwd: root, encoding: 'utf8' }).trim();
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function commit(root: string, files: Readonly<Record<string, string>>, message: string): string {
  write(root, files);
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

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
