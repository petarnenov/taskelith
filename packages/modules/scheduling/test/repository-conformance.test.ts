import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSIGNMENT_REPOSITORY_CONFORMANCE, InMemoryAssignmentRepository } from '@taskelith/scheduling';

for (const conformance of ASSIGNMENT_REPOSITORY_CONFORMANCE) {
  test(`in-memory assignments: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryAssignmentRepository()), []);
  });
}
