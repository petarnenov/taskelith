import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INBOX_CONFORMANCE,
  InMemoryInbox,
  InMemoryProducerCursors,
  InMemoryTaskRepository,
  PRODUCER_CURSORS_CONFORMANCE,
  TASK_REPOSITORY_CONFORMANCE,
} from '@taskelith/execution';
import type { ConformanceCase } from '@taskelith/sdlc';

function runSuite<Port>(adapter: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`${adapter}: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('in-memory tasks', TASK_REPOSITORY_CONFORMANCE, () => new InMemoryTaskRepository());
runSuite('in-memory inbox', INBOX_CONFORMANCE, () => new InMemoryInbox());
runSuite('in-memory producer cursors', PRODUCER_CURSORS_CONFORMANCE, () => new InMemoryProducerCursors());
