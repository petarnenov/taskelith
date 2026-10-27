import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import { WORKSPACE_LAYOUT, WORKSPACE_MODES, type PrepareWorkspace, type WorkspaceFixture } from '@taskelith/workspace';
import { createFixture, type TempDirWorkspaces } from './temp-dir-workspaces.ts';

// The double's own modes and records, which the suite cannot see through
// the port; the Linux checks with real accounts belong to item 16.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const FIRST = must(parseIdentifier('AttemptId', 'attempt-1')) as AttemptId;
const SECOND = must(parseIdentifier('AttemptId', 'attempt-2')) as AttemptId;

function request(fixture: WorkspaceFixture, overrides: Partial<PrepareWorkspace> = {}): PrepareWorkspace {
  return {
    attemptId: FIRST,
    projectId: must(parseIdentifier('ProjectId', 'project-1')) as ProjectId,
    taskId: must(parseIdentifier('TaskId', 'task-1')) as TaskId,
    binding: fixture.binding,
    target: { kind: 'task-branch' },
    credential: fixture.credentials.write,
    ...overrides,
  };
}

async function withFixture(use: (fixture: WorkspaceFixture, provider: TempDirWorkspaces) => Promise<void>): Promise<void> {
  const { fixture, dispose } = await createFixture();
  try {
    await use(fixture, fixture.provider as TempDirWorkspaces);
  } finally {
    await dispose();
  }
}

const modeOf = async (path: string) => (await stat(path)).mode & 0o7777;

test('a prepared workspace keeps its record closed and its checkout reclaimed', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  const attempt = dirname(checkout);
  assert.equal(await modeOf(attempt), WORKSPACE_MODES.attempt);
  assert.equal(await modeOf(join(attempt, WORKSPACE_LAYOUT.metadata)), WORKSPACE_MODES.metadata);
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
}));

test('a hand-off opens the checkout and a reclaim gives the group what the agent wrote', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutHandedOff);
  await mkdir(join(checkout, 'private'), { mode: 0o700 });
  await writeFile(join(checkout, 'private', 'note.txt'), 'note\n', { mode: 0o600 });
  await chmod(join(checkout, 'private', 'note.txt'), 0o600);
  must(await provider.reclaim(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
  assert.equal(await modeOf(join(checkout, 'private')), 0o2770);
  assert.equal(await modeOf(join(checkout, 'private', 'note.txt')), 0o660);
}));

test('a rewritten Git state in an at-head checkout cannot make it publish', () => withFixture(async (fixture, provider) => {
  const base = must(await provider.prepare(request(fixture))).head;
  const review = must(await provider.prepare(request(fixture, { attemptId: SECOND, target: { kind: 'at-head', head: base } })));
  const statePath = join(review.workingDirectory, '.git', 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
  const claimed = { ...state, kind: 'task-branch', expectedBranch: 'taskelith/task-1', branch: 'taskelith/task-1' };
  await writeFile(statePath, JSON.stringify(claimed));
  const credential = fixture.credentials.write;
  const read = await provider.readRemoteHead({ attemptId: SECOND, credential });
  const pushed = await provider.push({ attemptId: SECOND, credential, expectedRemoteHead: null });
  for (const result of [read, pushed]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.details.reason, 'read-only-workspace');
  }
}));
