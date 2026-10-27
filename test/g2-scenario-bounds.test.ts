import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runCleanupSteps } from './g2-scenarios/scenario-run.ts';
import { Gate, within } from './g2-scenarios/waiting.ts';

// The bounds that turn a hung G2 scenario wait or cleanup into a named
// failure instead of a test file that never ends.
const never = () => new Promise<void>(() => undefined);

describe('G2 scenario bounds', () => {
  test('within settles as its promise does before the bound', async () => {
    assert.equal(await within(Promise.resolve(7), 1_000, 'the value'), 7);
    await assert.rejects(within(Promise.reject(new Error('own failure')), 1_000, 'the value'), /own failure/);
  });

  test('within fails naming what did not settle in time', async () => {
    await assert.rejects(within(never(), 20, 'the hung step'), /the hung step did not settle within 20 ms/);
  });

  test('a gate waits until it is opened', async () => {
    const gate = new Gate();
    const waited = gate.wait('the held step', 1_000);
    gate.open();
    await waited;
    assert.equal(gate.isOpen, true);
  });

  test('a gate that is never opened fails by name', async () => {
    await assert.rejects(new Gate().wait('the held step', 20), /the held step did not settle within 20 ms/);
  });

  test('cleanup runs every step after a failed or hung one and names them', async () => {
    const ran: string[] = [];
    const cleanup = runCleanupSteps([
      ['the failing step', async () => { ran.push('failing'); throw new Error('no /proc'); }],
      ['the hung step', async () => { ran.push('hung'); await never(); }],
      ['the last step', async () => { ran.push('last'); }],
    ], 20);
    await assert.rejects(cleanup, /cleanup failed: the failing step: no \/proc; the hung step: the hung step did not settle within 20 ms$/);
    assert.deepEqual(ran, ['failing', 'hung', 'last']);
  });

  test('cleanup without a failure resolves', async () => {
    await runCleanupSteps([['the step', async () => undefined]], 20);
  });
});
