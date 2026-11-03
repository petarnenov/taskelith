import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CARD_CATALOG_CONFORMANCE,
  InMemoryCardCatalog,
  cardColumn,
  closeStage,
  columnOf,
  currentStage,
  isMergeReady,
  mostUrgentGate,
  stageGraph,
  stageSummary,
} from '@taskelith/execution';
import type { Gate, GateState, StageState, WorkflowProgress } from '@taskelith/sdlc';

interface StageSpec {
  readonly id: string;
  readonly obligations: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly origin?: 'native' | 'platform-managed';
}

// The frozen OpenSpec plugin's graph (product ports section 3.2).
const OPENSPEC: readonly StageSpec[] = [
  { id: 'proposal', obligations: ['intake', 'specification'] },
  { id: 'specs', obligations: ['specification'], dependsOn: ['proposal'] },
  { id: 'design', obligations: ['specification'], dependsOn: ['specs'] },
  { id: 'tasks', obligations: ['specification'], dependsOn: ['design'] },
  { id: 'apply', obligations: ['implementation'], dependsOn: ['tasks'] },
  { id: 'verify', obligations: ['verification'], dependsOn: ['apply'], origin: 'platform-managed' },
  { id: 'review', obligations: ['review'], dependsOn: ['verify'], origin: 'platform-managed' },
  { id: 'archive', obligations: ['closure'], dependsOn: ['review'] },
];

// The SpecKit fixture lists `close` before a stage that does not need it.
const SPECKIT: readonly StageSpec[] = [
  { id: 'specify', obligations: ['intake', 'specification'] },
  { id: 'review-spec', obligations: ['review'], dependsOn: ['specify'] },
  { id: 'plan', obligations: ['specification'], dependsOn: ['review-spec'] },
  { id: 'implement', obligations: ['implementation'], dependsOn: ['plan'] },
  { id: 'review', obligations: ['review'], dependsOn: ['implement'] },
  { id: 'close', obligations: ['closure'], dependsOn: ['review'], origin: 'platform-managed' },
  { id: 'after-close', obligations: ['verification'], dependsOn: ['close'] },
  { id: 'side', obligations: ['verification'], dependsOn: ['implement'] },
];

function progress(stages: readonly StageSpec[], states: Readonly<Record<string, StageState>> = {}): WorkflowProgress {
  const definition = {
    id: 'flow', version: '1',
    stages: stages.map((stage) => ({ id: stage.id, obligations: stage.obligations, origin: stage.origin ?? 'native', dependsOn: stage.dependsOn ?? [] })),
  };
  const at = '2026-11-03T08:00:00.000Z';
  return { definition, generation: 1, stages: stages.map((stage) => ({ stageId: stage.id, state: states[stage.id] ?? 'not-started', changedAt: at })) } as never;
}

function gate(id: string, stageId: string, state: GateState): Gate {
  return { id, stageId, state, requiredEvidence: 'structural-validation' } as never;
}

const completed = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, 'completed' as const]));

test('each OpenSpec and SpecKit stage maps to the column of section 3.2', () => {
  const openspec = stageGraph(progress(OPENSPEC));
  assert.deepEqual(openspec.order.map((stage) => columnOf(stage, openspec)), ['propose', 'specify', 'specify', 'specify', 'implement', 'verify', 'review', 'review']);
  const speckit = stageGraph(progress(SPECKIT));
  assert.deepEqual(
    speckit.order.map((stage) => `${stage.id}:${columnOf(stage, speckit)}`),
    ['specify:propose', 'review-spec:specify', 'plan:specify', 'implement:implement', 'review:review', 'close:review', 'after-close:verify', 'side:verify'],
  );
});

test('the current stage is the first not completed in graph order, and the Close stage once all are', () => {
  const fresh = stageGraph(progress(OPENSPEC));
  assert.deepEqual(stageSummary(currentStage(fresh), fresh), { stageId: 'proposal', origin: 'native', state: 'not-started' });
  const started = stageGraph(progress(OPENSPEC, { ...completed(['proposal', 'specs']), design: 'in-progress' }));
  assert.equal(currentStage(started).id, 'design');
  assert.equal(cardColumn(started, false), 'specify');
  const done = stageGraph(progress(OPENSPEC, completed(OPENSPEC.map((stage) => stage.id))));
  assert.deepEqual(stageSummary(currentStage(done), done), { stageId: 'archive', origin: 'native', state: 'completed' });
  assert.equal(closeStage(done).id, 'archive');
  assert.equal(cardColumn(done, false), 'review', 'an unmerged card stays in review');
  assert.equal(cardColumn(done, true), 'archived');
});

test('a stage listed before its dependency is ordered after it', () => {
  const graph = stageGraph(progress([{ id: 'b', obligations: ['closure'], dependsOn: ['a'] }, { id: 'a', obligations: ['intake'] }]));
  assert.deepEqual(graph.order.map((stage) => stage.id), ['a', 'b']);
});

test('the Close stage as the current stage keeps the card in review, and a rework moves it back', () => {
  const closing = stageGraph(progress(OPENSPEC, completed(OPENSPEC.slice(0, 7).map((stage) => stage.id))));
  assert.equal(cardColumn(closing, false), 'review');
  const rework = stageGraph(progress(OPENSPEC, { ...completed(OPENSPEC.map((stage) => stage.id)), apply: 'in-progress' }));
  assert.equal(cardColumn(rework, false), 'implement');
  assert.equal(cardColumn(rework, true), 'archived', 'a merged card stays archived');
});

test('a card is merge-ready when every pre-merge stage completed and passed, never a stage after the Close stage', () => {
  const preMerge = ['specify', 'review-spec', 'plan', 'implement', 'review', 'side'];
  const passed = preMerge.map((stage) => gate(`g-${stage}`, stage, 'passed'));
  const ready = stageGraph(progress(SPECKIT, completed(preMerge)));
  assert.equal(isMergeReady(ready, passed), true);
  assert.equal(isMergeReady(ready, passed.filter((each) => each.stageId !== 'side')), false, 'a stage without a gate never passed');
  assert.equal(isMergeReady(ready, [...passed, gate('g-stale', 'plan', 'stale')]), false);
  const sideOpen = stageGraph(progress(SPECKIT, completed(preMerge.filter((stage) => stage !== 'side'))));
  assert.equal(isMergeReady(sideOpen, passed), false, 'a stage after the Close stage in order but not depending on it is pre-merge');
});

test('the most urgent gate of a stage wins in the order blocked, failed, stale, pending, passed', () => {
  const gates = [gate('a', 'apply', 'passed'), gate('b', 'apply', 'pending'), gate('c', 'apply', 'stale'), gate('d', 'verify', 'blocked')];
  assert.equal(mostUrgentGate('apply' as never, gates), 'stale');
  assert.equal(mostUrgentGate('verify' as never, gates), 'blocked');
  assert.equal(mostUrgentGate('review' as never, gates), undefined);
  assert.equal(mostUrgentGate('apply' as never, [...gates, gate('e', 'apply', 'failed')]), 'failed');
});

for (const conformance of CARD_CATALOG_CONFORMANCE) {
  test(`in-memory card catalog: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryCardCatalog()), []);
  });
}
