import assert from 'node:assert/strict';
import test from 'node:test';
import { BoardViews, CardProjector, mergeGate, type CardProjections, type CardViewParts } from '@taskelith/control-plane';
import type { BoardCard, UiEventRecord } from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import { value } from '@taskelith/testing';
import { AS_OF, BINDING, BoardWorld, EARLY, LATE, execution, gate, item, run, task, worker } from './board-fixtures.ts';

const IMPLEMENTING = { proposal: 'completed', specs: 'completed', apply: 'in-progress' } as const;

function views(world: BoardWorld, parts: Partial<CardViewParts> = {}): BoardViews {
  return new BoardViews({ ...world.parts(), ...parts, store: world.store() });
}

async function onlyCard(world: BoardWorld): Promise<BoardCard> {
  const board = await views(world).forCaller(true).board('alpha' as never);
  assert.ok(board.ok, board.ok ? '' : board.error.message);
  assert.equal(board.value.cards.length, 1);
  return board.value.cards[0]!;
}

// A card in `apply` with one task whose attempt runs on `w-1`.
async function runningCard(attempt: object = { id: 'att-1', executions: [execution('ex-1', 'w-1')] }): Promise<BoardWorld> {
  const world = new BoardWorld();
  world.workers.push(worker('w-1'));
  await world.card('run-1', 'alpha', EARLY, run('run-1', IMPLEMENTING));
  world.addTask('run-1', task('task-1', [attempt]), 'apply');
  return world;
}

test('a board is one snapshot stamped with the head read first, the time, and the workers online', async () => {
  const world = new BoardWorld();
  world.workers.push(worker('w-1'), worker('w-2', { reachable: false }), worker('w-3', { revoked: true }));
  const board = await views(world).forCaller(false).board('alpha' as never);
  assert.deepEqual(board, { ok: true, value: { asOf: AS_OF, position: '7', projectId: 'alpha', cards: [], workersOnline: 1, callerMayAct: false } });
  assert.deepEqual(world.calls.slice(0, 2), ['head', 'now']);
});

test('a running card shows its column, current stage, framework, gate, working session, and merge gate', async () => {
  const world = await runningCard();
  world.gates.set('run-1', [gate('g-1', 'apply', 'pending'), gate('g-2', 'apply', 'failed')]);
  assert.deepEqual(await onlyCard(world), {
    runId: 'run-1', title: 'Card run-1', workType: 'feature', framework: { pluginId: BINDING.pluginId, pluginVersion: BINDING.pluginVersion },
    column: 'implement', stage: { stageId: 'apply', origin: 'native', state: 'in-progress' }, gate: 'failed',
    session: { state: 'working' }, integration: 'not-ready', needsYou: 0,
  });
});

test('the session shows an unreachable worker with its last contact, and an unknown execution first', async () => {
  const world = await runningCard();
  world.workers[0] = worker('w-1', { reachable: false, lastContactAt: LATE });
  assert.deepEqual((await onlyCard(world)).session, { state: 'worker-unreachable', lastContactAt: LATE });
  const uncertain = await runningCard({ id: 'att-1', executions: [execution('ex-1', 'w-1', { evidence: [{ kind: 'uncertain', observedAt: LATE }] })] });
  assert.deepEqual((await onlyCard(uncertain)).session, { state: 'process-uncertain' });
});

test('a stopped session of an earlier attempt leaves a retry awaiting placement stopped, not working', async () => {
  const failed = { id: 'att-1', executions: [], outcome: { kind: 'exited', status: { kind: 'code', code: 1 }, startProven: true, cancelled: false, ownershipGeneration: 1, endedAt: EARLY, executionId: 'ex-1' } };
  const world = await runningCard();
  world.tasks.set('task-1', task('task-1', [failed, { id: 'att-2', retryOf: 'att-1', executions: [] }]));
  world.sessions.set('task-1', [{ id: 'session-task-1', attempts: [{ id: 'att-1', ownershipGeneration: 1, ended: true }], generations: [{ generation: 1, attemptId: 'att-1', ended: true }] }]);
  assert.deepEqual((await onlyCard(world)).session, { state: 'stopped' });
  world.sessions.set('task-1', [{ id: 'session-task-1', attempts: [{ id: 'att-1', ownershipGeneration: 1, ended: true }], generations: [{ generation: 1, attemptId: 'att-1', ended: false }] }]);
  assert.deepEqual((await onlyCard(world)).session, { state: 'stopped' }, 'a generation of an ended attempt is no session of the retry');
  world.sessions.set('task-1', [{ id: 'session-task-1', attempts: [{ id: 'att-2', ownershipGeneration: 1, ended: false }], generations: [] }]);
  assert.deepEqual((await onlyCard(world)).session, { state: 'working' });
  world.sessions.set('task-1', [{ id: 'session-task-1', attempts: [{ id: 'att-2', ownershipGeneration: 1, ended: true }], generations: [{ generation: 2, attemptId: 'att-2', ended: false }] }]);
  assert.deepEqual((await onlyCard(world)).session, { state: 'working' }, 'stopping until the worker confirms the end');
});

test('an open item of the card counts in needsYou and makes its task wait for a person', async () => {
  const world = await runningCard();
  world.items = [item('i-1', 'run-1', { taskId: 'task-1' }), item('i-2', 'run-other')];
  const card = await onlyCard(world);
  assert.equal(card.needsYou, 1);
  assert.equal(card.waitingFor, 'person');
  assert.deepEqual(card.session, { state: 'waiting-for-person' });
});

test('a task waiting for placement shows the fleet obstacle first, else the most recent observation', async () => {
  const world = new BoardWorld();
  await world.card('run-1', 'alpha', EARLY, run('run-1', IMPLEMENTING));
  world.addTask('run-1', task('task-1', [{ id: 'att-2', retryOf: 'att-1', executions: [] }, { id: 'att-1', executions: [], outcome: { kind: 'not-started', cancelled: false, ownershipGeneration: 1, endedAt: EARLY } }].reverse()), 'apply');
  const fleet = await onlyCard(world);
  assert.deepEqual(fleet.obstacle, { source: 'fleet', disposition: 'waiting', reason: 'no-candidate', taskId: 'task-1', attemptId: 'att-2', observedAt: AS_OF });
  assert.equal(fleet.waitingFor, 'capacity');
  world.workers.push(worker('w-1', { draining: true }));
  assert.equal((await onlyCard(world)).obstacle?.reason, 'worker-not-eligible');
  world.workers[0] = worker('w-1');
  world.occupied.set('w-1', 1);
  assert.equal((await onlyCard(world)).obstacle?.reason, 'worker-capacity-exhausted');
  world.quarantined = true;
  assert.equal((await onlyCard(world)).obstacle?.reason, 'quarantined');
  world.quarantined = false;
  world.occupied.clear();
  assert.deepEqual((await onlyCard(world)).obstacle, { source: 'automatic-retry', disposition: 'waiting', reason: 'retry-backoff', retryNumber: 1, taskId: 'task-1', attemptId: 'att-2', observedAt: EARLY });
  world.outcomes.set('task-1', { taskId: 'task-1', attemptId: 'att-2', source: 'scheduler', disposition: 'waiting', reason: 'project-quota-exhausted', recordedAt: EARLY } as never);
  assert.equal((await onlyCard(world)).obstacle?.source, 'scheduler', 'the scheduler wins a tie');
  world.assignments.set('att-2', [{ end: { reason: 'refused', refusal: 'worker-slots-exhausted', endedAt: LATE } } as never]);
  assert.deepEqual((await onlyCard(world)).obstacle, { source: 'worker', disposition: 'waiting', reason: 'worker-slots-exhausted', taskId: 'task-1', attemptId: 'att-2', observedAt: LATE });
  world.held.add('att-2');
  assert.equal((await onlyCard(world)).obstacle, undefined, 'a held reservation is placed');
});

test('a card that waits for a person shows no waiting obstacle, but still a rejected one', async () => {
  const world = await runningCard();
  world.items = [item('i-1', 'run-1', { taskId: 'task-1' })];
  world.addTask('run-1', task('task-2', [{ id: 'att-2', executions: [] }]), 'apply', { session: false });
  world.occupied.set('w-1', 1);
  const person = await onlyCard(world);
  assert.deepEqual([person.waitingFor, person.obstacle], ['person', undefined]);
  const detail = await views(world).forCaller(true).taskDetail('alpha' as never, 'run-1' as never);
  assert.equal(detail.ok && detail.value.tasks[1]!.obstacle?.reason, 'worker-capacity-exhausted', 'the task keeps its own obstacle');
  const ended = { id: 'att-3', executions: [], outcome: { kind: 'not-started', cancelled: false, ownershipGeneration: 1, endedAt: LATE } };
  world.addTask('run-1', task('task-3', [ended]), 'apply', { session: false });
  world.outcomes.set('task-3', { taskId: 'task-3', attemptId: 'att-3', source: 'scheduler', disposition: 'rejected', reason: 'resource-ceiling-exceeded', recordedAt: LATE } as never);
  const rejected = await onlyCard(world);
  assert.deepEqual([rejected.waitingFor, rejected.obstacle?.disposition], ['person', 'rejected']);
});

// A projector over the world whose touches always name `run-1`, with the
// times of its batches; it collects the records it appends.
function projectorOver(world: BoardWorld, times: string[]): { projector: CardProjector; appended: UiEventRecord[] } {
  const appended: UiEventRecord[] = [];
  let last: string | undefined;
  const projections: CardProjections = {
    take: async () => ok({ touches: 1, runIds: ['run-1' as never], workersChanged: false }),
    lastCard: async () => ok(last),
    recordCard: async (_runId, projection) => ((last = projection), ok(undefined)),
    lastWorkersOnline: async () => ok(undefined),
    recordWorkersOnline: async () => ok(undefined),
    projectIds: async () => ok([]),
  };
  const projector = new CardProjector({
    transaction: (work) => work({
      ...world.reads(), now: async () => times.shift()! as never, projections,
      outbox: { append: async (entry) => (appended.push(entry.record), ok(undefined)) },
    }),
  }, world.parts());
  return { projector, appended };
}

test('a fleet obstacle observed again later appends no second card-changed', async () => {
  const world = new BoardWorld();
  await world.card('run-1', 'alpha', EARLY, run('run-1', IMPLEMENTING));
  world.addTask('run-1', task('task-1', [{ id: 'att-1', executions: [] }]), 'apply');
  const { projector, appended } = projectorOver(world, [AS_OF, '2026-11-03T11:00:00.000Z']);
  assert.deepEqual([await projector.project(), await projector.project()], [ok(1), ok(1)]);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.type === 'card-changed' && appended[0].card.obstacle?.source, 'fleet');
});

test('a change of the task detail alone appends a card-changed with the unchanged card', async () => {
  const world = await runningCard();
  world.gates.set('run-1', [gate('g-review', 'review', 'pending')]);
  const { projector, appended } = projectorOver(world, [AS_OF, AS_OF, AS_OF]);
  value(await projector.project());
  world.gates.set('run-1', [gate('g-review', 'review', 'blocked')]);
  value(await projector.project());
  world.admissions.set('adm-task-1', { ...world.admissions.get('adm-task-1')!, policyRevision: 'policy-2' as never });
  value(await projector.project());
  assert.equal(appended.length, 3, 'a later stage\'s gate and an admission are task detail');
  assert.equal(new Set(appended.map((each) => JSON.stringify(each))).size, 1, 'the card itself is unchanged');
});

test('a rejected task shows the rejection and its end, and a re-admission hides both', async () => {
  const ended = { id: 'att-1', executions: [], outcome: { kind: 'not-started', cancelled: false, ownershipGeneration: 1, endedAt: LATE } };
  const world = await runningCard(ended);
  world.outcomes.set('task-1', { taskId: 'task-1', attemptId: 'att-1', source: 'scheduler', disposition: 'rejected', reason: 'resource-ceiling-exceeded', recordedAt: LATE } as never);
  const card = await onlyCard(world);
  assert.deepEqual(card.obstacle, { source: 'scheduler', disposition: 'rejected', reason: 'resource-ceiling-exceeded', taskId: 'task-1', attemptId: 'att-1', observedAt: LATE });
  assert.deepEqual(card.end, { kind: 'rejected', taskId: 'task-1', attemptId: 'att-1', outcome: ended.outcome });
  assert.deepEqual(card.session, { state: 'stopped' });
  world.tasks.set('task-1', task('task-1', [ended], 2));
  const readmitted = await onlyCard(world);
  assert.equal(readmitted.obstacle, undefined);
  assert.equal(readmitted.end, undefined);
  assert.equal(readmitted.waitingFor, 'stage-admission');
  assert.deepEqual(readmitted.session, { state: 'waiting-for-admission' });
});

test('a task end is cancelled, uncertain, or out of retries, and a clean exit or a pending retry is none', async () => {
  const outcome = (extra: object) => ({ cancelled: false, ownershipGeneration: 1, endedAt: LATE, executionId: 'ex-1', ...extra });
  const exited = (status: object, startProven = true) => outcome({ kind: 'exited', status, startProven });
  const cases: [object[], string | undefined][] = [
    [[{ id: 'a', executions: [], outcome: outcome({ kind: 'not-started', cancelled: true }) }], 'cancelled'],
    [[{ id: 'a', executions: [], outcome: outcome({ kind: 'operator-resolved', evidence: 'ref' }) }], 'uncertain-exit'],
    [[{ id: 'a', executions: [], outcome: exited({ kind: 'code', code: 0 }, false) }], 'uncertain-exit'],
    [[{ id: 'a', executions: [], outcome: exited({ kind: 'unknown' }) }], 'uncertain-exit'],
    [[{ id: 'a', executions: [], outcome: exited({ kind: 'code', code: 0 }) }], undefined],
    [[{ id: 'a', executions: [], outcome: exited({ kind: 'code', code: 1 }) }], undefined],
    [['a', 'b', 'c'].map((id, index) => ({ id, ...(index === 0 ? {} : { retryOf: 'a' }), executions: [], outcome: exited({ kind: 'signal', signal: 'SIGKILL' }) })), 'retries-exhausted'],
  ];
  for (const [attempts, kind] of cases) {
    const world = new BoardWorld();
    await world.card('run-1', 'alpha', EARLY, run('run-1', IMPLEMENTING));
    world.addTask('run-1', task('task-1', attempts), 'apply');
    assert.equal((await onlyCard(world)).end?.kind, kind, JSON.stringify(attempts));
  }
});

test('the merge gate follows readiness and the auto-merge setting, and an in-flight request wins', async () => {
  const world = new BoardWorld();
  const done = { proposal: 'completed', specs: 'completed', apply: 'completed', review: 'completed' } as const;
  await world.card('run-1', 'alpha', EARLY, run('run-1', done));
  world.gates.set('run-1', ['proposal', 'specs', 'apply', 'review'].map((stage) => gate(`g-${stage}`, stage)));
  const ready = await onlyCard(world);
  assert.deepEqual([ready.integration, ready.column, ready.waitingFor], ['ready', 'review', 'merge-queue']);
  world.autoMergeOff.add('alpha');
  const manual = await onlyCard(world);
  assert.deepEqual([manual.integration, manual.waitingFor], ['awaiting-manual-merge', 'person']);
  const request = (state: string, withdrawalReason?: string) => ({ state, ...(withdrawalReason === undefined ? {} : { withdrawalReason }) }) as never;
  assert.equal(mergeGate(false, true, request('withdrawn', 'cancelled')), 'not-ready');
  assert.equal(mergeGate(true, true, request('withdrawn', 'maintainer-withdrew')), 'withdrawn');
  assert.equal(mergeGate(true, true, request('withdrawn', 'manual-merge')), 'awaiting-manual-merge');
  assert.equal(mergeGate(true, true, request('withdrawn', 'gate-not-passed')), 'ready');
  assert.equal(mergeGate(false, true, request('queued')), 'queued');
  const merged = views(world, { mergeQueue: { latestForRun: async () => ok(request('merged')) } });
  const board = await merged.forCaller(true).board('alpha' as never);
  assert.deepEqual(board.ok && [board.value.cards[0]!.integration, board.value.cards[0]!.column], ['integrated', 'archived']);
  const failing = views(world, { mergeQueue: { latestForRun: async () => err(failure('unavailable', 'down')) } });
  assert.equal((await failing.forCaller(true).board('alpha' as never)).ok, false);
});

test('a task detail shows every stage with its gates, the binding, and the tasks with a delegated child', async () => {
  const world = await runningCard();
  world.gates.set('run-1', [gate('g-1', 'apply', 'blocked')]);
  world.addTask('run-1', task('task-2'), 'apply', { parent: 'task-1', depth: 1, session: false });
  const detail = await views(world).forCaller(false).taskDetail('alpha' as never, 'run-1' as never);
  assert.ok(detail.ok);
  assert.equal(detail.value.position, '7');
  assert.deepEqual(detail.value.stages.map((stage) => [stage.stageId, stage.column, stage.state, stage.gates.length]), [
    ['proposal', 'propose', 'not-started', 0], ['specs', 'specify', 'not-started', 0], ['apply', 'implement', 'in-progress', 1],
    ['review', 'review', 'not-started', 0], ['archive', 'review', 'not-started', 0],
  ].map(([id, column, , gates]) => [id, column, (IMPLEMENTING as Record<string, string>)[id as string] ?? 'not-started', gates]));
  assert.deepEqual(detail.value.stages[2]!.gates, [{ gateId: 'g-1', state: 'blocked', requiredEvidence: 'structural-validation' }]);
  assert.deepEqual(detail.value.runBinding, BINDING);
  assert.deepEqual(detail.value.traceability, []);
  assert.deepEqual(detail.value.tasks.map((each) => [each.taskId, each.delegation, each.session.state, each.admission.dispatchedGeneration]), [
    ['task-1', undefined, 'working', 1], ['task-2', { parentTaskId: 'task-1', depth: 1 }, 'none', 1],
  ]);
  assert.equal(detail.value.card.gate, 'blocked');
});

test('a task detail of another project, or of a run that is no card, answers not-found', async () => {
  const world = await runningCard();
  await world.card('run-beta', 'beta');
  const read = (projectId: string, runId: string) => views(world).forCaller(false).taskDetail(projectId as never, runId as never);
  for (const [projectId, runId] of [['alpha', 'run-beta'], ['alpha', 'run-none'], ['beta', 'run-1']]) {
    const detail = await read(projectId!, runId!);
    assert.equal(detail.ok || detail.error.code, 'not-found', `${projectId} ${runId}`);
  }
  world.runs.delete('run-1');
  const orphan = await read('alpha', 'run-1');
  assert.equal(orphan.ok || orphan.error.code, 'internal');
});

test('the inbox lists every page of every source newest first, filtered by kind and card', async () => {
  const world = await runningCard();
  world.items = [
    item('i-1', 'run-1', { createdAt: EARLY }), item('i-2', 'run-1', { createdAt: LATE, kind: 'input-request' }),
    item('i-3', 'run-2', { createdAt: LATE }), item('i-4', 'run-1', { createdAt: AS_OF }), item('i-5', 'run-1', { projectId: 'beta' }),
  ];
  const scope = { kind: 'project', projectId: 'alpha' } as const;
  const ids = async (filter = {}) => {
    const list = await views(world).open(scope as never, filter);
    assert.ok(list.ok);
    assert.equal(list.value.position, '7');
    return list.value.items.map((each) => each.id);
  };
  assert.deepEqual(await ids(), ['i-4', 'i-3', 'i-2', 'i-1']);
  assert.deepEqual(await ids({ kind: 'input-request' }), ['i-2']);
  assert.deepEqual(await ids({ runId: 'run-2' }), ['i-3']);
  const counts = await views(world).counts(scope as never);
  assert.deepEqual(counts, { ok: true, value: { asOf: AS_OF, position: '7', total: 4, byCard: [{ runId: 'run-1', count: 3 }] } });
  const installation = await views(world).counts({ kind: 'installation' });
  assert.deepEqual(installation.ok && [installation.value.total, installation.value.byCard], [0, []]);
});

test('a source that cannot be read fails every view as unavailable, never a partial one', async () => {
  const world = await runningCard();
  world.failSource = true;
  const scope = { kind: 'project', projectId: 'alpha' } as never;
  for (const read of [views(world).open(scope), views(world).counts(scope), views(world).forCaller(true).board('alpha' as never)]) {
    const result = await read;
    assert.equal(result.ok || result.error.code, 'unavailable');
  }
});
