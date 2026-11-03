import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { posix } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { failureResponse, type JsonResponse } from './http-exchange.js';

// The built SPA by its paths below the build root, such as
// `assets/index-abc.js`; the composition reads it once at start.
export interface WebAppFiles {
  file(path: string): Uint8Array | undefined;
  // True for an entry the build left out, such as a link, or a path below it.
  isLeftOut(path: string): boolean;
}

// What Vite's `html.cspNonce` writes into index.html (apps/web).
export const WEB_APP_NONCE_PLACEHOLDER = 'TASKELITH_CSP_NONCE';
export const WEB_APP_INDEX = 'index.html';
// The request log's operation of every SPA answer; no API operation has it.
export const WEB_APP_OPERATION = 'web-app';
export const WEB_APP_BASE = '/app';
// Vite's `build.assetsDir`, whose file names carry a content hash.
const HASHED_DIRECTORY = 'assets/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

// A file of the build with the headers of its path.
export interface WebAppFile {
  readonly status: 200;
  readonly content: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}

export type WebAppAnswer = WebAppFile | JsonResponse;

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
});

// GET or HEAD whose path, as sent and before URL normalization, is under
// /app/: the build's file, or index.html for a path without an extension.
export function webAppAnswer(files: WebAppFiles, method: string, requestPath: string): WebAppAnswer | undefined {
  if (!isWebAppPath(requestPath) || (method !== 'GET' && method !== 'HEAD')) return undefined;
  const path = buildPath(requestPath);
  if (!path.ok) return webAppFailure(path.error.code === 'invalid' ? 400 : 404, path.error);
  if (files.isLeftOut(path.value)) return webAppFailure(404, failure('not-found', 'the web app refuses this path'));
  if (path.value === WEB_APP_INDEX || posix.extname(path.value) === '') return indexPage(files);
  const content = files.file(path.value);
  return content === undefined ? noFile() : fileAnswer(path.value, content);
}

export function isWebAppPath(pathname: string): boolean {
  return pathname === WEB_APP_BASE || pathname.startsWith(`${WEB_APP_BASE}/`);
}

export function writeWebAppFile(response: ServerResponse, file: WebAppFile, correlationId: string): void {
  response.writeHead(file.status, { ...file.headers, 'content-length': file.content.byteLength, 'x-correlation-id': correlationId });
  response.end(file.content);
}

// The decoded path below /app/. A segment that is empty before the last,
// `.`, `..`, or holds a separator or NUL is refused, never looked up.
function buildPath(requestPath: string): Result<string> {
  let segments: string[];
  try {
    segments = requestPath.slice(WEB_APP_BASE.length + 1).split('/').map((segment) => decodeURIComponent(segment));
  } catch {
    return err(failure('invalid', 'the path is not valid percent-encoding'));
  }
  const refused = segments.some((segment, index) => (segment === '' && index < segments.length - 1)
    || segment === '.' || segment === '..' || /[/\\\0]/.test(segment));
  return refused ? err(failure('not-found', 'the web app refuses this path')) : ok(segments.join('/'));
}

// A fresh nonce per answer, so no earlier page's nonce admits a style.
function indexPage(files: WebAppFiles): WebAppAnswer {
  const index = files.file(WEB_APP_INDEX);
  if (index === undefined) return noFile();
  const nonce = randomBytes(16).toString('base64');
  const content = Buffer.from(Buffer.from(index).toString('utf8').replaceAll(WEB_APP_NONCE_PLACEHOLDER, nonce));
  return { status: 200, content, headers: { ...securityHeaders(nonce), 'content-type': CONTENT_TYPES['.html']!, 'cache-control': 'no-cache' } };
}

function fileAnswer(path: string, content: Uint8Array): WebAppFile {
  const contentType = CONTENT_TYPES[posix.extname(path)] ?? 'application/octet-stream';
  const cacheControl = path.startsWith(HASHED_DIRECTORY) ? IMMUTABLE : 'no-cache';
  return { status: 200, content, headers: { ...securityHeaders(undefined), 'content-type': contentType, 'cache-control': cacheControl } };
}

function noFile(): JsonResponse {
  return webAppFailure(404, failure('not-found', 'the web app has no file at this path'));
}

// The API's JSON failure, which keeps its no-store, with the SPA's headers.
function webAppFailure(status: number, failed: Failure): JsonResponse {
  return { ...failureResponse(status, failed), headers: securityHeaders(undefined) };
}

// Scripts only from the origin; Mantine's style elements carry the nonce.
function securityHeaders(nonce: string | undefined): Record<string, string> {
  const styles = nonce === undefined ? "'self'" : `'self' 'nonce-${nonce}'`;
  return {
    'content-security-policy': [
      "default-src 'none'", "script-src 'self'", `style-src ${styles}`, "img-src 'self'", "font-src 'self'",
      "connect-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
  };
}
