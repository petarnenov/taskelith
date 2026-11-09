import assert from 'node:assert/strict';
import test from 'node:test';
import { ObservationService, type ControlPlaneStore, type ControlPlaneTransaction } from '@taskelith/control-plane';
import {
  InMemoryEvidenceRecords,
  InMemorySessionTimelineStore,
  InMemoryTaskRepository,
  type SessionTimelineTransaction,
  type SessionView,
  type WorkerId,
} from '@taskelith/execution';
import { InMemoryFleetRegistry, fleetToken, fleetWorker } from '@taskelith/fleet';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { InMemoryInstallationGuard, InMemoryTaskLineage, type WorkerPlacementRecord } from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryOutbox,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
} from '@taskelith/sdlc';
import { failed, id, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';
import { failingAt, sessionObservationMessage, timelineOver, timelineService } from './session-timeline-fixtures.ts';

const WORKER = 'worker-1' as WorkerId;
const JOURNAL = 'journal-1';
const AT = '2026-10-25T09:00:00.000Z' as Instant;
const SESSION = id('SessionId', 'session-1');
const TASK = id('TaskId', 'task-1');
const ATTEMPT = id('AttemptId', 'attempt-1');
const OWNERSHIP = 2;
const PERSON = { kind: 'principal' as const, principalId: id('PrincipalId', 'person-1') };
const RECORD: WorkerPlacementRecord = {
  workerId: WORKER, enrolled: true, revoked: false, draining: false, reachable: false, slots: 2, cpuMillicores: 4000,
  memoryMebibytes: 8192, controls: [], protocolVersion: 1, admitted: true,
};
const EPOCH = { recoveryEpoch: 1 };
const EVIDENCE = 'execution.observation.evidence';
// Text that no log may repeat, shaped like no credential.
const OUTPUT_TEXT = 'the build printed forty lines';
const REQUEST_TEXT = 'may the agent run the linter';

// A timeline that fails the test when anything reads it.
const UNREADABLE = new Proxy({}, {
  get: () => assert.fail('the timeline was read before the recovery epoch was checked'),
}) as SessionTimelineTransaction;

interface FixtureOptions {
  readonly installation?: InMemoryInstallationGuard;
  // The ownership generations at which the worker held the attempt.
  readonly held?: readonly number[];
  readonly timeline?: SessionTimelineTransaction;
  // What the effects get in place of each transaction's own timelines.
  readonly timelineStores?: (stores: SessionTimelineTransaction) => SessionTimelineTransaction;
  readonly timelineOver?: typeof timelineOver;
}

// In-memory stores; only the timeline rolls back, so each test takes paths
// whose other effects the domain accepts.
async function fixture(options: FixtureOptions = {}) {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const outbox = new InMemoryOutbox();
  const capacity = inMemoryCapacity(tasks, lineage, [RECORD], outbox);
  const fleet = new InMemoryFleetRegistry(() => AT);
  value(await fleet.addToken(fleetToken('token-1')));
  value(await fleet.enroll(fleetToken('token-1').hash, fleetWorker(WORKER, JOURNAL)));
  const held = options.held ?? [OWNERSHIP];
  const members: Omit<ControlPlaneTransaction, 'sessionTimeline'> = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks, lineage, ...capacity, installation: options.installation ?? capacity.installation,
    evidence: new InMemoryEvidenceRecords(),
    producers: { heldGenerations: async (workerId, attemptId) => ok(workerId === WORKER && attemptId === ATTEMPT ? held as never : []) },
    fleet, revisions: new InMemoryCurrentRevisions(), launches: undefined as never, now: async () => AT,
  };
  const timelines = new InMemorySessionTimelineStore();
  const timelineStores = options.timelineStores ?? ((stores) => stores);
  const transaction: ControlPlaneStore['transaction'] = (work) => (
    timelines.transaction((sessionTimeline) => work({ ...members, sessionTimeline: options.timeline ?? timelineStores(sessionTimeline) }))
  );
  const logs = new InMemoryLogSink();
  const service = new ObservationService({ transaction, readCommitted: transaction }, {
    timelineOver: options.timelineOver ?? timelineOver, newConfirmationId: () => 'confirmation-again', newRequestId: () => 'request-1',
    logger: new Logger(logs, { now: () => AT }),
  });
  const timeline = timelineService(timelines);
  let sequence = 0;
  const observe = (type: string, payload: Record<string, unknown>, source: { attemptId?: string; ownershipGeneration?: number; derivedAgain?: boolean } = {}) => (
    service.apply(sessionObservationMessage(type, payload, {
      workerId: WORKER, journalId: JOURNAL, sequence: ++sequence, attemptId: ATTEMPT, ownershipGeneration: OWNERSHIP, ...source,
    }))
  );
  const session = async (): Promise<SessionView> => value(await timeline.readSession(SESSION));
  const evidence = () => logs.records.filter((record) => record.event === EVIDENCE).map((record) => record.fields);
  const confirmedThrough = async () => (await members.cursors.get(WORKER, JOURNAL as never)).confirmedThrough;
  return { timeline, observe, session, evidence, logs, confirmedThrough };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

// SESSION of TASK with ATTEMPT bound at OWNERSHIP, no generation yet.
async function boundSession({ timeline }: Fixture): Promise<void> {
  value(await timeline.openSession({ id: SESSION, taskId: TASK, harness: id('HarnessPluginId', 'harness-a') }));
  value(await timeline.bindAttempt(SESSION, { attemptId: ATTEMPT, taskId: TASK, ownershipGeneration: OWNERSHIP as never }));
}

async function submitted(at: Fixture, name: string): Promise<string> {
  return value(await at.timeline.submitTurn(SESSION, { key: id('IdempotencyKey', name), author: PERSON, text: `please do ${name}` })).turn.id;
}

const started = (generation = 1) => ({ sessionId: SESSION, generation, nativeSessionId: 'native-1', ...EPOCH });
const ended = (generation = 1) => ({ sessionId: SESSION, generation, cause: 'session-ended', ...EPOCH });
const turn = (turnId: string, generation = 1) => ({ sessionId: SESSION, turnId, generation, ...EPOCH });
const REQUEST = { generation: 1, nativeRequestId: 'request-1' };
const request = (turnId: string) => ({ sessionId: SESSION, request: REQUEST, kind: 'permission-request', turnId, text: REQUEST_TEXT, ...EPOCH });
const output = (turnId: string, chunk = 1) => ({ ...turn(turnId), chunk, text: OUTPUT_TEXT });

// Generation 1 runs, started by its observation, with the named queued turns.
async function runningSession(at: Fixture, ...names: string[]): Promise<string[]> {
  await boundSession(at);
  assert.equal(value(await at.observe('session.generation.started', started())), 'applied');
  const turnIds: string[] = [];
  for (const name of names) turnIds.push(await submitted(at, name));
  return turnIds;
}

// The inbox keeps an identity it has seen, so a repeat that reaches the
// timeline is one the host derived under another identity.
const AGAIN = { derivedAgain: true };
const stateOf = (view: SessionView, turnId: string) => view.turns.find((candidate) => candidate.id === turnId)?.state;

test('each session observation is applied through its timeline operation', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  assert.deepEqual((await at.session()).generations, [{ generation: 1, attemptId: ATTEMPT, ended: false }]);

  assert.equal(value(await at.observe('session.turn.delivered', turn(first!))), 'applied');
  assert.equal(stateOf(await at.session(), first!), 'delivered');

  assert.equal(value(await at.observe('session.request.recorded', request(first!))), 'applied');
  assert.deepEqual((await at.session()).requests.map((recorded) => [recorded.key, recorded.kind, recorded.state, recorded.text]), [
    [REQUEST, 'permission-request', 'open', REQUEST_TEXT],
  ]);

  assert.equal(value(await at.observe('session.output.appended', output(first!))), 'applied');
  assert.equal((await at.session()).outputWindow.lastPosition, 1);

  value(await at.timeline.consumeResponse(SESSION, {
    key: id('IdempotencyKey', 'answer-1'),
    response: { request: REQUEST as never, answer: { kind: 'permission', decision: 'allow' }, responder: PERSON, attemptId: ATTEMPT, ownershipGeneration: OWNERSHIP as never },
  }));
  assert.equal(value(await at.observe('session.response.delivery-reported', { sessionId: SESSION, request: REQUEST, report: 'delivered', ...EPOCH })), 'applied');
  const [answered] = (await at.session()).requests;
  assert.equal(answered?.state === 'answered' && answered.response.delivery, 'delivered');

  assert.equal(value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'failed', failure: 'transport' })), 'applied');
  assert.deepEqual((await at.session()).turns.map((ended) => [ended.state, ended.state === 'ended' && ended.outcome, ended.state === 'ended' && ended.failure]), [
    ['ended', 'failed', 'transport'],
  ]);

  assert.equal(value(await at.observe('session.limit.signaled', { sessionId: SESSION, generation: 1, resetsAt: '2026-10-25T12:00:00.000Z', ...EPOCH })), 'applied');
  assert.deepEqual((await at.session()).limit, { resetsAt: '2026-10-25T12:00:00.000Z' });

  assert.equal(value(await at.observe('session.generation.ended', ended())), 'applied');
  assert.equal((await at.session()).generations[0]?.ended, true);
  assert.deepEqual(at.evidence(), [], 'no applied observation is logged as evidence');
  assert.equal(await at.confirmedThrough(), 8);
});

test('a limit signal without a reset time stops the session, and a repeated end of a generation changes nothing', async () => {
  const at = await fixture();
  await runningSession(at);
  assert.equal(value(await at.observe('session.limit.signaled', { sessionId: SESSION, generation: 1, ...EPOCH })), 'applied');
  assert.deepEqual((await at.session()).limit, {});
  assert.equal(value(await at.observe('session.generation.ended', ended())), 'applied');
  assert.equal(value(await at.observe('session.generation.ended', { ...ended(), cause: 'lost' }, AGAIN)), 'applied');
  assert.deepEqual(at.evidence(), []);
});

test('a turn the plugin refused as invalid becomes refused and the next turn is deliverable in the same generation', async () => {
  const at = await fixture();
  const [first, second] = await runningSession(at, 'turn-1', 'turn-2');

  assert.equal(value(await at.observe('session.turn.not-delivered', { ...turn(first!), reason: 'turn-invalid' })), 'applied');

  assert.equal(stateOf(await at.session(), first!), 'refused');
  assert.equal(value(await at.timeline.nextDeliverableTurn(SESSION))?.id, second, 'a persistent invalid does not block the later turn');
  assert.equal(value(await at.observe('session.turn.delivered', turn(second!))), 'applied');
  assert.equal(stateOf(await at.session(), second!), 'delivered');
  assert.equal((await at.session()).generations[0]?.ended, false, 'the generation runs on');
  assert.deepEqual(at.evidence(), []);
});

for (const reason of ['port-refused', 'generation-not-running']) {
  test(`a turn not delivered for ${reason} stays queued for the next generation`, async () => {
    const at = await fixture();
    const [first] = await runningSession(at, 'turn-1');

    assert.equal(value(await at.observe('session.turn.not-delivered', { ...turn(first!), reason })), 'applied');

    assert.equal(stateOf(await at.session(), first!), 'queued');
    assert.deepEqual(at.evidence(), []);
    assert.equal(await at.confirmedThrough(), 2);
  });
}

test('a turn of unknown acceptance holds the queue until the next generation', async () => {
  const at = await fixture();
  const [first, second] = await runningSession(at, 'turn-1', 'turn-2');

  assert.equal(value(await at.observe('session.turn.acceptance-unknown', { ...turn(first!), reason: 'timeout' })), 'applied');

  assert.equal(stateOf(await at.session(), first!), 'outcome-unknown');
  assert.equal(value(await at.timeline.nextDeliverableTurn(SESSION)), undefined, 'the turn may still run in generation 1');
  assert.equal(value(await at.observe('session.generation.ended', ended())), 'applied');
  assert.equal(value(await at.timeline.nextDeliverableTurn(SESSION)), undefined, 'no generation runs');
  assert.equal(value(await at.observe('session.generation.started', started(2))), 'applied');
  assert.equal(value(await at.timeline.nextDeliverableTurn(SESSION))?.id, second);
  assert.equal(stateOf(await at.session(), first!), 'outcome-unknown', 'final and never resent');
  assert.deepEqual(at.evidence(), []);
});

test('the output, a request, and the outcome of an outcome-unknown turn are confirmed as evidence and the next observation is applied', async () => {
  const at = await fixture();
  const [first, second] = await runningSession(at, 'turn-1', 'turn-2');
  value(await at.observe('session.turn.acceptance-unknown', { ...turn(first!), reason: 'crash' }));
  const before = await at.session();

  assert.equal(value(await at.observe('session.output.appended', output(first!))), 'applied');
  assert.equal(value(await at.observe('session.request.recorded', request(first!))), 'applied');
  assert.equal(value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'completed' })), 'applied');

  assert.deepEqual(await at.session(), before, 'the timeline is unchanged');
  assert.deepEqual(at.evidence(), [
    { observationType: 'session.output.appended', sessionId: SESSION, reason: 'timeline-refused', code: 'precondition-failed' },
    { observationType: 'session.request.recorded', sessionId: SESSION, reason: 'timeline-refused', code: 'precondition-failed' },
    { observationType: 'session.turn.ended', sessionId: SESSION, reason: 'timeline-refused', code: 'conflict' },
  ]);
  assert.equal(await at.confirmedThrough(), 5, 'no refusal holds the producer sequence');
  value(await at.observe('session.generation.ended', ended()));
  value(await at.observe('session.generation.started', started(2)));
  assert.equal(value(await at.observe('session.turn.delivered', turn(second!, 2))), 'applied');
  assert.equal(stateOf(await at.session(), second!), 'delivered');
});

test('a delivery after its generation ended is confirmed as evidence without effect', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.generation.ended', ended()));

  assert.equal(value(await at.observe('session.turn.delivered', turn(first!))), 'applied');

  assert.equal(stateOf(await at.session(), first!), 'queued');
  assert.deepEqual(at.evidence(), [{ observationType: 'session.turn.delivered', sessionId: SESSION, reason: 'timeline-refused', code: 'precondition-failed' }]);
});

test('a refusal the timeline answers as invalid is confirmed as evidence, not delivered again', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.delivered', turn(first!)));

  const outcome = await at.observe('session.turn.ended', { ...turn(first!), outcome: 'completed', failure: 'transport' });

  assert.equal(value(outcome), 'applied');
  assert.equal(stateOf(await at.session(), first!), 'delivered');
  assert.deepEqual(at.evidence(), [{ observationType: 'session.turn.ended', sessionId: SESSION, reason: 'timeline-refused', code: 'invalid' }]);
  assert.equal(await at.confirmedThrough(), 3);
});

test('a fact the session already holds, reported again under another identity, is a repeat and no evidence', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.delivered', turn(first!)));
  value(await at.observe('session.request.recorded', request(first!)));
  value(await at.timeline.consumeResponse(SESSION, {
    key: id('IdempotencyKey', 'answer-1'),
    response: { request: REQUEST as never, answer: { kind: 'permission', decision: 'deny' }, responder: PERSON, attemptId: ATTEMPT, ownershipGeneration: OWNERSHIP as never },
  }));
  const report = { sessionId: SESSION, request: REQUEST, report: 'refused', ...EPOCH };
  value(await at.observe('session.response.delivery-reported', report));
  value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'completed' }));
  const before = await at.session();

  assert.equal(value(await at.observe('session.generation.started', started(), AGAIN)), 'applied');
  assert.equal(value(await at.observe('session.turn.delivered', turn(first!), AGAIN)), 'applied');
  assert.equal(value(await at.observe('session.request.recorded', request(first!), AGAIN)), 'applied');
  assert.equal(value(await at.observe('session.response.delivery-reported', report, AGAIN)), 'applied');
  assert.equal(value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'completed' }, AGAIN)), 'applied');

  assert.deepEqual(await at.session(), before);
  assert.deepEqual(at.evidence(), []);
  assert.equal(await at.confirmedThrough(), 10);
});

test('a report that contradicts the fact the session holds is evidence, not a repeat', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.delivered', turn(first!)));
  value(await at.observe('session.request.recorded', request(first!)));
  value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'completed' }));

  value(await at.observe('session.generation.started', { ...started(), nativeSessionId: 'native-2' }, AGAIN));
  value(await at.observe('session.turn.ended', { ...turn(first!), outcome: 'interrupted' }, AGAIN));
  value(await at.observe('session.request.recorded', { ...request(first!), kind: 'input-request' }, AGAIN));
  value(await at.observe('session.response.delivery-reported', { sessionId: SESSION, request: REQUEST, report: 'delivered', ...EPOCH }));

  assert.deepEqual(at.evidence().map((fields) => [fields.observationType, fields.code]), [
    ['session.generation.started', 'precondition-failed'], ['session.turn.ended', 'conflict'], ['session.request.recorded', 'conflict'],
    ['session.response.delivery-reported', 'precondition-failed'],
  ]);
});

test('an observation of an unknown session is confirmed as evidence without effect', async () => {
  const at = await fixture();

  assert.equal(value(await at.observe('session.generation.started', started())), 'applied');

  assert.deepEqual(at.evidence(), [{ observationType: 'session.generation.started', sessionId: SESSION, reason: 'session-unknown' }]);
  assert.equal(failed(await at.timeline.readSession(SESSION)).code, 'not-found');
  assert.equal(await at.confirmedThrough(), 1);
});

for (const [why, source, options] of [
  ['another attempt', { attemptId: 'attempt-2' }, {}],
  ['another ownership generation', { ownershipGeneration: 3 }, { held: [2, 3] }],
] as const) {
  test(`an observation that names ${why} than the session's active bound attempt changes nothing`, async () => {
    const at = await fixture(options);
    await boundSession(at);

    assert.equal(value(await at.observe('session.generation.started', started(), source)), 'applied');

    assert.deepEqual((await at.session()).generations, []);
    assert.deepEqual(at.evidence(), [{ observationType: 'session.generation.started', sessionId: SESSION, reason: 'attempt-not-current' }]);
    assert.equal(await at.confirmedThrough(), 1);
  });
}

test('an observation of an attempt whose bound attempt ended changes nothing', async () => {
  const at = await fixture();
  await boundSession(at);
  value(await at.timeline.endBoundAttempt(SESSION, ATTEMPT));

  assert.equal(value(await at.observe('session.generation.started', started())), 'applied');

  assert.deepEqual(at.evidence(), [{ observationType: 'session.generation.started', sessionId: SESSION, reason: 'attempt-not-current' }]);
});

test('a worker that never held the attempt at its ownership generation cannot write the session', async () => {
  const at = await fixture({ held: [1] });
  await boundSession(at);

  assert.equal(value(await at.observe('session.generation.started', started())), 'applied');
  assert.equal(value(await at.observe('session.limit.signaled', { sessionId: SESSION, generation: 1, ...EPOCH })), 'applied');

  const view = await at.session();
  assert.deepEqual([view.generations, view.limit], [[], undefined]);
  assert.deepEqual(at.evidence().map((fields) => fields.reason), ['attempt-not-held', 'attempt-not-held']);
});

const EVERY_TYPE: Readonly<Record<string, Record<string, unknown>>> = {
  'session.generation.started': started(),
  'session.generation.ended': ended(),
  'session.turn.delivered': turn('turn-x'),
  'session.turn.not-delivered': { ...turn('turn-x'), reason: 'turn-invalid' },
  'session.turn.acceptance-unknown': { ...turn('turn-y'), reason: 'conflict' },
  'session.turn.ended': { ...turn('turn-x'), outcome: 'completed' },
  'session.request.recorded': request('turn-x'),
  'session.response.delivery-reported': { sessionId: SESSION, request: REQUEST, report: 'delivered', ...EPOCH },
  'session.output.appended': output('turn-x'),
  'session.limit.signaled': { sessionId: SESSION, generation: 1, ...EPOCH },
};

for (const [gate, installation, recoveryEpoch] of [
  ['an older epoch', new InMemoryInstallationGuard(false, 2), 1],
  ['a newer epoch', new InMemoryInstallationGuard(false, 2), 3],
  ['restore quarantine', new InMemoryInstallationGuard(true, 2), 2],
] as const) {
  test(`every session observation of ${gate} is kept as evidence before the timeline is read`, async () => {
    const at = await fixture({ installation, timeline: UNREADABLE });

    for (const [type, payload] of Object.entries(EVERY_TYPE)) {
      assert.equal(value(await at.observe(type, { ...payload, recoveryEpoch })), 'applied', type);
    }

    assert.deepEqual(at.evidence(), Object.keys(EVERY_TYPE).map((observationType) => ({
      observationType, recoveryEpoch, currentEpoch: 2, quarantined: gate === 'restore quarantine',
    })));
    assert.equal(await at.confirmedThrough(), Object.keys(EVERY_TYPE).length);
  });
}

test('every session observation at the current epoch reaches the timeline', async () => {
  const at = await fixture();

  for (const [type, payload] of Object.entries(EVERY_TYPE)) assert.equal(value(await at.observe(type, payload)), 'applied', type);

  assert.deepEqual(at.evidence().map((fields) => [fields.observationType, fields.reason]), Object.keys(EVERY_TYPE).map((type) => [type, 'session-unknown']));
});

test('an evidence log names identifiers and reasons only, never the text of the payload', async () => {
  const at = await fixture();
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.acceptance-unknown', { ...turn(first!), reason: 'timeout' }));

  value(await at.observe('session.output.appended', output(first!)));
  value(await at.observe('session.request.recorded', request(first!)));
  value(await at.observe('session.output.appended', { ...output('turn-unknown'), sessionId: 'session-unknown' }));

  const logged = JSON.stringify(at.logs.records);
  assert.equal(at.logs.records.length, 3);
  for (const text of [OUTPUT_TEXT, REQUEST_TEXT, 'please do turn-1']) assert.equal(logged.includes(text), false, text);
  for (const record of at.logs.records) {
    assert.deepEqual(Object.keys(record.correlation).sort(), ['correlationId', 'observationId', 'workerId']);
    assert.deepEqual(Object.keys(record.fields).filter((field) => !['observationType', 'sessionId', 'reason', 'code'].includes(field)), []);
  }
});

test('a store failure while the session is read is returned, so the observation is delivered again', async () => {
  const down = async (): Promise<Result<never>> => err(failure('unavailable', 'the store is down'));
  const at = await fixture({ timeline: { sessions: { get: down } } as never });

  assert.equal(failed(await at.observe('session.generation.started', started())).code, 'unavailable');

  assert.deepEqual(at.evidence(), []);
});

test('a failure of the timeline that is no refusal is returned, not kept as evidence', async () => {
  const broken = { startGeneration: async () => err(failure('internal', 'the session holds the output tail of another turn')) };
  const at = await fixture({ timelineOver: () => broken as never });
  await boundSession(at);

  assert.equal(failed(await at.observe('session.generation.started', started())).code, 'internal');

  assert.deepEqual(at.evidence(), []);
  assert.deepEqual((await at.session()).generations, []);
});

test('a store conflict after the timeline wrote is returned as a failure, and nothing of the request is kept as evidence or stored', async () => {
  const at = await fixture({ timelineStores: failingAt('items', 'add', 'conflict') });
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.delivered', turn(first!)));

  const recorded = failed(await at.observe('session.request.recorded', request(first!)));

  assert.deepEqual([recorded.code, recorded.details], ['internal', { session: SESSION, code: 'conflict' }]);
  assert.deepEqual(at.evidence(), []);
  assert.deepEqual((await at.session()).requests, [], 'the timeline rolled back');
});

test('a refusal\'s code from the first write of the timeline is a failure, not a refusal', async () => {
  const at = await fixture({ timelineStores: failingAt('sessions', 'replace', 'precondition-failed') });
  await boundSession(at);

  assert.equal(failed(await at.observe('session.generation.started', started())).code, 'internal');

  assert.deepEqual(at.evidence(), []);
  assert.deepEqual((await at.session()).generations, []);
});

test('a refusal\'s code from a read of the timeline is a failure, not a refusal', async () => {
  const at = await fixture({ timelineStores: failingAt('idempotency', 'find', 'conflict') });
  const [first] = await runningSession(at, 'turn-1');
  value(await at.observe('session.turn.delivered', turn(first!)));

  assert.equal(failed(await at.observe('session.request.recorded', request(first!))).code, 'internal');

  assert.deepEqual(at.evidence(), []);
});

test('a store failure of another code after the timeline wrote is returned as it is', async () => {
  const at = await fixture({ timelineStores: failingAt('sessions', 'replace', 'unavailable') });
  await boundSession(at);

  assert.equal(failed(await at.observe('session.generation.started', started())).code, 'unavailable');

  assert.deepEqual(at.evidence(), []);
});

test('a refusal after the timeline wrote is a failure, though no store call failed', async () => {
  const refusingAfterWrite = (stores: SessionTimelineTransaction) => ({
    startGeneration: async (sessionId: typeof SESSION) => {
      value(await stores.tails.clear(sessionId));
      return err(failure('precondition-failed', 'the domain refused after a write'));
    },
  });
  const at = await fixture({ timelineOver: refusingAfterWrite as never });
  await boundSession(at);

  assert.equal(failed(await at.observe('session.generation.started', started())).code, 'internal');

  assert.deepEqual(at.evidence(), []);
});

test('a member of the transaction that is no store reaches the timeline as it is', async () => {
  const changedFlag = (stores: SessionTimelineTransaction) => new Proxy(stores, {
    get: (target, name) => (name === 'changed' ? true : Reflect.get(target, name)),
  });
  const members: unknown[] = [];
  const readingMembers = (stores: SessionTimelineTransaction) => {
    members.push(Reflect.get(stores, 'changed'), Reflect.get(stores, 'then'));
    return timelineOver(stores);
  };
  const at = await fixture({ timelineStores: changedFlag, timelineOver: readingMembers });
  await boundSession(at);

  assert.equal(value(await at.observe('session.generation.started', started())), 'applied');

  assert.deepEqual(members, [true, undefined]);
});
