import assert from 'node:assert/strict';
import test from 'node:test';
import { InboxAnswers, answerInput, type InboxAnswerSubmission } from '@taskelith/control-plane';
import {
  ALREADY_ANSWERED,
  InMemoryInboxAnswerKeys,
  KEY_REUSED,
  type AnswerRequest,
  type NeedsYouAnswer,
  type NeedsYouItem,
  type NeedsYouScope,
  type NeedsYouSource,
} from '@taskelith/execution';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { item } from './board-fixtures.ts';

const ALPHA: NeedsYouScope = { kind: 'project', projectId: 'alpha' as never };
const BETA: NeedsYouScope = { kind: 'project', projectId: 'beta' as never };
const DENY: NeedsYouAnswer = { kind: 'permission-request', decision: 'deny' };
const ALLOW: NeedsYouAnswer = { kind: 'permission-request', decision: 'allow' };

function submission(key: string, answer = DENY, responder = 'person-1'): InboxAnswerSubmission {
  return { itemId: 'i-1' as never, responder: responder as never, answer, idempotencyKey: key as never };
}

// A source of one alpha item that resolves it on its first answer only.
class OneItemSource implements NeedsYouSource {
  readonly id = 'native-requests' as never;
  readonly kinds = ['permission-request'] as const;
  readonly requests: AnswerRequest[] = [];
  current: NeedsYouItem = item('i-1', 'run-1');
  refusal: string | undefined;

  async openItems() {
    return ok({ items: [], position: '0' });
  }

  async item(scope: NeedsYouScope, itemId: string): Promise<Result<NeedsYouItem | undefined>> {
    return ok(scope.kind === 'project' && scope.projectId === 'alpha' && itemId === this.current.id ? this.current : undefined);
  }

  async answer(request: AnswerRequest) {
    this.requests.push(request);
    if (this.refusal !== undefined) return err(failure('precondition-failed', 'refused', { reason: this.refusal }));
    if (this.current.state !== 'open') return err(failure('conflict', 'resolved', { reason: ALREADY_ANSWERED }));
    const { state: _state, ...fields } = this.current;
    this.current = { ...fields, state: 'resolved', resolution: { resolvedBy: request.responder, resolvedAt: 'later' as never, answer: request.answer } };
    return ok(this.current);
  }
}

function answers(source = new OneItemSource(), keys = new InMemoryInboxAnswerKeys()) {
  const service = new InboxAnswers({ transaction: (work) => work({ keys, sources: [emptySource(), source] }) }, { digest: (input) => `digest:${input}` });
  return { service, source, keys };
}

function emptySource(): NeedsYouSource {
  return {
    id: 'reconciliation' as never, kinds: ['reconciliation'], openItems: async () => ok({ items: [], position: '0' }),
    item: async () => ok(undefined), answer: async () => err(failure('internal', 'not this source')),
  };
}

test('a new key reaches the item\'s source once, in the inbox\'s scope, and a repeat returns the first outcome', async () => {
  const { service, source } = answers();
  const first = value(await service.answer(ALPHA, submission('key-1')));
  assert.equal(first.state, 'resolved');
  assert.deepEqual(source.requests.map((request) => [request.scope, request.itemId, request.idempotencyKey]), [[ALPHA, 'i-1', 'key-1']]);
  assert.deepEqual(value(await service.answer(ALPHA, submission('key-1'))), first);
  assert.equal(source.requests.length, 1, 'the source never sees a repeated key');
});

test('a key repeated with another answer or responder is idempotency-key-reused, before the source', async () => {
  const { service, source } = answers();
  value(await service.answer(ALPHA, submission('key-1')));
  for (const other of [submission('key-1', ALLOW), submission('key-1', DENY, 'person-2')]) {
    const reused: Failure = failed(await service.answer(ALPHA, other));
    assert.deepEqual([reused.code, reused.details.reason], ['conflict', KEY_REUSED]);
  }
  assert.equal(source.requests.length, 1);
  const second = failed(await service.answer(ALPHA, submission('key-2', ALLOW)));
  assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED], 'a new key reaches the source, which refuses it');
});

test('a refused answer records no key, so the same key reaches the source again', async () => {
  const { service, source, keys } = answers();
  source.refusal = 'attempt-not-current';
  assert.equal(failed(await service.answer(ALPHA, submission('key-1'))).details.reason, 'attempt-not-current');
  assert.equal(value(await keys.find('i-1' as never, 'key-1' as never)), undefined);
  source.refusal = undefined;
  assert.equal(value(await service.answer(ALPHA, submission('key-1'))).state, 'resolved');
  assert.equal(source.requests.length, 2);
});

test('an item outside the inbox\'s scope, or unknown, is not-found, and item reads one in any state', async () => {
  const { service, source } = answers();
  assert.equal(failed(await service.answer(BETA, submission('key-1'))).code, 'not-found');
  assert.equal(failed(await service.answer({ kind: 'installation' }, submission('key-1'))).code, 'not-found');
  assert.equal(failed(await service.item(ALPHA, 'i-9' as never)).code, 'not-found');
  assert.equal(source.requests.length, 0);
  assert.equal(value(await service.item(ALPHA, 'i-1' as never)).state, 'open');
  value(await service.answer(ALPHA, submission('key-1')));
  assert.equal(value(await service.item(ALPHA, 'i-1' as never)).state, 'resolved');
});

test('a held key outside the inbox\'s scope is not-found, never the first outcome or a reused key', async () => {
  const { service, source } = answers();
  value(await service.answer(ALPHA, submission('key-1')));
  for (const scope of [BETA, { kind: 'installation' } as const]) {
    for (const repeat of [submission('key-1'), submission('key-1', ALLOW)]) {
      assert.equal(failed(await service.answer(scope, repeat)).code, 'not-found', `${scope.kind} ${repeat.answer.kind}`);
    }
  }
  assert.equal(source.requests.length, 1);
});

test('another principal repeating a key never receives the first principal\'s outcome', async () => {
  const { service } = answers();
  value(await service.answer(ALPHA, submission('key-1')));
  const other = failed(await service.answer(ALPHA, submission('key-1', DENY, 'person-2')));
  assert.deepEqual([other.code, other.details.reason], ['conflict', KEY_REUSED]);
});

test('a store failure fails the answer and the item read', async () => {
  const broken = { find: async () => err(failure('unavailable', 'down')), record: async () => ok(undefined) };
  const { service } = answers(new OneItemSource(), broken as never);
  assert.equal(failed(await service.answer(ALPHA, submission('key-1'))).code, 'unavailable');
  const failing = new OneItemSource();
  failing.item = async () => err(failure('unavailable', 'down'));
  assert.equal(failed(await answers(failing).service.item(ALPHA, 'i-1' as never)).code, 'unavailable');
});

test('the digest input names the responder and every field of the answer, in a fixed order', () => {
  const answers: NeedsYouAnswer[] = [
    DENY, { kind: 'input-request', text: 'yes' }, { kind: 'spec-approval', decision: 'reject', reason: 'why' },
    { kind: 'escalation', decision: 'retry' }, { kind: 'delivery-acknowledgement', decision: 'acknowledge' },
    { kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident-7' as never, reason: 'gone' },
  ];
  assert.deepEqual(answers.map((answer) => answerInput({ responder: 'p' as never, answer })), [
    '["p","permission-request","deny"]', '["p","input-request","yes"]', '["p","spec-approval","reject","why"]',
    '["p","escalation","retry"]', '["p","delivery-acknowledgement","acknowledge"]',
    '["p","reconciliation","resolve-execution","incident-7","gone"]',
  ]);
});
