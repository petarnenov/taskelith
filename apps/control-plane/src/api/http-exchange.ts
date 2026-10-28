import type { IncomingMessage, ServerResponse } from 'node:http';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { redactFailure } from '@taskelith/secrets';

// Every message of the execution and SDLC contracts is at most 1 MiB.
export const MAX_BODY_BYTES = 1024 ** 2;
// Provisional, in the operational targets: content per evidence publication,
// and publications buffered at once.
export const MAX_EVIDENCE_BYTES = 64 * 1024 ** 2;
export const MAX_CONCURRENT_UPLOADS = 4;

// Headers such as Set-Cookie; a failure keeps its redacted code and
// details for the request log.
interface ResponseExtras {
  readonly headers?: Readonly<Record<string, string>>;
  readonly failure?: Failure;
}

export interface JsonResponse extends ResponseExtras {
  readonly status: number;
  readonly body: unknown;
}

export interface BinaryResponse extends ResponseExtras {
  readonly status: number;
  readonly binary: Uint8Array;
}

export interface EmptyResponse extends ResponseExtras {
  readonly status: number;
  readonly empty: true;
}

export type ApiResponse = JsonResponse | BinaryResponse | EmptyResponse;

// The bearer token of the Authorization header, or undefined without one.
export function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  // The scheme is case-insensitive (RFC 9110); the token is taken exactly.
  const match = header === undefined ? null : /^Bearer ([\x21-\x7e]+)$/i.exec(header);
  return match?.[1];
}

export async function readBody(request: IncomingMessage, limit: number): Promise<Result<Buffer>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) return err(failure('invalid', `the request body exceeds ${limit} bytes`));
    chunks.push(chunk as Buffer);
  }
  return ok(Buffer.concat(chunks));
}

export async function readJsonBody(request: IncomingMessage): Promise<Result<unknown>> {
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) return body;
  if (body.value.length === 0) return err(failure('invalid', 'the request has no JSON body'));
  return parseJson(body.value);
}

export function parseJson(bytes: Buffer): Result<unknown> {
  try {
    return ok(JSON.parse(bytes.toString('utf8')));
  } catch {
    return err(failure('invalid', 'the request body is not JSON'));
  }
}

export function writeResponse(response: ServerResponse, answer: ApiResponse, correlationId: string): void {
  const binary = 'binary' in answer;
  const content = 'empty' in answer ? Buffer.alloc(0) : binary ? answer.binary : Buffer.from(JSON.stringify(answer.body));
  response.writeHead(answer.status, {
    ...answer.headers,
    ...('empty' in answer ? {} : { 'content-type': binary ? 'application/octet-stream' : 'application/json' }),
    'content-length': content.byteLength,
    'x-correlation-id': correlationId,
    'cache-control': 'no-store',
    // Evidence bytes are data; a browser must not render them as a page.
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

// A failure leaves the process with its secrets redacted (trust model 5).
export function failureResponse(status: number, failed: Failure): JsonResponse {
  const redacted = redactFailure(failed);
  const { code, message, details } = redacted;
  return { status, body: { code, message, details }, failure: redacted };
}
