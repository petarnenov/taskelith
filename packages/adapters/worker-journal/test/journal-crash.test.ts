import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { planJournalRecovery, type ObservationFact, type RecoveryAction } from '@taskelith/execution';
import { crashEnvironment, ScenarioProcess, id, uncoveredEnvironment, value } from '@taskelith/testing';
import { enrollWorkerRoot, openWorkerRoot } from '@taskelith/worker-journal';
import { ENROLLMENT, T0, assignment, rootOptions, temporaryDataRoot } from './fixtures.ts';

// Contract section 13: a crash before and after each of W1 to W6, followed
// by recovery, gives the result the recovery table of section 5 assigns.
const SCENARIO = fileURLToPath(new URL('./journal-scenario.ts', import.meta.url));
const ASSIGNMENT = id('AssignmentId', 'assignment-1');
const EXECUTION = id('ExecutionId', 'execution-1');

const CONTINUE: RecoveryAction = { kind: 'continue-launch', assignmentId: ASSIGNMENT };
const SEAL_AND_CONTINUE: RecoveryAction[] = [{ kind: 'seal-execution', executionId: EXECUTION }, CONTINUE];
const RECOVER_RECORD: RecoveryAction[] = [{ kind: 'recover-execution-record', executionId: EXECUTION }];

interface Expectation {
  readonly scenario: 'exit' | 'seal';
  readonly point: string;
  readonly acknowledged: boolean;
  readonly recovery: readonly RecoveryAction[];
  readonly facts: readonly ObservationFact['kind'][];
}

const EXPECTATIONS: readonly Expectation[] = [
  { scenario: 'exit', point: 'W1.before', acknowledged: false, recovery: [], facts: [] },
  { scenario: 'exit', point: 'W1.after', acknowledged: false, recovery: [CONTINUE], facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W2.before', acknowledged: true, recovery: [CONTINUE], facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W2.after', acknowledged: true, recovery: SEAL_AND_CONTINUE, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W3.before', acknowledged: true, recovery: SEAL_AND_CONTINUE, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W3.after', acknowledged: true, recovery: SEAL_AND_CONTINUE, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W4.before', acknowledged: true, recovery: SEAL_AND_CONTINUE, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W4.after', acknowledged: true, recovery: RECOVER_RECORD, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W5s.before', acknowledged: true, recovery: RECOVER_RECORD, facts: ['assignment-accepted'] },
  { scenario: 'exit', point: 'W5s.after', acknowledged: true, recovery: RECOVER_RECORD, facts: ['assignment-accepted', 'execution-started'] },
  { scenario: 'exit', point: 'W5e.before', acknowledged: true, recovery: RECOVER_RECORD, facts: ['assignment-accepted', 'execution-started'] },
  { scenario: 'exit', point: 'W5e.after', acknowledged: true, recovery: [], facts: ['assignment-accepted', 'execution-started', 'execution-exited'] },
  { scenario: 'seal', point: 'W6.before', acknowledged: true, recovery: SEAL_AND_CONTINUE, facts: ['assignment-accepted'] },
  { scenario: 'seal', point: 'W6.after', acknowledged: true, recovery: [CONTINUE], facts: ['assignment-accepted', 'execution-not-started'] },
];

const cleanups: (() => void)[] = [];
after(() => cleanups.forEach((cleanup) => cleanup()));

async function crashAt(scenario: string, point: string): Promise<{ dataRoot: string; stdout: string }> {
  const { dataRoot, remove } = temporaryDataRoot();
  cleanups.push(remove);
  value(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT)).close();
  const worker = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', SCENARIO, dataRoot, scenario], {
    env: { ...uncoveredEnvironment(), ...crashEnvironment(point) },
  });
  const exit = await worker.exited;
  assert.equal(exit.signal, 'SIGKILL', `the worker was not killed at ${point}: ${worker.stderr}`);
  return { dataRoot, stdout: worker.stdout };
}

for (const expected of EXPECTATIONS) {
  test(`a crash at ${expected.point} recovers as the recovery table assigns`, async () => {
    const { dataRoot, stdout } = await crashAt(expected.scenario, expected.point);

    const root = value(openWorkerRoot(rootOptions(dataRoot)));
    try {
      assert.equal(stdout.includes('acknowledged'), expected.acknowledged);
      assert.deepEqual(planJournalRecovery(value(root.journal.snapshot())), expected.recovery);
      const facts = value(root.journal.dueForPublication(T0));
      assert.deepEqual(facts.map((entry) => entry.fact.kind), expected.facts);
      assert.deepEqual(facts.map((entry) => entry.position.sequence), facts.map((_, index) => index + 1));
    } finally {
      root.close();
    }
  });
}

test('a command redelivered after a crash between W1 and its acknowledgement is a duplicate', async () => {
  const { dataRoot } = await crashAt('exit', 'W1.after');
  const root = value(openWorkerRoot(rootOptions(dataRoot)));
  try {
    assert.deepEqual(value(root.journal.recordCommand(assignment())), { kind: 'duplicate' });
    assert.equal(value(root.journal.snapshot()).intents.length, 1);
  } finally {
    root.close();
  }
});
