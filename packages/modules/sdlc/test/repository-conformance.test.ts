import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMISSION_REPOSITORY_CONFORMANCE,
  CURRENT_REVISIONS_CONFORMANCE,
  GATE_REPOSITORY_CONFORMANCE,
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryOutbox,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  OUTBOX_CONFORMANCE,
  RUN_CATALOG_CONFORMANCE,
  WORKFLOW_RUN_REPOSITORY_CONFORMANCE,
  type ConformanceCase,
} from '@taskelith/sdlc';

function runSuite<Port>(adapter: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`${adapter}: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('in-memory admissions', ADMISSION_REPOSITORY_CONFORMANCE, () => new InMemoryAdmissionRepository());
runSuite('in-memory runs', WORKFLOW_RUN_REPOSITORY_CONFORMANCE, () => new InMemoryWorkflowRunRepository());
runSuite('in-memory run catalog', RUN_CATALOG_CONFORMANCE, () => ({
  runs: new InMemoryWorkflowRunRepository(), admissions: new InMemoryAdmissionRepository(), catalog: new InMemoryRunCatalog(),
}));
runSuite('in-memory current revisions', CURRENT_REVISIONS_CONFORMANCE, () => ({
  runs: new InMemoryWorkflowRunRepository(), revisions: new InMemoryCurrentRevisions(),
}));
runSuite('in-memory gates', GATE_REPOSITORY_CONFORMANCE, () => new InMemoryGateRepository());
runSuite('in-memory outbox', OUTBOX_CONFORMANCE, () => {
  const outbox = new InMemoryOutbox();
  return { outbox, stored: async () => outbox.messages };
});
