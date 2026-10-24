// Stable codes: callers branch on the code, never on the message text.
export const FAILURE_CODES = [
  'invalid',
  'not-found',
  'conflict',
  'precondition-failed',
  'forbidden',
  'unavailable',
  'internal',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export interface Failure {
  readonly code: FailureCode;
  readonly message: string;
  readonly details: Readonly<Record<string, string>>;
}

export function failure(
  code: FailureCode,
  message: string,
  details: Readonly<Record<string, string>> = {},
): Failure {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

export function isFailureCode(value: string): value is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(value);
}
