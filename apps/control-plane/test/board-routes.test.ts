import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  type PasswordHasher,
  type PrincipalId,
} from '@taskelith/access';
import { BoardViews, ControlPlaneApi, createApiServer, type ApiServices } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';
import { AS_OF, BoardWorld, EARLY, execution, item, run, task, worker } from './board-fixtures.ts';
import { addProjects } from './project-fixtures.ts';

const INVOCATION = { actor: 'root@control-plane-1', reason: 'board route test' };
const hasher: PasswordHasher = { hash: async () => ok('hash' as never), verify: async () => ok(false) } as never;

// Each bearer token names one principal, so a test picks a role by token.
const store = new InMemoryAccessStore();
const secrets = new NodeSecrets();
const clock = { now: () => AS_OF };
const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
await addProjects(store, ['alpha', 'beta'], AS_OF);
const principals = new Map<string, PrincipalId>([['owner', owner]]);
for (const [loginName, role] of [['vera', 'project-viewer'], ['otto', 'project-operator'], ['nora', undefined]] as const) {
  principals.set(loginName, value(await administration.createPrincipal(owner, loginName, INVOCATION)).principalId);
  if (role !== undefined) value(await administration.assignProjectRole(owner, { projectId: 'alpha', loginName, role }, INVOCATION));
}
const token = (name: string) => `tkop_${name.padEnd(43, 'x')}`;
const as = (name: string) => ({ authorization: `Bearer ${token(name)}` });

const world = new BoardWorld();
world.workers.push(worker('w-1'));
await world.card('run-1', 'alpha', EARLY, run('run-1', { proposal: 'completed', specs: 'completed', apply: 'in-progress' }));
await world.addTask('run-1', task('task-1', [{ id: 'att-1', executions: [execution('ex-1', 'w-1')] }]), 'apply');
world.items = [item('i-1', 'run-1', { taskId: 'task-1' })];

const api = new ControlPlaneApi({
  operator: {
    authenticate: async (secret: string) => {
      const name = [...principals.keys()].find((each) => token(each) === secret);
      return name === undefined ? err(failure('forbidden', 'not an operator')) : ok(principals.get(name)!);
    },
  },
  authorization: new AuthorizationService(store),
  board: {
    views: new BoardViews({ ...world.parts(), store: world.store() }),
    projects: new ProjectSetupService({ store, random: secrets, clock }),
    authorization: new AuthorizationService(store),
  },
} as unknown as ApiServices);
const server = createApiServer(api);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function get(path: string, name = 'vera'): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, { headers: as(name) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const PROJECT_READS = ['/projects/alpha/board', '/projects/alpha/cards/run-1', '/projects/alpha/inbox', '/projects/alpha/inbox/counts'];

test('a project-viewer reads the board, the task detail, and the inbox, and only an operator may act', async () => {
  const board = await get('/projects/alpha/board');
  assert.equal(board.status, 200);
  assert.deepEqual([board.body.position, board.body.workersOnline, board.body.callerMayAct], ['7', 1, false]);
  const [card] = board.body.cards as Record<string, unknown>[];
  assert.deepEqual([card!.runId, card!.column, card!.needsYou, card!.waitingFor], ['run-1', 'implement', 1, 'person']);
  assert.equal((await get('/projects/alpha/board', 'otto')).body.callerMayAct, true);
  assert.equal((await get('/projects/alpha/board', 'owner')).body.callerMayAct, false, 'an owner without a project role may not act');
  const detail = await get('/projects/alpha/cards/run-1');
  assert.equal(detail.status, 200);
  assert.deepEqual((detail.body.tasks as { taskId: string }[]).map((each) => each.taskId), ['task-1']);
  const inbox = await get('/projects/alpha/inbox?kind=permission-request&runId=run-1');
  assert.deepEqual([inbox.status, (inbox.body.items as { itemId: string }[]).map((each) => each.itemId)], [200, ['i-1']]);
  const counts = await get('/projects/alpha/inbox/counts');
  assert.deepEqual([counts.status, counts.body.total, counts.body.byCard], [200, 1, [{ runId: 'run-1', count: 1 }]]);
});

test('a principal without a role on the project is refused 403 role-required on every project view', async () => {
  for (const path of [...PROJECT_READS, ...PROJECT_READS.map((each) => each.replace('alpha', 'beta').replace('run-1', 'run-x'))]) {
    const denied = await get(path, 'nora');
    assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'project-viewer' }], path);
  }
});

test('an unknown project or card answers 404, and a malformed filter 400', async () => {
  for (const path of PROJECT_READS.map((each) => each.replace('alpha', 'gamma'))) assert.equal((await get(path, 'owner')).status, 404, path);
  assert.equal((await get('/projects/alpha/cards/run-none')).status, 404);
  assert.equal((await get('/projects/beta/cards/run-1', 'owner')).status, 404, 'a card of another project');
  assert.equal((await get('/projects/alpha/inbox?kind=bogus')).status, 400);
  assert.equal((await get('/projects/alpha/inbox?runId=a%20b')).status, 400);
});

test('only an installation-owner reads the installation inbox and its counts', async () => {
  const inbox = await get('/inbox?kind=reconciliation', 'owner');
  assert.deepEqual([inbox.status, inbox.body.items], [200, []]);
  assert.equal((await get('/inbox?kind=bogus', 'owner')).status, 400);
  const counts = await get('/inbox/counts', 'owner');
  assert.deepEqual([counts.status, counts.body.total, counts.body.byCard, counts.body.position], [200, 0, [], '7']);
  for (const path of ['/inbox', '/inbox/counts']) {
    const denied = await get(path, 'vera');
    assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'installation-owner' }], path);
  }
});

test('a view whose source cannot be read answers 503', async () => {
  world.failSource = true;
  try {
    for (const path of ['/projects/alpha/board', '/projects/alpha/inbox', '/projects/alpha/inbox/counts']) assert.equal((await get(path)).status, 503, path);
  } finally {
    world.failSource = false;
  }
});
