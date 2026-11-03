import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { posix } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { failureResponse, type JsonResponse } from './http-exchange.js';

// The built SPA by its paths below the build root, such as
// `assets/index-abc.js`; the composition reads it once at start.
export interface WebAppFiles {
  file(path: string): Uint8Array | undefined;
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
export interface WebAppPage {
  readonly status: 200;
  readonly page: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}

export type WebAppAnswer = WebAppPage | JsonResponse;

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

// GET or HEAD under /app/: the build's file at the path, or index.html for
// a path without a file extension; undefined for any other request.
export function webAppAnswer(files: WebAppFiles, method: string, pathname: string): WebAppAnswer | undefined {
  if (!isWebAppPath(pathname) || (method !== 'GET' && method !== 'HEAD')) return undefined;
  const path = buildPath(pathname);
  if (!path.ok) return failureResponse(path.error.code === 'invalid' ? 400 : 404, path.error);
  if (path.value === WEB_APP_INDEX || posix.extname(path.value) === '') return indexPage(files);
  const content = files.file(path.value);
  return content === undefined ? noFile() : filePage(path.value, content);
}

export function isWebAppPath(pathname: string): boolean {
  return pathname === WEB_APP_BASE || pathname.startsWith(`${WEB_APP_BASE}/`);
}

export function writeWebAppPage(response: ServerResponse, page: WebAppPage, correlationId: string): void {
  response.writeHead(page.status, { ...page.headers, 'content-length': page.page.byteLength, 'x-correlation-id': correlationId });
  response.end(page.page);
}

// The decoded path below /app/. A segment that is empty before the last,
// `.`, `..`, or holds a separator or NUL is refused, never looked up.
function buildPath(pathname: string): Result<string> {
  let segments: string[];
  try {
    segments = pathname.slice(WEB_APP_BASE.length + 1).split('/').map((segment) => decodeURIComponent(segment));
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
  const page = Buffer.from(Buffer.from(index).toString('utf8').replaceAll(WEB_APP_NONCE_PLACEHOLDER, nonce));
  return { status: 200, page, headers: { ...pageHeaders(nonce), 'content-type': CONTENT_TYPES['.html']!, 'cache-control': 'no-cache' } };
}

function filePage(path: string, content: Uint8Array): WebAppPage {
  const contentType = CONTENT_TYPES[posix.extname(path)] ?? 'application/octet-stream';
  const cacheControl = path.startsWith(HASHED_DIRECTORY) ? IMMUTABLE : 'no-cache';
  return { status: 200, page: content, headers: { ...pageHeaders(undefined), 'content-type': contentType, 'cache-control': cacheControl } };
}

function noFile(): JsonResponse {
  return failureResponse(404, failure('not-found', 'the web app has no file at this path'));
}

// Scripts only from the origin; Mantine's style elements carry the nonce.
function pageHeaders(nonce: string | undefined): Record<string, string> {
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
