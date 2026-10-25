import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { EVIDENCE_RECORDS_CONFORMANCE, INBOX_CONFORMANCE, LAUNCH_RECORDS_CONFORMANCE, TASK_REPOSITORY_CONFORMANCE } from '@taskelith/execution';
import {
  CommittingAdmissionRepository,
  CommittingAssignmentRepository,
  CommittingCurrentRevisions,
  CommittingEvidenceRecords,
  CommittingGateRepository,
  CommittingInbox,
  CommittingLaunchRecords,
  CommittingOutbox,
  CommittingRunCatalog,
  CommittingTaskRepository,
  CommittingWorkflowRunRepository,
  PostgresDatabase,
  PostgresOutboxRelay,
} from '@taskelith/postgres';
import { ASSIGNMENT_REPOSITORY_CONFORMANCE } from '@taskelith/scheduling';
import {
  ADMISSION_REPOSITORY_CONFORMANCE,
  CURRENT_REVISIONS_CONFORMANCE,
  GATE_REPOSITORY_CONFORMANCE,
  OUTBOX_CONFORMANCE,
  RUN_CATALOG_CONFORMANCE,
  WORKFLOW_RUN_REPOSITORY_CONFORMANCE,
  type ConformanceCase,
} from '@taskelith/sdlc';
import { createMigratedDatabase, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

// The cases share one database, so each starts from empty tables.
function runSuite<Port>(port: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`PostgreSQL ${port}: ${conformance.name}`, { concurrency: false }, async () => {
      await truncateAll(url);
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('admissions', ADMISSION_REPOSITORY_CONFORMANCE, () => new CommittingAdmissionRepository(database));
runSuite('runs', WORKFLOW_RUN_REPOSITORY_CONFORMANCE, () => new CommittingWorkflowRunRepository(database));
runSuite('run catalog', RUN_CATALOG_CONFORMANCE, () => ({
  runs: new CommittingWorkflowRunRepository(database),
  admissions: new CommittingAdmissionRepository(database),
  catalog: new CommittingRunCatalog(database),
}));
runSuite('current revisions', CURRENT_REVISIONS_CONFORMANCE, () => ({
  runs: new CommittingWorkflowRunRepository(database), revisions: new CommittingCurrentRevisions(database),
}));
runSuite('gates', GATE_REPOSITORY_CONFORMANCE, () => new CommittingGateRepository(database));
runSuite('tasks', TASK_REPOSITORY_CONFORMANCE, () => new CommittingTaskRepository(database));
runSuite('launch records', LAUNCH_RECORDS_CONFORMANCE, () => ({
  tasks: new CommittingTaskRepository(database), launches: new CommittingLaunchRecords(database),
}));
runSuite('assignments', ASSIGNMENT_REPOSITORY_CONFORMANCE, () => new CommittingAssignmentRepository(database));
runSuite('evidence', EVIDENCE_RECORDS_CONFORMANCE, () => new CommittingEvidenceRecords(database));
runSuite('inbox', INBOX_CONFORMANCE, () => new CommittingInbox(database));
runSuite('outbox', OUTBOX_CONFORMANCE, () => {
  const relay = new PostgresOutboxRelay(database);
  return {
    outbox: new CommittingOutbox(database),
    async stored() {
      const pending = await relay.unpublished(100);
      assert.ok(pending.ok);
      return pending.value;
    },
  };
});
