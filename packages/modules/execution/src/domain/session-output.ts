import type { Result } from '@taskelith/kernel';
import { notImplemented, type OutputAppend, type OutputRead, type Session } from './session-records.js';

// The live stream bound per active attempt (operational targets, section 2).
export const OUTPUT_RETENTION_BYTES = 10 * 1024 * 1024;

export function appendOutput(session: Session, output: OutputAppend): Result<Session> {
  return notImplemented(session, output);
}

export function readOutputAfter(session: Session, cursor: number): Result<OutputRead> {
  return notImplemented(session, cursor);
}
