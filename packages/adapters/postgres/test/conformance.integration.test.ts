import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
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
  nextGeneration,
  type ConformanceCase,
} from '@taskelith/sdlc';
import { value } from '@taskelith/testing';
import { assignment } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

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

test('PostgreSQL assignments: a backfilled offer command is read and kept through replace', { concurrency: false }, async () => {
  await truncateAll(url);
  const repository = new CommittingAssignmentRepository(database);
  const legacy = assignment('assignment-1');
  assert.deepEqual(await repository.add(legacy), { ok: true, value: undefined });
  // The migration wrote the column; the stored record lacks the command.
  await query(url, "UPDATE assignments SET offer_command_id = 'offer-1' WHERE id = $1", [legacy.id]);
  const offerCommandId = value(parseIdentifier('EventId', 'offer-1'));
  const backfilled = { ...legacy, offerCommandId };
  assert.deepEqual(await repository.get(legacy.id), { ok: true, value: backfilled });
  assert.deepEqual(await repository.byOfferCommand(offerCommandId), { ok: true, value: backfilled });
  assert.deepEqual(await repository.listByAttempt(legacy.attemptId), [backfilled]);
  const omitted = { ...legacy, generation: nextGeneration(legacy.generation) };
  assert.deepEqual(await repository.replace(omitted, legacy.generation), { ok: true, value: undefined });
  assert.deepEqual(await repository.get(legacy.id), { ok: true, value: { ...omitted, offerCommandId } });
  const carried = { ...omitted, offerCommandId, generation: nextGeneration(omitted.generation) };
  assert.deepEqual(await repository.replace(carried, omitted.generation), { ok: true, value: undefined });
  const changed = { ...carried, offerCommandId: value(parseIdentifier('EventId', 'offer-2')), generation: nextGeneration(carried.generation) };
  const refused = await repository.replace(changed, carried.generation);
  assert.equal(refused.ok ? 'replaced' : refused.error.code, 'conflict');
  assert.deepEqual(await repository.byOfferCommand(offerCommandId), { ok: true, value: carried });
});
