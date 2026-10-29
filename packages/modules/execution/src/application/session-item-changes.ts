import type { Instant } from '@taskelith/kernel';
import type { OwnershipGeneration } from '@taskelith/sdlc';
import type { AttemptId } from '../domain/identifiers.js';
import {
  activeBoundAttempt,
  isSameRequestKey,
  type Answer,
  type NativeRequest,
  type RequestKey,
  type Session,
} from '../domain/session-records.js';
import type { NeedsYouAnswer, NeedsYouItemState } from '../ports/needs-you.js';
import type { SessionItemKind } from '../ports/session-inbox-items.js';

// An item to open for a request, or the new state of its open item.
export type ItemChange =
  | {
    readonly change: 'open';
    readonly kind: SessionItemKind;
    readonly request: RequestKey;
    readonly attemptId?: AttemptId;
    readonly attemptGeneration?: OwnershipGeneration;
  }
  | { readonly change: 'settle'; readonly kind: SessionItemKind; readonly request: RequestKey; readonly state: NeedsYouItemState };

// What a change of a session does to its native request items (wire
// contracts, sections 8 and 8.1), from its requests before and after.
export function itemChanges(before: Session, after: Session, at: Instant): readonly ItemChange[] {
  return after.requests.flatMap((request) => {
    const earlier = before.requests.find((candidate) => isSameRequestKey(candidate.key, request.key));
    return requestItemChanges(after, earlier, request, at);
  });
}

// A delegation request has no item of its own, since only the host answers
// it, but its uncertain delivery opens an acknowledgement as any other's.
function requestItemChanges(session: Session, earlier: NativeRequest | undefined, request: NativeRequest, at: Instant): ItemChange[] {
  const own = request.kind === 'delegation-request' ? [] : answerItemChanges(session, earlier, request, request.kind, at);
  return [...own, ...acknowledgementChanges(earlier, request)];
}

function answerItemChanges(
  session: Session, earlier: NativeRequest | undefined, request: NativeRequest, kind: SessionItemKind, at: Instant,
): ItemChange[] {
  if (earlier === undefined && request.state === 'open') return [{ change: 'open', kind, request: request.key, ...boundAttemptOf(session) }];
  if (earlier?.state === 'open' && request.state !== 'open') return [{ change: 'settle', kind, request: request.key, state: settledState(request, at) }];
  return [];
}

function acknowledgementChanges(earlier: NativeRequest | undefined, request: NativeRequest): ItemChange[] {
  if (isUncertain(earlier) || !isUncertain(request) || request.state !== 'answered') return [];
  const { attemptId, ownershipGeneration } = request.response;
  return [{ change: 'open', kind: 'delivery-acknowledgement', request: request.key, attemptId, attemptGeneration: ownershipGeneration }];
}

// A person's answer resolves the item; a standing rule's, an expiry, or a
// generation's end closes it, as no person answered.
function settledState(request: NativeRequest, at: Instant): NeedsYouItemState {
  if (request.state !== 'answered' || request.response.responder.kind !== 'principal') return { state: 'closed', closedAt: at };
  const answer = needsYouAnswerOf(request.response.answer);
  if (answer === undefined) return { state: 'closed', closedAt: at };
  return { state: 'resolved', resolution: { resolvedBy: request.response.responder.principalId, resolvedAt: at, answer } };
}

function needsYouAnswerOf(answer: Answer): NeedsYouAnswer | undefined {
  switch (answer.kind) {
    case 'permission':
      return { kind: 'permission-request', decision: answer.decision };
    case 'input':
      return { kind: 'input-request', text: answer.text };
    case 'delegation-result':
      return undefined;
  }
}

function boundAttemptOf(session: Session): { attemptId?: AttemptId; attemptGeneration?: OwnershipGeneration } {
  const attempt = activeBoundAttempt(session);
  return attempt === undefined ? {} : { attemptId: attempt.id, attemptGeneration: attempt.ownershipGeneration };
}

function isUncertain(request: NativeRequest | undefined): boolean {
  return request?.state === 'answered' && request.response.delivery === 'delivery-uncertain';
}
