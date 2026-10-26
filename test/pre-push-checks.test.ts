import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeleteOnlyPush, unverifiedPushRefs } from '../scripts/pre-push-checks.ts';

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

test('a push is delete-only when it has refs and every one is a deletion', () => {
  const deletion = `(delete) ${none} refs/heads/old ${other}\n`;
  const update = `refs/heads/feature ${head} refs/heads/feature ${none}\n`;
  assert.equal(isDeleteOnlyPush(deletion), true);
  assert.equal(isDeleteOnlyPush(deletion + deletion.replace('old', 'older')), true);
  assert.equal(isDeleteOnlyPush(`(delete) ${'0'.repeat(64)} refs/heads/old ${'b'.repeat(64)}\n`), true);
  assert.equal(isDeleteOnlyPush(deletion + update), false);
  assert.equal(isDeleteOnlyPush(update), false);
  assert.equal(isDeleteOnlyPush(''), false);
  assert.equal(isDeleteOnlyPush('\n  \n'), false);
});

test('a malformed ref line never makes a push delete-only', () => {
  const zeros = none;
  const malformed = [
    `x ${zeros}`,
    `(delete) ${zeros}`,
    `(delete) ${zeros} refs/heads/old`,
    `(delete) ${zeros} refs/heads/old ${other} extra`,
    `(delete) ${'0'.repeat(39)} refs/heads/old ${other}`,
    `(delete) ${'0'.repeat(41)} refs/heads/old ${other}`,
    `(delete) ${zeros} refs/heads/old ${'g'.repeat(40)}`,
    `(delete) ${zeros} refs/heads/old ${'b'.repeat(39)}`,
  ];
  for (const line of malformed) {
    assert.equal(isDeleteOnlyPush(`${line}\n`), false, line);
    assert.equal(isDeleteOnlyPush(`(delete) ${zeros} refs/heads/old ${other}\n${line}\n`), false, line);
  }
  assert.equal(isDeleteOnlyPush(`  (delete)\t${zeros}   refs/heads/old  ${other}  \n`), true);
});
