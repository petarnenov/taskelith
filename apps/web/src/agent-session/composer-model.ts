import type { SubmitResult, Turn } from '../board/board';
import type { TurnRecord } from './turn-records';

// The composer's rules, free of React: the text the control plane takes,
// and what each answer to a submission means for its key (decision Q3).

// TurnText of control-plane.openapi.json: 1 to 65,536 characters.
export const MAX_TURN_TEXT_LENGTH = 65_536;

// The counter shows from this length on, so it does not distract before.
export const COUNTER_FROM_LENGTH = 60_000;

export type TextCheck =
  | { readonly kind: 'ok'; readonly text: string; readonly length: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'too-long'; readonly length: number };

// The trimmed draft; the control plane counts code points, so does this.
export function checkTurnText(draft: string): TextCheck {
  const text = draft.trim();
  if (text === '') return { kind: 'empty' };
  const length = turnTextLength(text);
  return length > MAX_TURN_TEXT_LENGTH ? { kind: 'too-long', length } : { kind: 'ok', text, length };
}

export function turnTextLength(text: string): number {
  return [...text].length;
}

// A failure after which the same key may be sent again: no usable answer,
// a 401, or a CSRF refusal whose session read gave no renewed token.
export type RetryableFailure = 'unavailable' | 'unauthenticated' | 'token-not-renewed';

export type RefusalReason = 'key-reused' | 'session-stopped' | 'csrf-rejected' | 'invalid' | 'not-found';

export type SubmissionState =
  | { readonly status: 'pending' }
  // Sent before a reload; its answer was not seen.
  | { readonly status: 'unconfirmed' }
  | { readonly status: 'failed'; readonly failure: RetryableFailure }
  | { readonly status: 'duplicate'; readonly turn: Turn }
  | { readonly status: 'refused'; readonly reason: RefusalReason }
  | { readonly status: 'denied'; readonly requiredRole?: string };

export interface Submission extends TurnRecord {
  readonly state: SubmissionState;
}

// recorded: the turn shows at once and the submission leaves; duplicate:
// the turn it repeats shows; retryable keeps the record; terminal drops it.
export type Outcome =
  | { readonly kind: 'recorded'; readonly turn: Turn }
  | { readonly kind: 'duplicate'; readonly turn: Turn }
  | { readonly kind: 'retry-with-new-token' }
  | { readonly kind: 'retryable'; readonly failure: RetryableFailure }
  | { readonly kind: 'terminal'; readonly state: SubmissionState };

export function restoredSubmissions(records: readonly TurnRecord[]): Submission[] {
  return records.map((record) => ({ ...record, state: { status: 'unconfirmed' } }));
}

// A CSRF refusal has the session read again and the key sent once more;
// a second one is shown, as every other refusal.
export function outcomeOf(result: SubmitResult, tokenRefreshed: boolean): Outcome {
  switch (result.kind) {
    case 'recorded':
    case 'duplicate':
      return { kind: result.kind, turn: result.turn };
    case 'csrf-rejected':
      return tokenRefreshed ? refused('csrf-rejected') : { kind: 'retry-with-new-token' };
    case 'unavailable':
    case 'unauthenticated':
      return { kind: 'retryable', failure: result.kind };
    case 'denied':
      return { kind: 'terminal', state: deniedState(result.requiredRole) };
    default:
      return refused(result.kind);
  }
}

function deniedState(requiredRole: string | undefined): SubmissionState {
  return requiredRole === undefined ? { status: 'denied' } : { status: 'denied', requiredRole };
}

function refused(reason: RefusalReason): Outcome {
  return { kind: 'terminal', state: { status: 'refused', reason } };
}
