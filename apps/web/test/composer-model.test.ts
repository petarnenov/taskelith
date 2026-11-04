import { describe, expect, it } from 'vitest';
import {
  checkTurnText,
  COUNTER_FROM_LENGTH,
  MAX_TURN_TEXT_LENGTH,
  outcomeOf,
  restoredSubmissions,
  turnTextLength,
} from '../src/agent-session/composer-model';
import type { SubmitResult } from '../src/board/board';
import { turn } from './fakes';

describe('checkTurnText', () => {
  it('sends the trimmed text and counts its characters', () => {
    expect(checkTurnText('  Fix the build \n')).toEqual({ kind: 'ok', text: 'Fix the build', length: 13 });
  });

  it.each(['', '   ', '\n\t'])('refuses %j as empty', (draft) => {
    expect(checkTurnText(draft)).toEqual({ kind: 'empty' });
  });

  it('allows the longest text the control plane takes, and refuses one character more', () => {
    expect(checkTurnText('x'.repeat(MAX_TURN_TEXT_LENGTH))).toMatchObject({ kind: 'ok', length: MAX_TURN_TEXT_LENGTH });
    expect(checkTurnText('x'.repeat(MAX_TURN_TEXT_LENGTH + 1))).toEqual({ kind: 'too-long', length: MAX_TURN_TEXT_LENGTH + 1 });
  });

  it('counts characters as the control plane does, one per code point', () => {
    expect(turnTextLength('a😀b')).toBe(3);
    expect(checkTurnText('😀'.repeat(MAX_TURN_TEXT_LENGTH))).toMatchObject({ kind: 'ok', length: MAX_TURN_TEXT_LENGTH });
  });

  it('shows the counter only near the limit', () => {
    expect(COUNTER_FROM_LENGTH).toBeLessThan(MAX_TURN_TEXT_LENGTH);
    expect(COUNTER_FROM_LENGTH).toBeGreaterThan(MAX_TURN_TEXT_LENGTH / 2);
  });
});

describe('restoredSubmissions', () => {
  it('shows each record a reload left as a submission whose answer was not seen', () => {
    const records = [{ key: 'key-1', text: 'One', sentAt: '2026-11-04T10:00:00.000Z' }];
    expect(restoredSubmissions(records)).toEqual([{ ...records[0], state: { status: 'unconfirmed' } }]);
  });
});

describe('outcomeOf', () => {
  const recorded = turn({ turnId: 'turn-3', position: 3, state: 'queued' });

  it('shows a recorded turn at once and ends the submission', () => {
    expect(outcomeOf({ kind: 'recorded', turn: recorded }, false)).toEqual({ kind: 'recorded', turn: recorded });
  });

  it('shows a duplicate as the turn the control plane had recorded', () => {
    expect(outcomeOf({ kind: 'duplicate', turn: recorded }, false)).toEqual({ kind: 'duplicate', turn: recorded });
  });

  it('reads the session again once after a CSRF refusal, and shows the second refusal', () => {
    expect(outcomeOf({ kind: 'csrf-rejected' }, false)).toEqual({ kind: 'retry-with-new-token' });
    expect(outcomeOf({ kind: 'csrf-rejected' }, true)).toEqual({ kind: 'terminal', state: { status: 'refused', reason: 'csrf-rejected' } });
  });

  it.each<[SubmitResult, string]>([
    [{ kind: 'unavailable' }, 'unavailable'],
    [{ kind: 'unauthenticated' }, 'unauthenticated'],
  ])('keeps the key of %o for a retry', (result, failure) => {
    expect(outcomeOf(result, false)).toEqual({ kind: 'retryable', failure });
  });

  it.each<[SubmitResult, unknown]>([
    [{ kind: 'key-reused' }, { status: 'refused', reason: 'key-reused' }],
    [{ kind: 'session-stopped' }, { status: 'refused', reason: 'session-stopped' }],
    [{ kind: 'not-found' }, { status: 'refused', reason: 'not-found' }],
    [{ kind: 'invalid' }, { status: 'refused', reason: 'invalid' }],
    [{ kind: 'denied' }, { status: 'denied' }],
    [{ kind: 'denied', requiredRole: 'project-operator' }, { status: 'denied', requiredRole: 'project-operator' }],
  ])('ends the key of %o with a terminal state', (result, state) => {
    expect(outcomeOf(result, false)).toEqual({ kind: 'terminal', state });
  });
});
