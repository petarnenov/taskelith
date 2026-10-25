import type { IncomingMessage, ServerResponse } from 'node:http';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { redactFailure } from '@taskelith/secrets';

// Every message of the execution and SDLC contracts is at most 1 MiB.
export const MAX_BODY_BYTES = 1024 ** 2;

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

// The bearer token of the Authorization header, or undefined without one.
export function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  const match = header === undefined ? null : /^Bearer ([\x21-\x7e]+)$/.exec(header);
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

export function writeJson(response: ServerResponse, { status, body }: JsonResponse, correlationId: string): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'x-correlation-id': correlationId,
    'cache-control': 'no-store',
  });
  response.end(text);
}

// A failure leaves the process with its secrets redacted (trust model 5).
export function failureResponse(status: number, failed: Failure): JsonResponse {
  const { code, message, details } = redactFailure(failed);
  return { status, body: { code, message, details } };
}
