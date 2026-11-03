import assert from 'node:assert/strict';
import test from 'node:test';
import { NoMergeQueue } from '@taskelith/integrations';

test('the empty merge queue holds no request, claims none, and refuses to take one', async () => {
  const queue = new NoMergeQueue();
  const latest = await queue.latestForRun('run-1' as never);
  assert.equal(latest.ok || latest.error.code, 'not-found');
  assert.deepEqual(await queue.claimNext('project-1' as never), { ok: true, value: { outcome: 'queue-empty' } });
  const transition = await queue.transition();
  assert.equal(transition.ok || transition.error.code, 'not-found');
  for (const refused of [await queue.enqueue(), await queue.recordManualMerge()]) assert.equal(refused.ok || refused.error.code, 'unavailable');
});
