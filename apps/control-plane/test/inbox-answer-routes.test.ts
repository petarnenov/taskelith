import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, test } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  OwnerBootstrapService,
  PrincipalAdministration,
  type PasswordHasher,
  type PrincipalId,
} from '@taskelith/access';
import { ControlPlaneApi, InboxAnswers, createApiServer, type ApiServices } from '@taskelith/control-plane';
import {
  ALREADY_ANSWERED,
  InMemoryInboxAnswerKeys,
  type AnswerRequest,
  type NeedsYouItem,
  type NeedsYouScope,
  type NeedsYouSource,
} from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import { NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';
import { AS_OF, LATE, item } from './board-fixtures.ts';
import { addProjects } from './project-fixtures.ts';

const INVOCATION = { actor: 'root@control-plane-1', reason: 'inbox answer route test' };
const hasher: PasswordHasher = { hash: async () => ok('hash' as never), verify: async () => ok(false) } as never;

const store = new InMemoryAccessStore();
const secrets = new NodeSecrets();
const clock = { now: () => AS_OF };
const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
await addProjects(store, ['alpha', 'beta'], AS_OF);
const principals = new Map<string, PrincipalId>([['owner', owner]]);
for (const [loginName, role] of [['vera', 'project-viewer'], ['otto', 'project-operator'], ['mara', 'project-maintainer']] as const) {
  principals.set(loginName, value(await administration.createPrincipal(owner, loginName, INVOCATION)).principalId);
  value(await administration.assignProjectRole(owner, { projectId: 'alpha', loginName, role }, INVOCATION));
}
// `lena` loses her alpha role in a test; `sam` holds no role, `bea` beta's.
for (const [loginName, projects] of [['lena', ['alpha', 'beta']], ['sam', []], ['bea', ['beta']]] as const) {
  principals.set(loginName, value(await administration.createPrincipal(owner, loginName, INVOCATION)).principalId);
  for (const projectId of projects) {
    value(await administration.assignProjectRole(owner, { projectId, loginName, role: 'project-operator' }, INVOCATION));
  }
}
const token = (name: string) => `tkop_${name.padEnd(43, 'x')}`;

const PROCESS_ITEM = {
  id: 'i-process', sourceId: 'reconciliation', kind: 'reconciliation', reconciliationReason: 'unrecorded-process', containment: 'cgroup x',
  processCount: 1, subject: { scope: 'installation', workerId: 'w-1', journalId: 'j-1', observationId: 'o-1' }, title: 'A process',
  createdAt: LATE, answerableBy: 'installation-owner', state: 'open',
} as unknown as NeedsYouItem;

// Holds the items by identifier and resolves each on its first answer;
// `refusals` names an item's refusal reason.
class ItemSource implements NeedsYouSource {
  readonly id = 'native-requests' as never;
  readonly kinds = ['permission-request', 'reconciliation'] as const;
  readonly items = new Map<string, NeedsYouItem>();
  readonly refusals = new Map<string, string>();
  readonly received: unknown[] = [];

  reset(): void {
    this.received.length = 0;
    this.items.clear();
    this.refusals.clear();
    const maintained = { ...item('i-maintained', 'run-1'), answerableBy: 'project-maintainer' } as NeedsYouItem;
    for (const each of [item('i-1', 'run-1'), maintained, item('i-beta', 'run-2', { projectId: 'beta' }), PROCESS_ITEM]) this.items.set(each.id, each);
  }

  async openItems() {
    return ok({ items: [], position: '0' });
  }

  async item(scope: NeedsYouScope, itemId: string) {
    const found = this.items.get(itemId);
    if (found === undefined) return ok(undefined);
    const inScope = found.subject.scope === 'card' ? scope.kind === 'project' && scope.projectId === found.subject.projectId : scope.kind === 'installation';
    return ok(inScope ? found : undefined);
  }

  async answer(request: AnswerRequest) {
    this.received.push(request.answer);
    const current = this.items.get(request.itemId)!;
    const refusal = this.refusals.get(request.itemId);
    if (refusal !== undefined) return err(failure('precondition-failed', 'refused', { reason: refusal }));
    if (current.state !== 'open') return err(failure('conflict', 'resolved', { reason: ALREADY_ANSWERED }));
    const { state: _state, ...fields } = current;
    const resolved = { ...fields, state: 'resolved', resolution: { resolvedBy: request.responder, resolvedAt: LATE, answer: request.answer } } as NeedsYouItem;
    this.items.set(request.itemId, resolved);
    return ok(resolved);
  }
}

const source = new ItemSource();
let keys = new InMemoryInboxAnswerKeys();
beforeEach(() => {
  source.reset();
  keys = new InMemoryInboxAnswerKeys();
});
const answers = new InboxAnswers({
  snapshot: (work) => work([source]),
  transaction: (work) => work({ keys, sources: [source] }),
}, { digest: (input) => `digest:${input}` });

const authorization = new AuthorizationService(store);
const api = new ControlPlaneApi({
  operator: {
    authenticate: async (secret: string) => {
      const name = [...principals.keys()].find((each) => token(each) === secret);
      return name === undefined ? err(failure('forbidden', 'not an operator')) : ok(principals.get(name)!);
    },
  },
  authorization,
  board: { views: undefined as never, projects: undefined as never, authorization, answers },
} as unknown as ApiServices);
const server = createApiServer(api);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const DENY = { kind: 'permission-request', decision: 'deny' };
const ACKNOWLEDGE = { kind: 'reconciliation', decision: 'acknowledge-process', evidence: 'incident-7', reason: 'handled' };

async function post(path: string, name: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token(name)}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const answer = (path: string, name: string, key: string, given: object = DENY) => post(path, name, { idempotencyKey: key, answer: given });

test('an operator\'s answer resolves the item, a repeat returns it, and another answer is refused 409', async () => {
  const first = await answer('/projects/alpha/inbox/i-1/answer', 'otto', 'key-1');
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.itemId, (first.body.status as { state: string; answer: unknown }).state, (first.body.status as { answer: unknown }).answer], [
    'i-1', 'resolved', DENY,
  ]);
  assert.deepEqual(await answer('/projects/alpha/inbox/i-1/answer', 'otto', 'key-1'), first);
  const reused = await answer('/projects/alpha/inbox/i-1/answer', 'otto', 'key-1', { kind: 'permission-request', decision: 'allow' });
  assert.deepEqual([reused.status, reused.body.details], [409, { reason: 'idempotency-key-reused' }]);
  const second = await answer('/projects/alpha/inbox/i-1/answer', 'otto', 'key-2');
  assert.deepEqual([second.status, second.body.details], [409, { reason: 'already-answered' }]);
});

test('a principal below the item\'s role is refused 403 before its body is read, and an unknown item 404', async () => {
  const viewer = await answer('/projects/alpha/inbox/i-1/answer', 'vera', 'key-1');
  assert.deepEqual([viewer.status, viewer.body.details], [403, { reason: 'role-required', requiredRole: 'project-operator' }]);
  const below = await post('/projects/alpha/inbox/i-maintained/answer', 'otto', { malformed: true });
  assert.deepEqual([below.status, below.body.details], [403, { reason: 'role-required', requiredRole: 'project-maintainer' }]);
  assert.equal((await answer('/projects/alpha/inbox/i-maintained/answer', 'mara', 'key-1')).status, 200);
  assert.equal((await post('/projects/alpha/inbox/i-none/answer', 'otto', { malformed: true })).status, 404);
  assert.equal((await answer('/projects/alpha/inbox/i-beta/answer', 'otto', 'key-1')).status, 404, 'an item of another project');
  assert.equal((await answer('/projects/alpha/inbox/i-process/answer', 'otto', 'key-1')).status, 404, 'an installation item');
  assert.equal((await post('/projects/alpha/inbox/i-1/answer', 'otto', { idempotencyKey: 'key-1', answer: { kind: 'bogus' } })).status, 400);
  assert.equal(source.items.get('i-1')!.state, 'open');
});

test('a replay after its principal lost the item\'s scope or role is refused as a stranger is', async () => {
  const path = '/projects/alpha/inbox/i-1/answer';
  assert.equal((await answer(path, 'lena', 'key-1')).status, 200);
  const outOfScope = await answer('/projects/beta/inbox/i-1/answer', 'lena', 'key-1');
  assert.deepEqual(outOfScope, await answer('/projects/beta/inbox/i-1/answer', 'bea', 'key-1'));
  assert.equal(outOfScope.status, 404);
  value(await administration.removeProjectRole(owner, { projectId: 'alpha', loginName: 'lena' }, INVOCATION));
  const roleLost = await answer(path, 'lena', 'key-1');
  assert.deepEqual(roleLost, await answer(path, 'sam', 'key-1'));
  assert.equal(roleLost.status, 403);
});

test('a refusal of the item\'s source answers 422 with its reason', async () => {
  for (const reason of ['item-closed', 'attempt-not-current', 'subject-changed']) {
    source.refusals.set('i-1', reason);
    const refused = await answer('/projects/alpha/inbox/i-1/answer', 'otto', `key-${reason}`);
    assert.deepEqual([refused.status, refused.body.details], [422, { reason }], reason);
  }
});

test('only an installation-owner answers an installation item, which no project inbox holds', async () => {
  const viewer = await answer('/inbox/i-process/answer', 'vera', 'key-1', ACKNOWLEDGE);
  assert.deepEqual([viewer.status, viewer.body.details], [403, { reason: 'role-required', requiredRole: 'installation-owner' }]);
  assert.equal((await answer('/inbox/i-1/answer', 'owner', 'key-1')).status, 404, 'a project item');
  const answered = await answer('/inbox/i-process/answer', 'owner', 'key-1', ACKNOWLEDGE);
  assert.deepEqual([answered.status, answered.body.reconciliationReason, (answered.body.status as { state: string }).state], [
    200, 'unrecorded-process', 'resolved',
  ]);
});

test('every answer kind reaches the source as the port\'s answer, and evidence with a control character is 400', async () => {
  const kinds = [
    { kind: 'input-request', text: 'yes' }, { kind: 'spec-approval', decision: 'reject', reason: 'why' },
    { kind: 'escalation', decision: 'retry' }, { kind: 'delivery-acknowledgement', decision: 'acknowledge' },
    { kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident-7', reason: 'gone' },
  ];
  for (const [index, given] of kinds.entries()) {
    source.reset();
    assert.equal((await answer('/projects/alpha/inbox/i-maintained/answer', 'mara', `key-${index}`, given)).status, 200, given.kind);
    assert.deepEqual(source.received, [given]);
  }
  source.reset();
  const malformed = { ...ACKNOWLEDGE, evidence: 'incident\u00077' };
  assert.equal((await answer('/inbox/i-process/answer', 'owner', 'key-1', malformed)).status, 400);
  assert.deepEqual(source.received, []);
});
