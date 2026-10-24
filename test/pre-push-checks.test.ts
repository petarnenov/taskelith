import assert from 'node:assert/strict';
import test from 'node:test';
import { unverifiedPushRefs } from '../scripts/pre-push-checks.ts';

const head = 'a'.repeat(40);
const other = 'b'.repeat(40);
const none = '0'.repeat(40);

test('only pushed commits other than the checked-out one are unverified', () => {
  assert.deepEqual(unverifiedPushRefs(`refs/heads/feature ${head} refs/heads/feature ${none}\n`, head), []);
  assert.deepEqual(unverifiedPushRefs(`refs/heads/other ${other} refs/heads/other ${none}\n`, head), ['refs/heads/other']);
  assert.deepEqual(unverifiedPushRefs(`(delete) ${none} refs/heads/old ${other}\n`, head), []);
  assert.deepEqual(unverifiedPushRefs('', head), []);
  assert.deepEqual(unverifiedPushRefs(`refs/tags/v1 ${other} refs/tags/v1 ${none}\nrefs/heads/feature ${head} refs/heads/feature ${none}`, head), ['refs/tags/v1']);
});
