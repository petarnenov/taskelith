import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLEET_OBSTACLE_REASONS,
  OBSTACLE_SOURCES,
  PLACEMENT_REJECTING_REASONS,
  PLACEMENT_WAITING_REASONS,
  WORKER_REFUSAL_REASONS,
} from '@taskelith/execution';
import {
  FLEET_REASONS,
  NO_CANDIDATE_REASON,
  OUTCOME_SOURCES,
  REFUSAL_REASONS,
  REJECTING_REASONS,
  STANDING_REASONS,
  WAITING_REASONS,
} from '@taskelith/scheduling';

// Execution cannot import Scheduling, so the board's obstacle values mirror
// Scheduling's reasons (product ports contract section 3.8); keep them equal.
const MIRRORS = [
  ['waiting reasons', PLACEMENT_WAITING_REASONS, [...WAITING_REASONS, NO_CANDIDATE_REASON]],
  ['rejecting reasons', PLACEMENT_REJECTING_REASONS, REJECTING_REASONS],
  ['fleet reasons', FLEET_OBSTACLE_REASONS, FLEET_REASONS],
  ['worker refusals', WORKER_REFUSAL_REASONS, REFUSAL_REASONS],
] as const;

for (const [name, board, scheduling] of MIRRORS) {
  test(`the board's ${name} equal Scheduling's`, () => {
    assert.deepEqual([...board], [...scheduling]);
  });
}

test('a standing reason is never a board obstacle', () => {
  const shown: readonly string[] = [...PLACEMENT_WAITING_REASONS, ...PLACEMENT_REJECTING_REASONS];
  for (const reason of STANDING_REASONS) assert.ok(!shown.includes(reason), reason);
});

test('every recorded outcome source is a board obstacle source', () => {
  const sources: readonly string[] = OBSTACLE_SOURCES;
  for (const source of OUTCOME_SOURCES) assert.ok(sources.includes(source), source);
});
