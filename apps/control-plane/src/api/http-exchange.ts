import type { IncomingMessage, ServerResponse } from 'node:http';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { redactFailure } from '@taskelith/secrets';

// Every message of the execution and SDLC contracts is at most 1 MiB.
export const MAX_BODY_BYTES = 1024 ** 2;

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface BinaryResponse {
  readonly status: number;
  readonly binary: Uint8Array;
}

export type ApiResponse = JsonResponse | BinaryResponse;

// The bearer token of the Authorization header, or undefined without one.
export function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  // The scheme is case-insensitive (RFC 9110); the token is taken exactly.
  const match = header === undefined ? null : /^Bearer ([\x21-\x7e]+)$/i.exec(header);
  return match?.[1];
}

export async function readJsonBody(request: IncomingMessage): Promise<Result<unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return err(failure('invalid', `the request body exceeds ${MAX_BODY_BYTES} bytes`));
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return err(failure('invalid', 'the request has no JSON body'));
  try {
    return ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    return err(failure('invalid', 'the request body is not JSON'));
  }
}

export function writeResponse(response: ServerResponse, answer: ApiResponse, correlationId: string): void {
  const binary = 'binary' in answer;
  const content = binary ? answer.binary : Buffer.from(JSON.stringify(answer.body));
  response.writeHead(answer.status, {
    'content-type': binary ? 'application/octet-stream' : 'application/json',
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
  const { code, message, details } = redactFailure(failed);
  return { status, body: { code, message, details } };
}
