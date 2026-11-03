import { failure, type Failure, type FailureCode } from '@taskelith/kernel';
import type { GithubRefusal } from './github-api.js';

// Readers of GitHub's JSON, which the plugin checks before it trusts it.

export type JsonRecord = Readonly<Record<string, unknown>>;

export function recordOf(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function textsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

// A refusal as a kernel failure, by its status only: GitHub's message is
// not passed on. Status 0 is a local failure, such as a bad App key.
export function refusal(refused: GithubRefusal, action: string): Failure {
  if (refused.status === 0) return failure('internal', `The request to ${action} failed before reaching GitHub`);
  return failure(codeOf(refused.status), `GitHub refused to ${action}`, { status: String(refused.status) });
}

export function malformed(action: string): Failure {
  return failure('internal', `GitHub answered ${action} with an unexpected shape`);
}

function codeOf(status: number): FailureCode {
  if (status === 429 || status >= 500) return 'unavailable';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'invalid';
  return 'internal';
}
