import type { MessageSchemas } from '@taskelith/contracts';
import {
  activeBoundAttempt,
  type NativeSessionId,
  type RequestKey,
  type Session,
  type SessionGeneration,
  type SessionId,
  type SessionTimelineService,
  type TurnId,
} from '@taskelith/execution';
import { err, failure, ok, type Failure, type FailureCode, type Instant, type Result } from '@taskelith/kernel';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import type { ObservationContext, ObservationEffect } from './observation-effects.js';
import type { Observation } from './observation.js';

// The timeline operations that the host's reports reach (session timeline
// contract, section 1), bound to the observation's transaction.
export type SessionObservationTimeline = Pick<
  SessionTimelineService,
  | 'startGeneration' | 'endGeneration' | 'deliverTurn' | 'recordTurnOutcome' | 'recordTurnAcceptanceUnknown' | 'recordTurnRefused'
  | 'recordRequest' | 'recordDeliveryReport' | 'appendOutput' | 'recordLimitSignal'
>;

type Payload<Name extends keyof MessageSchemas> = MessageSchemas[Name];

// What one session observation reports: its timeline operation, and whether
// the session already holds that fact, so that a refusal of it is a repeat.
interface SessionReport {
  apply(timeline: SessionObservationTimeline, sessionId: SessionId): Promise<Result<unknown>>;
  isHeldBy(session: Session): boolean;
}

// Every session payload names its session (worker messages, section 9).
interface SessionPayload {
  readonly sessionId: string;
}

// Why a session observation changes nothing; a log names only this.
type OwnershipRefusal = 'session-unknown' | 'attempt-not-current' | 'attempt-not-held';
const TIMELINE_REFUSED = 'timeline-refused';

// Every code the timeline refuses a report with (contract, section 2); its
// stores fail with the same codes, so a code alone names no refusal.
const TIMELINE_REFUSALS: ReadonlySet<FailureCode> = new Set(['invalid', 'not-found', 'conflict', 'precondition-failed']);

const NEVER_HELD = (): boolean => false;
const NOTHING_TO_APPLY = async (): Promise<Result<void>> => ok(undefined);

function generationStarted(payload: Payload<'GenerationStartedPayload'>): SessionReport {
  const start = { generation: payload.generation as SessionGeneration, nativeSessionId: payload.nativeSessionId as NativeSessionId };
  return {
    apply: (timeline, sessionId) => timeline.startGeneration(sessionId, start),
    isHeldBy: (session) => session.nativeSessionId === start.nativeSessionId && session.generations.some((run) => run.generation === start.generation),
  };
}

function generationEnded(payload: Payload<'GenerationEndedPayload'>): SessionReport {
  return {
    apply: (timeline, sessionId) => timeline.endGeneration(sessionId, payload.generation as SessionGeneration),
    isHeldBy: NEVER_HELD,
  };
}

function turnDelivered(payload: Payload<'TurnDeliveredPayload'>): SessionReport {
  const delivery = turnReport(payload);
  return {
    apply: (timeline, sessionId) => timeline.deliverTurn(sessionId, delivery),
    isHeldBy: (session) => session.turns.some((turn) => (
      turn.id === delivery.turnId && (turn.state === 'delivered' || turn.state === 'ended') && turn.generation === delivery.generation
    )),
  };
}

// Worker messages section 3: only `turn-invalid` ends the turn; after the
// other reasons it stays queued for the next generation.
function turnNotDelivered(payload: Payload<'TurnNotDeliveredPayload'>): SessionReport {
  const refused = payload.reason === 'turn-invalid';
  return {
    apply: refused ? (timeline, sessionId) => timeline.recordTurnRefused(sessionId, turnReport(payload)) : NOTHING_TO_APPLY,
    isHeldBy: NEVER_HELD,
  };
}

function turnAcceptanceUnknown(payload: Payload<'TurnAcceptanceUnknownPayload'>): SessionReport {
  return {
    apply: (timeline, sessionId) => timeline.recordTurnAcceptanceUnknown(sessionId, turnReport(payload)),
    isHeldBy: NEVER_HELD,
  };
}

function turnEnded(payload: Payload<'TurnEndedPayload'>): SessionReport {
  const failure = 'failure' in payload ? payload.failure : undefined;
  const end = { ...turnReport(payload), outcome: payload.outcome, ...(failure === undefined ? {} : { failure }) };
  return {
    apply: (timeline, sessionId) => timeline.recordTurnOutcome(sessionId, end),
    isHeldBy: (session) => session.turns.some((turn) => (
      turn.id === end.turnId && turn.state === 'ended' && turn.generation === end.generation && turn.outcome === end.outcome && turn.failure === failure
    )),
  };
}

// The timeline answers an equal recording as a repeat itself; the request's
// classified operation is left to the standing rule check (item 13c2).
function requestRecorded(payload: Payload<'RequestRecordedPayload'>): SessionReport {
  const recording = { key: requestKey(payload.request), kind: payload.kind, turnId: payload.turnId as TurnId, text: payload.text };
  return {
    apply: (timeline, sessionId) => timeline.recordRequest(sessionId, recording),
    isHeldBy: NEVER_HELD,
  };
}

function deliveryReported(payload: Payload<'ResponseDeliveryReportedPayload'>): SessionReport {
  const key = requestKey(payload.request);
  return {
    apply: (timeline, sessionId) => timeline.recordDeliveryReport(sessionId, key, payload.report),
    isHeldBy: (session) => session.requests.some((request) => (
      request.key.generation === key.generation && request.key.nativeRequestId === key.nativeRequestId
      && request.state === 'answered' && request.response.delivery === payload.report
    )),
  };
}

// The inbox keeps a chunk from being appended twice; the timeline numbers
// its own positions and holds no chunk number.
function outputAppended(payload: Payload<'OutputAppendedPayload'>): SessionReport {
  const output = { ...turnReport(payload), text: payload.text };
  return {
    apply: (timeline, sessionId) => timeline.appendOutput(sessionId, output),
    isHeldBy: NEVER_HELD,
  };
}

function limitSignaled(payload: Payload<'LimitSignaledPayload'>): SessionReport {
  const signal = payload.resetsAt === undefined ? {} : { resetsAt: payload.resetsAt as Instant };
  return {
    apply: (timeline, sessionId) => timeline.recordLimitSignal(sessionId, signal),
    isHeldBy: NEVER_HELD,
  };
}

// The consumer checked each identifier and generation against its schema.
function turnReport(payload: { readonly turnId: string; readonly generation: number }) {
  return { turnId: payload.turnId as TurnId, generation: payload.generation as SessionGeneration };
}

function requestKey(request: Payload<'NativeRequestKey'>): RequestKey {
  return { generation: request.generation as SessionGeneration, nativeRequestId: request.nativeRequestId as RequestKey['nativeRequestId'] };
}

// Worker messages section 9: the report is applied through the timeline; a
// refusal that is no repeat is evidence, kept only when no store was touched.
function sessionEffect<Reported extends SessionPayload>(reportOf: (payload: Reported) => SessionReport): ObservationEffect {
  return async (tx, observation, _at, context) => {
    const payload = observation.payload as Reported;
    const sessionId = payload.sessionId as SessionId;
    const owned = await ownedSession(tx, observation, sessionId);
    if (!owned.ok) return owned;
    if (typeof owned.value === 'string') return keptAsEvidence(context, observation, { sessionId, reason: owned.value });
    const report = reportOf(payload);
    const applied = await report.apply(context.timeline, sessionId);
    if (applied.ok) return ok(undefined);
    if (!context.timelineStores.isUntouched()) return storeFailure(sessionId, applied.error);
    if (!TIMELINE_REFUSALS.has(applied.error.code)) return applied;
    if (report.isHeldBy(owned.value)) return ok(undefined);
    return keptAsEvidence(context, observation, { sessionId, reason: TIMELINE_REFUSED, code: applied.error.code });
  };
}

// A refusal's code would confirm the observation (G2 path), so the failure
// is returned as `internal`: the transaction rolls back and runs again.
function storeFailure(sessionId: SessionId, failed: Failure): Result<never> {
  if (!TIMELINE_REFUSALS.has(failed.code)) return err(failed);
  return err(failure('internal', `the timeline of session ${sessionId} failed after its store was touched`, { session: sessionId, code: failed.code }));
}

// The session, only when the observed attempt is its active bound attempt at
// the observed ownership generation and the producer held it there.
async function ownedSession(tx: ControlPlaneTransaction, observation: Observation, sessionId: SessionId): Promise<Result<Session | OwnershipRefusal>> {
  const stored = await tx.sessionTimeline.sessions.get(sessionId);
  if (!stored.ok) return stored;
  if (stored.value === undefined) return ok('session-unknown');
  const { session } = stored.value;
  const active = activeBoundAttempt(session);
  if (active === undefined || active.id !== observation.attemptId || active.ownershipGeneration !== observation.ownershipGeneration) {
    return ok('attempt-not-current');
  }
  const held = await tx.producers.heldGenerations(observation.position.workerId, active.id);
  if (!held.ok) return held;
  return ok(held.value.includes(active.ownershipGeneration) ? session : 'attempt-not-held');
}

interface Refusal {
  readonly sessionId: SessionId;
  readonly reason: OwnershipRefusal | typeof TIMELINE_REFUSED;
  readonly code?: FailureCode;
}

// Worker messages section 10 rule 5: identifiers and the reason only, never
// the payload's text or the failure's message.
function keptAsEvidence(context: ObservationContext, observation: Observation, refusal: Refusal): Result<void> {
  const { workerId, observationId } = observation.position;
  context.log.warn({ workerId, observationId, correlationId: observation.correlationId }, 'execution.observation.evidence', {
    observationType: observation.type, ...refusal,
  });
  return ok(undefined);
}

// Each is registered behind the recovery epoch gate (section 9, "Recovery
// epoch"); the adoption observations of item 21 have no effect here.
export const SESSION_OBSERVATION_EFFECTS: Readonly<Record<string, ObservationEffect>> = Object.freeze({
  'session.generation.started': sessionEffect(generationStarted),
  'session.generation.ended': sessionEffect(generationEnded),
  'session.turn.delivered': sessionEffect(turnDelivered),
  'session.turn.not-delivered': sessionEffect(turnNotDelivered),
  'session.turn.acceptance-unknown': sessionEffect(turnAcceptanceUnknown),
  'session.turn.ended': sessionEffect(turnEnded),
  'session.request.recorded': sessionEffect(requestRecorded),
  'session.response.delivery-reported': sessionEffect(deliveryReported),
  'session.output.appended': sessionEffect(outputAppended),
  'session.limit.signaled': sessionEffect(limitSignaled),
});
