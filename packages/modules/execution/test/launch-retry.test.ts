import assert from 'node:assert/strict';
import test from 'node:test';
import { LAUNCH_RETRY_DELAY, launchRetryDelay } from '@taskelith/execution';

const { initialMilliseconds, maximumMilliseconds } = LAUNCH_RETRY_DELAY;

test('the launch retry delay doubles from 5 s and stays within [5 s, 60 s]', () => {
  assert.equal(launchRetryDelay(1, 0), 5_000);
  assert.equal(launchRetryDelay(2, 0), 10_000);
  assert.equal(launchRetryDelay(5, 0), 60_000);
  for (const retry of [1, 2, 3, 4, 5, 20, 100]) {
    for (const draw of [0, 0.5, 0.999_999]) {
      const delay = launchRetryDelay(retry, draw);
      assert.ok(delay >= initialMilliseconds && delay <= maximumMilliseconds, `${retry} ${draw} gave ${delay}`);
    }
  }
});

test('jitter adds up to one more base below the cap', () => {
  assert.equal(launchRetryDelay(1, 0.5), 7_500);
  assert.equal(launchRetryDelay(4, 0.999_999), 59_999);
});

test('the launch retry delay refuses a retry below 1 or a draw outside [0, 1)', () => {
  assert.throws(() => launchRetryDelay(0, 0), RangeError);
  assert.throws(() => launchRetryDelay(1.5, 0), RangeError);
  assert.throws(() => launchRetryDelay(1, 1), RangeError);
  assert.throws(() => launchRetryDelay(1, -0.1), RangeError);
});
