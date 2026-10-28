import type { Result } from '@taskelith/kernel';
import {
  notImplemented,
  type DeliveryReport,
  type NativeRequest,
  type RequestKey,
  type RequestRecording,
  type ResponseSubmission,
  type Session,
} from './session-records.js';

export function recordRequest(session: Session, recording: RequestRecording): Result<Session> {
  return notImplemented(session, recording);
}

export function consumeResponse(session: Session, response: ResponseSubmission): Result<Session> {
  return notImplemented(session, response);
}

export function recordDeliveryReport(session: Session, key: RequestKey, report: DeliveryReport): Result<Session> {
  return notImplemented(session, key, report);
}

export function requestsAwaitingAnswer(session: Session): readonly NativeRequest[] {
  return notImplemented(session);
}

export function uncertainDeliveries(session: Session): readonly NativeRequest[] {
  return notImplemented(session);
}
