import assert from 'node:assert/strict';
import test from 'node:test';
import { InboxAnswerApi, type InboxAnswerOperations } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { failed } from '@taskelith/testing';

// Operations that fail if reached, so each refusal below comes first.
const UNREACHED: InboxAnswerOperations = {
  answers: {
    item: async () => err(failure('internal', 'item reached')),
    answer: async () => err(failure('internal', 'answer reached')),
  },
  authorization: { authorize: async () => ok(undefined) },
};
const api = new InboxAnswerApi(UNREACHED);
const DENY = { idempotencyKey: 'key-1', answer: { kind: 'permission-request', decision: 'deny' } };

function request(principalId: string | undefined, parameters: readonly string[], body: unknown = DENY) {
  return { principalId, parameters, body } as never;
}

test('an anonymous caller is unauthenticated, and a malformed item identifier names no item', async () => {
  const anonymous = failed(await api.authorizeItem('answerInboxItem', {} as never, ['alpha', 'i-1']));
  assert.deepEqual([anonymous.code, anonymous.details.reason], ['forbidden', 'unauthenticated']);
  const malformed = failed(await api.authorizeItem('answerInstallationInboxItem', { principalId: 'p-1' } as never, ['']));
  assert.equal(malformed.code, 'not-found');
});

test('the handler refuses a request without a valid principal, item, or key before the answers', async () => {
  assert.equal(failed(await api.answer('answerInboxItem', request(undefined, ['alpha', 'i-1']))).code, 'internal');
  assert.equal(failed(await api.answer('answerInboxItem', request('', ['alpha', 'i-1']))).code, 'invalid');
  assert.equal(failed(await api.answer('answerInboxItem', request('p-1', ['alpha', '']))).code, 'not-found');
  const keyless = failed(await api.answer('answerInboxItem', request('p-1', ['alpha', 'i-1'], { ...DENY, idempotencyKey: '' })));
  assert.equal(keyless.code, 'invalid');
  assert.equal(failed(await api.answer('answerInboxItem', request('p-1', ['alpha', 'i-1']))).message, 'answer reached');
});
