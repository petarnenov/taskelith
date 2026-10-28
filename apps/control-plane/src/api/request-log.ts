import type { Failure } from '@taskelith/kernel';
import type { LogFields } from '@taskelith/observability';
import { redactSecrets } from '@taskelith/secrets';

export interface RequestFacts {
  readonly method: string;
  readonly operationId: string;
  readonly parameters: readonly string[];
  readonly query: URLSearchParams;
  // The query parameters the operation declares; no other is logged.
  readonly declaredQuery: readonly string[];
  readonly status: number;
  readonly durationMs: number;
  readonly failure?: Pick<Failure, 'code' | 'details'>;
}

// The allowlist of wire contracts section 7: never a header, cookie, or
// body, and what it holds is still redacted.
export function requestLogFields(facts: RequestFacts): LogFields {
  const declared = [...facts.query].filter(([name]) => facts.declaredQuery.includes(name));
  const query = new URLSearchParams(declared.map(([name, text]) => [name, redactSecrets(text)]));
  const reason = facts.failure?.details.reason;
  return {
    method: redactSecrets(facts.method), operationId: facts.operationId, status: facts.status, durationMs: facts.durationMs,
    ...(facts.parameters.length === 0 ? {} : { parameters: facts.parameters.map((parameter) => redactSecrets(parameter)).join('/') }),
    ...(query.size === 0 ? {} : { query: query.toString() }),
    ...(facts.failure === undefined ? {} : { failureCode: facts.failure.code }),
    ...(reason === undefined ? {} : { failureReason: redactSecrets(reason) }),
  };
}
