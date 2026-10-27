import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  checkStamp, classifyPaths, decideProfile, DIRTY, finishVerify, gitIn, headRevision, isDocsPath, isDryRun, mergeBase, NO_MERGE_BASE,
  PROFILE_VARIABLE, runCommand,
  satisfyingProfiles, serviceImages, stampDirectory, stampFields, stampKey, startTree, writeStamp, type Git,
  type StampContext,
} from '../scripts/verify-stamp.ts';
import { fixtureEnv } from './git-fixture-env.ts';

const TOOLCHAIN = { node: 'v24.22.1', npm: '12.2.1' };
const NOW = new Date('2026-10-27T10:00:00Z');

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf8', env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commitAll(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

// A clone whose origin/dev is the base commit and whose feature branch
// starts there.
function withRepository(body: (root: string, context: StampContext) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-verify-stamp-'));
  try {
    git(root, 'init', '-q', '-b', 'dev');
    write(root, 'package-lock.json', '{}\n');
    write(root, 'src/index.ts', 'export {};\n');
    write(root, 'infra/services/compose.yaml', 'services:\n  db:\n    image: postgres:18@sha256:abc\n');
    commitAll(root, 'base');
    git(root, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    git(root, 'switch', '-q', '-c', 'feature');
    body(root, { root, git: gitIn(root), toolchain: TOOLCHAIN, environment: {} });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('D1 paths: docs, openspec, and root Markdown except the changelog', () => {
  for (const path of ['docs/governance.md', 'docs/review-findings-guide.md', 'openspec/specs/a/spec.md', 'AGENTS.md', 'README.md']) {
    assert.equal(isDocsPath(path), true, path);
  }
  for (const path of ['CHANGELOG.md', 'scripts/a.ts', '.claude/settings.json', 'Makefile', 'packages/a/README.md', 'docs', 'openspec']) {
    assert.equal(isDocsPath(path), false, path);
  }
});

for (const path of ['docs/review-findings/categories.txt', 'docs/qualification/speckit.md']) {
  test(`D1 paths: tests read ${path}, so it needs the full profile`, () => {
    assert.equal(isDocsPath(path), false);
    assert.equal(classifyPaths(['docs/governance.md', path]), 'full');
  });
}

test('a profile is docs-only only when every changed path is documentation', () => {
  assert.equal(classifyPaths(['docs/a.md', 'AGENTS.md']), 'docs-only');
  assert.equal(classifyPaths(['docs/a.md', 'scripts/a.ts']), 'full');
  assert.equal(classifyPaths([]), 'full');
});

test('a branch that changes only documentation gets the docs-only profile', () => {
  withRepository((root, context) => {
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    write(root, 'openspec/changes/x/proposal.md', 'staged\n');
    git(root, 'add', '-A');
    write(root, 'AGENTS.md', 'untracked\n');
    const decision = decideProfile(context.git, {});
    assert.equal(decision.profile, 'docs-only');
    assert.match(decision.reason, /^3 documentation path\(s\) since [0-9a-f]{12}$/);
  });
});

test('a code change anywhere since the merge base gets the full profile', () => {
  withRepository((root, context) => {
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    write(root, 'scripts/a.ts', 'export {};\n');
    const decision = decideProfile(context.git, {});
    assert.deepEqual(decision, { profile: 'full', reason: 'scripts/a.ts changed' });
  });
});

test('a rename out of the documentation counts both paths', () => {
  withRepository((root, context) => {
    mkdirSync(join(root, 'docs'));
    git(root, 'mv', 'src/index.ts', 'docs/index.ts');
    commitAll(root, 'move');
    assert.equal(decideProfile(context.git, {}).profile, 'full');
  });
});

test('dev, main, CI, a forced run, a missing merge base, and no change are full', () => {
  withRepository((root, context) => {
    assert.deepEqual(decideProfile(context.git, {}), { profile: 'full', reason: `no change since ${git(root, 'rev-parse', 'HEAD').slice(0, 12)}` });
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    assert.deepEqual(decideProfile(context.git, { CI: 'true' }), { profile: 'full', reason: 'CI' });
    assert.deepEqual(decideProfile(context.git, { [PROFILE_VARIABLE]: 'full' }), { profile: 'full', reason: `${PROFILE_VARIABLE}=full` });
    assert.throws(() => decideProfile(context.git, { [PROFILE_VARIABLE]: 'docs-only' }), /may only be full, not docs-only/);
    git(root, 'switch', '-q', 'dev');
    git(root, 'merge', '-q', '--ff-only', 'feature');
    assert.deepEqual(decideProfile(context.git, {}), { profile: 'full', reason: 'branch dev' });
    git(root, 'switch', '-q', 'feature');
    git(root, 'update-ref', '-d', 'refs/remotes/origin/dev');
    assert.deepEqual(decideProfile(context.git, {}), { profile: 'full', reason: 'no merge base with origin/dev' });
  });
});

test('a detached HEAD gets the full profile, also outside CI', () => {
  withRepository((root, context) => {
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    assert.equal(decideProfile(context.git, {}).profile, 'docs-only');
    git(root, 'switch', '-q', '--detach');
    assert.deepEqual(decideProfile(context.git, {}), { profile: 'full', reason: 'detached HEAD' });
  });
});

test('the stamp key covers the tree, merge base, profile, toolchain, lockfile, and images', () => {
  withRepository((root) => {
    const base = stampFields(root, { tree: 'tree-1', base: 'base-1' }, 'full', TOOLCHAIN);
    assert.deepEqual(base.images, ['postgres:18@sha256:abc']);
    const variants = [
      { ...base, tree: 'tree-2' },
      { ...base, base: 'base-2' },
      { ...base, profile: 'docs-only' as const },
      { ...base, node: 'v24.0.0' },
      { ...base, npm: '11.0.0' },
      { ...base, lockfile: 'other' },
      { ...base, images: ['postgres:18@sha256:def'] },
    ];
    for (const variant of variants) assert.notEqual(stampKey(variant), stampKey(base), JSON.stringify(variant));
    assert.equal(stampKey({ ...base }), stampKey(base));
  });
});

// Review finding 4: contract compatibility and findings validation read the
// merge base, so the same tree on another merge base is not verified.
test('a stamp of the same tree on another merge base is not reused', () => {
  withRepository((root, context) => {
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    finishVerify(context, 'full', startTree(context.git), NOW);
    assert.equal(checkStamp(context, 'full').verified, true);
    const { tree, base } = headRevision(context.git);
    git(root, 'switch', '-q', 'dev');
    write(root, 'src/endpoint.ts', 'export {};\n');
    commitAll(root, 'dev adds an endpoint');
    git(root, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    const same = git(root, 'commit-tree', tree, '-p', 'HEAD', '-m', 'same tree on the new dev').trim();
    git(root, 'switch', '-q', 'feature');
    git(root, 'reset', '-q', '--hard', same);
    assert.equal(headRevision(context.git).tree, tree);
    assert.notEqual(headRevision(context.git).base, base);
    assert.deepEqual(checkStamp(context, 'full').verified, false);
    assert.match(checkStamp(context, 'full').message, /^no full stamp for tree [0-9a-f]{12} and merge base [0-9a-f]{12}$/);
  });
});

test('a missing merge base is part of the key as none', () => {
  withRepository((root, context) => {
    git(root, 'update-ref', '-d', 'refs/remotes/origin/dev');
    assert.equal(mergeBase(context.git), NO_MERGE_BASE);
  });
});

test('a stamp lives under the common git directory, shared by worktrees', () => {
  withRepository((root, context) => {
    const worktree = join(root, '..', `${root.split('/').pop()}-worktree`);
    try {
      git(root, 'worktree', 'add', '-q', worktree, '-b', 'other');
      assert.equal(stampDirectory(gitIn(worktree)), stampDirectory(context.git));
      assert.match(stampDirectory(context.git), /\.git\/taskelith-verify-stamps$/);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });
});

test('make verify stamps a clean tree that stayed unchanged', () => {
  withRepository((root, context) => {
    const started = startTree(context.git);
    const message = finishVerify(context, 'full', started, NOW);
    assert.equal(message, `make verify: passed, profile full, tree ${started}; stamp written`);
    assert.deepEqual(checkStamp(context, 'full'), { verified: true, message: `tree ${started.slice(0, 12)} passed make verify (full) at 2026-10-27T10:00:00.000Z` });
  });
});

test('no stamp is written for a dirty tree or a tree that changed', () => {
  withRepository((root, context) => {
    write(root, 'src/index.ts', 'export const a = 1;\n');
    assert.equal(startTree(context.git), DIRTY);
    assert.equal(finishVerify(context, 'full', DIRTY, NOW), 'make verify: passed, profile full, uncommitted working tree; no stamp written');
    git(root, 'checkout', '--', 'src/index.ts');
    const started = startTree(context.git);
    write(root, 'src/index.ts', 'export const b = 1;\n');
    assert.match(finishVerify(context, 'full', started, NOW), /the tree changed during the run, no stamp written$/);
    commitAll(root, 'changed');
    assert.match(finishVerify(context, 'full', started, NOW), /the tree changed during the run/);
    assert.deepEqual(readdirSafe(stampDirectory(context.git)), []);
  });
});

function readdirSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

test('a docs-only stamp never satisfies a full requirement', () => {
  withRepository((_root, context) => {
    finishVerify(context, 'docs-only', startTree(context.git), NOW);
    assert.equal(checkStamp(context, 'docs-only').verified, true);
    assert.deepEqual(checkStamp(context, 'full').verified, false);
    assert.deepEqual(satisfyingProfiles('docs-only'), ['full', 'docs-only']);
    assert.deepEqual(satisfyingProfiles('full'), ['full']);
  });
});

test('a full stamp satisfies a docs-only requirement', () => {
  withRepository((_root, context) => {
    finishVerify(context, 'full', startTree(context.git), NOW);
    assert.equal(checkStamp(context, 'docs-only').verified, true);
  });
});

test('a stamp is not reused on a dirty tree, in CI, or after a key change', () => {
  withRepository((root, context) => {
    finishVerify(context, 'full', startTree(context.git), NOW);
    assert.deepEqual(checkStamp({ ...context, environment: { CI: '1' } }, 'full'), { verified: false, message: 'CI never reuses a stamp' });
    assert.deepEqual(checkStamp({ ...context, toolchain: { ...TOOLCHAIN, npm: '11.0.0' } }, 'full').verified, false);
    write(root, 'package-lock.json', '{"changed":true}\n');
    assert.deepEqual(checkStamp(context, 'full'), { verified: false, message: 'the working tree is not clean' });
    commitAll(root, 'lockfile');
    assert.match(checkStamp(context, 'full').message, /^no full stamp for tree [0-9a-f]{12} and merge base [0-9a-f]{12}$/);
  });
});

test('a corrupt or mismatched stamp file is ignored', () => {
  withRepository((_root, context) => {
    const fields = stampFields(context.root, headRevision(context.git), 'full', TOOLCHAIN);
    const path = writeStamp(stampDirectory(context.git), fields, NOW);
    writeFileSync(path, 'not json');
    assert.equal(checkStamp(context, 'full').verified, false);
    writeFileSync(path, JSON.stringify({ ...fields, tree: 'other' }));
    assert.equal(checkStamp(context, 'full').verified, false);
  });
});

test('no compose file means no images', () => {
  assert.deepEqual(serviceImages(join(tmpdir(), 'taskelith-no-such-directory')), []);
});

test('the commands print the profile, the start tree, the result, and the check', () => {
  withRepository((root, context) => {
    write(root, 'docs/a.md', '# A\n');
    commitAll(root, 'docs');
    const profile = runCommand(['profile'], () => context, NOW);
    assert.deepEqual(profile.stdout, 'docs-only\n');
    assert.match(profile.stderr, /^make verify: profile docs-only \(1 documentation path\(s\) since [0-9a-f]{12}\)\n$/);
    const tree = runCommand(['start'], () => context, NOW).stdout.trim();
    assert.equal(tree, git(root, 'rev-parse', 'HEAD^{tree}').trim());
    const missing = runCommand(['check'], () => context, NOW);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /^pre-push: no docs-only stamp for tree [0-9a-f]{12} and merge base [0-9a-f]{12}; running make verify\n$/);
    const written = runCommand(['write', 'docs-only', tree], () => context, NOW);
    assert.equal(written.stdout, `make verify: passed, profile docs-only, tree ${tree}; stamp written\n`);
    const hit = runCommand(['check'], () => context, NOW);
    assert.equal(hit.status, 0);
    assert.match(hit.stdout, /; skipping make verify\n$/);
    assert.equal(runCommand(['check', 'full'], () => context, NOW).status, 1);
  });
});

test('invalid commands print the usage with status 2', () => {
  const context = (): StampContext => ({ root: '/', git: (() => '') as Git, toolchain: TOOLCHAIN, environment: {} });
  for (const args of [[], ['unknown'], ['write', 'full'], ['write', 'partial', 'tree'], ['check', 'docs-only'], ['check', 'full', 'x']]) {
    const result = runCommand(args, context, NOW);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /^usage: verify-stamp\.ts/);
  }
  const forced = runCommand(['profile'], () => ({ ...context(), environment: { [PROFILE_VARIABLE]: 'fast' } }), NOW);
  assert.equal(forced.status, 2);
  assert.match(forced.stderr, /may only be full, not fast/);
});

test('an unexpected failure propagates', () => {
  const failing: Git = () => { throw new Error('git broke'); };
  assert.throws(() => runCommand(['start'], () => ({ root: '/', git: failing, toolchain: TOOLCHAIN, environment: {} }), NOW), /git broke/);
});

test('a dry run of make verify writes no stamp', () => {
  for (const flags of ['n', 'ns', ' --no-print-directory -n', '--dry-run', '--just-print', '--recon']) assert.equal(isDryRun(flags), true, flags);
  for (const flags of [undefined, '', 's', ' --no-print-directory', 'X=n', '-s']) assert.equal(isDryRun(flags), false, String(flags));
  withRepository((_root, context) => {
    const tree = startTree(context.git);
    const dry = runCommand(['write', 'full', tree], () => ({ ...context, environment: { MAKEFLAGS: 'n' } }), NOW);
    assert.equal(dry.stdout, 'make verify: dry run; no stamp written\n');
    assert.equal(checkStamp(context, 'full').verified, false);
  });
});

function dryRunChecks(profile: string): string {
  const repository = join(import.meta.dirname, '..');
  return execFileSync('make', ['-n', '--no-print-directory', 'verify-checks', `VERIFY_PROFILE=${profile}`], {
    cwd: repository, encoding: 'utf8', env: { ...fixtureEnv, MAKEFLAGS: '' },
  });
}

test('the docs-only profile skips make test and keeps every other check', () => {
  const docsOnly = dryRunChecks('docs-only');
  const full = dryRunChecks('full');
  assert.match(docsOnly, /make verify: docs-only profile skips make test/);
  assert.doesNotMatch(docsOnly, /services\.sh run/);
  assert.match(full, /services\.sh run/);
  const others = ['verify:comments', 'verify:findings', 'check-contract-compatibility.ts', 'verify:dependencies', 'validate --all --strict', 'verify:links', 'verify:archive', 'verify:package'];
  for (const check of others) {
    assert.ok(docsOnly.includes(check), `docs-only lacks ${check}`);
    assert.ok(full.includes(check), `full lacks ${check}`);
  }
});
