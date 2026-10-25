import { failure, type Failure, type FailureCode } from '@taskelith/kernel';

// Why a worker root or journal cannot be used; callers branch on `reason`
// in the failure details, never on the message.
export const ROOT_FAILURE_REASONS = Object.freeze([
  'not-enrolled',
  'journal-loss',
  'corrupt',
  'newer-format',
  'binding-mismatch',
  'root-locked',
  'unsafe-path',
  'inside-checkout',
  'unsupported-volume',
  'flush-failure',
  'disk-full',
  'stopped',
] as const);

export type RootFailureReason = (typeof ROOT_FAILURE_REASONS)[number];

const CODES: Readonly<Record<RootFailureReason, FailureCode>> = Object.freeze({
  'not-enrolled': 'not-found',
  'journal-loss': 'precondition-failed',
  corrupt: 'precondition-failed',
  'newer-format': 'precondition-failed',
  'binding-mismatch': 'precondition-failed',
  'root-locked': 'conflict',
  'unsafe-path': 'forbidden',
  'inside-checkout': 'forbidden',
  'unsupported-volume': 'forbidden',
  'flush-failure': 'unavailable',
  'disk-full': 'unavailable',
  stopped: 'unavailable',
});

export function rootFailure(reason: RootFailureReason, message: string, details: Record<string, string> = {}): Failure {
  return failure(CODES[reason], message, { ...details, reason });
}

export function failureReason(value: Failure): string | undefined {
  return value.details.reason;
}
