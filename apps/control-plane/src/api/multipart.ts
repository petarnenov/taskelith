import { err, failure, ok, type Result } from '@taskelith/kernel';

// One part of a `multipart/form-data` body (RFC 7578), its bytes exact.
export interface FormPart {
  readonly name: string;
  readonly contentType?: string;
  readonly content: Buffer;
}

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');
const BOUNDARY = /^multipart\/form-data\s*;(?:.*;)?\s*boundary=(?:"([^"]{1,70})"|([^;\s"]{1,70}))/i;
const PART_NAME = /^form-data(?:\s*;.*?)?;\s*name="([^"]*)"/i;

// The parts in body order; a body that is not well formed is `invalid`.
export function parseMultipart(contentType: string | undefined, body: Buffer): Result<readonly FormPart[]> {
  const boundary = BOUNDARY.exec(contentType ?? '');
  if (boundary === null) return invalid('the request is not multipart/form-data with a boundary');
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const parts: FormPart[] = [];
  let position = body.indexOf(delimiter);
  if (position === -1) return invalid('the multipart body has no boundary');
  for (;;) {
    position += delimiter.length;
    if (body.subarray(position, position + 2).toString() === '--') return ok(parts);
    if (!body.subarray(position, position + 2).equals(CRLF)) return invalid('a multipart boundary is not followed by CRLF');
    const headersEnd = body.indexOf(HEADER_END, position + 2);
    if (headersEnd === -1) return invalid('a multipart part has no header end');
    const next = body.indexOf(Buffer.concat([CRLF, delimiter]), headersEnd + HEADER_END.length);
    if (next === -1) return invalid('the multipart body has no closing boundary');
    const part = partOf(body.subarray(position + 2, headersEnd).toString('latin1'), body.subarray(headersEnd + HEADER_END.length, next));
    if (!part.ok) return part;
    parts.push(part.value);
    position = next + CRLF.length;
  }
}

function partOf(headerText: string, content: Buffer): Result<FormPart> {
  const headers = new Map<string, string>();
  for (const line of headerText.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) return invalid('a multipart part header is malformed');
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const name = PART_NAME.exec(headers.get('content-disposition') ?? '')?.[1];
  if (name === undefined) return invalid('a multipart part has no form-data name');
  const contentType = headers.get('content-type');
  return ok({ name, content, ...(contentType === undefined ? {} : { contentType }) });
}

function invalid(message: string): Result<never> {
  return err(failure('invalid', message));
}
