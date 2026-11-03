import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import {
  ROUTES,
  WEB_APP_DIR_VARIABLE,
  WEB_APP_NONCE_PLACEHOLDER,
  WEB_APP_OPERATION,
  createApiServer,
  readWebAppDirectory,
  type ApiHandlers,
  type RouteDefinition,
  type WebAppFiles,
} from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, value } from '@taskelith/testing';

// A build beside a secret file that no answer may hold.
const root = mkdtempSync(join(tmpdir(), 'taskelith-web-app-'));
const build = join(root, 'dist');
const SECRET = 'secret-beside-the-build';
const INDEX = `<!doctype html><meta property="csp-nonce" nonce="${WEB_APP_NONCE_PLACEHOLDER}"><div id="root"></div>`;
const SCRIPT = 'console.log("app");';
mkdirSync(join(build, 'assets'), { recursive: true });
writeFileSync(join(root, 'secret.txt'), SECRET);
writeFileSync(join(build, 'index.html'), INDEX);
writeFileSync(join(build, 'assets', 'index-AbC123.js'), SCRIPT);
writeFileSync(join(build, 'assets', 'index-AbC123.css'), 'body{}');
writeFileSync(join(build, 'favicon.svg'), '<svg/>');
symlinkSync(join(root, 'secret.txt'), join(build, 'assets', 'leak.js'));
symlinkSync(root, join(build, 'outside'));
symlinkSync(join(root, 'secret.txt'), join(build, 'leak'));

// A public operation moved under /app/, so the test shows that routes come
// first; the access rules know it by its operation.
const PROBE: RouteDefinition = {
  operationId: 'readInstallationCa', method: 'GET', pattern: /^\/app\/probe$/, security: ['none'], response: 'empty', success: 204, statuses: {},
};
const handlers: ApiHandlers = {
  authenticateOperator: async () => err(failure('forbidden', 'none')),
  authenticateWorker: async () => err(failure('forbidden', 'none')),
  authenticateSession: async () => err(failure('forbidden', 'none')),
  authorize: async () => ok(undefined),
  authorizeResource: async () => ok(undefined),
  handle: async (operationId) => (operationId === PROBE.operationId ? ok(undefined) : err(failure('internal', 'unset'))),
};
const sink = new InMemoryLogSink();
const server = createApiServer(handlers, {
  routes: [...ROUTES, PROBE], webApp: value(readWebAppDirectory(build)), logger: new Logger(sink, { now: () => '2026-11-03T09:00:00.000Z' as never }),
});
const bare = createApiServer(handlers, { routes: [...ROUTES, PROBE] });
// The paths that the build is asked for, so a test can show no lookup.
const lookups: string[] = [];
const files = value(readWebAppDirectory(build));
const spiedFiles: WebAppFiles = {
  file: (path) => {
    lookups.push(path);
    return files.file(path);
  },
  isLeftOut: (path) => files.isLeftOut(path),
};
const spied = createApiServer(handlers, { routes: ROUTES, webApp: spiedFiles });
let base: string;
let bareBase: string;
let spiedBase: string;

before(async () => {
  base = await listen(server);
  bareBase = await listen(bare);
  spiedBase = await listen(spied);
});
after(async () => {
  await Promise.all([server, bare, spied].map((each) => new Promise<void>((resolve) => each.close(() => resolve()))));
  rmSync(root, { recursive: true, force: true });
});

async function listen(each: typeof server): Promise<string> {
  await new Promise<void>((resolve) => each.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(each.address() as AddressInfo).port}`;
}

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

// The raw path, sent as is: fetch would remove dot segments first.
function send(path: string, method = 'GET', origin = base): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(`${origin}/`, { method, path }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function nonceOf(answer: Answer): string {
  const policy = String(answer.headers['content-security-policy']);
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1];
  assert.ok(nonce, policy);
  return nonce;
}

test('every path without a file extension under /app/ answers index.html with a fresh nonce', async () => {
  const nonces = new Set<string>();
  for (const path of ['/app', '/app/', '/app/sessions', '/app/sessions/', '/app/index.html', '/app/no/such/screen']) {
    const answer = await send(path);
    assert.equal(answer.status, 200, path);
    assert.equal(answer.headers['content-type'], 'text/html; charset=utf-8', path);
    assert.equal(answer.headers['cache-control'], 'no-cache', path);
    const nonce = nonceOf(answer);
    assert.equal(answer.body, INDEX.replace(WEB_APP_NONCE_PLACEHOLDER, nonce), path);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 6, 'no two answers share a nonce');
});

test('a hashed asset is immutable for a year, and any other file is revalidated', async () => {
  const script = await send('/app/assets/index-AbC123.js');
  assert.deepEqual([script.status, script.body, script.headers['content-type']], [200, SCRIPT, 'text/javascript; charset=utf-8']);
  assert.equal(script.headers['cache-control'], 'public, max-age=31536000, immutable');
  const style = await send('/app/assets/index-AbC123.css');
  assert.deepEqual([style.status, style.headers['content-type']], [200, 'text/css; charset=utf-8']);
  const icon = await send('/app/favicon.svg');
  assert.deepEqual([icon.status, icon.headers['content-type'], icon.headers['cache-control']], [200, 'image/svg+xml', 'no-cache']);
});

test('the page and its files carry the content security policy and the related headers', async () => {
  const page = await send('/app/');
  const nonce = nonceOf(page);
  assert.equal(page.headers['content-security-policy'], [
    "default-src 'none'", "script-src 'self'", `style-src 'self' 'nonce-${nonce}'`, "img-src 'self'", "font-src 'self'",
    "connect-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  assert.doesNotMatch(String(page.headers['content-security-policy']), /unsafe-inline|unsafe-eval/);
  const script = await send('/app/assets/index-AbC123.js');
  assert.match(String(script.headers['content-security-policy']), /style-src 'self'; /);
  for (const answer of [page, script]) {
    assert.deepEqual([
      answer.headers['x-content-type-options'], answer.headers['referrer-policy'], answer.headers['x-frame-options'],
      answer.headers['cross-origin-opener-policy'], answer.headers['cross-origin-resource-policy'], answer.headers.connection,
    ], ['nosniff', 'no-referrer', 'DENY', 'same-origin', 'same-origin', 'close']);
  }
});

test('a missing file with an extension is a 404, never the page', async () => {
  for (const path of ['/app/assets/index-missing.js', '/app/assets/index-AbC123.js.map', '/app/robots.txt']) {
    const answer = await send(path);
    assert.equal(answer.status, 404, path);
    assert.equal(answer.headers['content-type'], 'application/json', path);
    assert.equal((JSON.parse(answer.body) as { code: string }).code, 'not-found', path);
  }
});

test('no API path is shadowed: routes come first, and paths outside /app/ never get the page', async () => {
  assert.equal((await send('/app/probe')).status, 204);
  const session = await send('/session', 'POST');
  assert.deepEqual([session.status, session.headers['content-type']], [401, 'application/json'], 'logIn still checks the session');
  for (const path of ['/', '/apps', '/application', '/runs/x', '/no-such-operation']) {
    const answer = await send(path);
    assert.equal(answer.status, 404, path);
    assert.equal(answer.headers['content-type'], 'application/json', path);
  }
  for (const method of ['POST', 'DELETE']) {
    const answer = await send('/app/', method);
    assert.deepEqual([answer.status, answer.headers['content-type']], [404, 'application/json'], method);
  }
});

test('no operation of the control-plane document lives under /app, which the wire contracts reserve', () => {
  const contract = readFileSync('docs/contracts/control-plane-wire-contracts.md', 'utf8');
  assert.match(contract, /^The path `\/app` and every path below `\/app\/` are reserved for the built SPA/m);
  const document = JSON.parse(readFileSync('packages/contracts/documents/control-plane.openapi.json', 'utf8')) as { paths: Record<string, unknown> };
  const shadowed = Object.keys(document.paths).filter((path) => path === '/app' || path.startsWith('/app/'));
  assert.deepEqual(shadowed, []);
});

test('a path that leaves the build is refused and never answers a file outside it', async () => {
  const paths = [
    '/app/../secret.txt', '/app/%2e%2e/secret.txt', '/app/..%2Fsecret.txt', '/app/assets/..%2F..%2Fsecret.txt',
    '/app/assets/%2E%2E%2F%2E%2E%2Fsecret.txt', '/app/..%5Csecret.txt', '/app/assets%5C..%5C..%5Csecret.txt',
    '/app/assets/leak.js', '/app/outside/secret.txt', '/app//secret.txt', '/app/./secret.txt', '/app/secret.txt%00.js',
    '/app/..%2Foutside', '/app/assets/..%2F..%2Fsecret', '/app/.%2Fboard', '/app/a%5Cb', '/app//board', '/app/board%00',
  ];
  for (const path of paths) {
    const answer = await send(path);
    assert.equal(answer.status, 404, path);
    assert.doesNotMatch(answer.body, new RegExp(SECRET), path);
    assert.doesNotMatch(answer.body, /csp-nonce/, `${path} answers no page`);
  }
});

test('a dot segment that the URL would remove is refused before any lookup', async () => {
  const paths = [
    '/app/%2e/sessions', '/app/./sessions', '/app/assets/../assets/index-AbC123.js', '/app/assets/%2E%2E/assets/index-AbC123.js',
    '/app/assets/./index-AbC123.js', '/app/sessions/..', '/app/assets\\index-AbC123.js',
  ];
  for (const path of paths) {
    lookups.length = 0;
    const answer = await send(path, 'GET', spiedBase);
    assert.equal(answer.status, 404, path);
    assert.doesNotMatch(answer.body, /csp-nonce|console\.log/, `${path} answers neither the page nor the asset`);
    assert.deepEqual(lookups, [], `${path} looks nothing up`);
  }
});

test('a link of the build without an extension, and every path below a link, is a 404, never the page', async () => {
  for (const path of ['/app/leak', '/app/outside', '/app/outside/', '/app/outside/sessions', '/app/outside/dist/assets']) {
    const answer = await send(path);
    assert.equal(answer.status, 404, path);
    assert.doesNotMatch(answer.body, new RegExp(SECRET), path);
    assert.doesNotMatch(answer.body, /csp-nonce/, `${path} answers no page`);
  }
});

test('every failure of the web app carries the security headers and stays JSON and no-store', async () => {
  const paths = ['/app/assets/index-missing.js', '/app/..%2Fsecret.txt', '/app/outside', '/app/%zz', '/app/%E0%A4%A'];
  for (const method of ['GET', 'HEAD']) {
    for (const path of paths) {
      const answer = await send(path, method);
      assert.ok(answer.status === 400 || answer.status === 404, `${method} ${path}`);
      assert.deepEqual([
        answer.headers['content-type'], answer.headers['cache-control'], answer.headers['x-content-type-options'],
        answer.headers['referrer-policy'], answer.headers['x-frame-options'], answer.headers['cross-origin-opener-policy'],
        answer.headers['cross-origin-resource-policy'],
      ], ['application/json', 'no-store', 'nosniff', 'no-referrer', 'DENY', 'same-origin', 'same-origin'], `${method} ${path}`);
      assert.match(String(answer.headers['content-security-policy']), /^default-src 'none'; script-src 'self'; style-src 'self'; /, `${method} ${path}`);
    }
  }
});

test('a path that is not valid percent-encoding is a 400', async () => {
  const answer = await send('/app/%E0%A4%A');
  assert.deepEqual([answer.status, (JSON.parse(answer.body) as { code: string }).code], [400, 'invalid']);
});

test('HEAD answers the headers of GET without a body', async () => {
  const head = await send('/app/assets/index-AbC123.js', 'HEAD');
  assert.deepEqual([head.status, head.body, head.headers['content-length']], [200, '', String(SCRIPT.length)]);
  assert.equal(head.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('without a build, /app/ is a 404 like any path without an operation', async () => {
  for (const path of ['/app/', '/app/assets/index-AbC123.js']) {
    const answer = await send(path, 'GET', bareBase);
    assert.deepEqual([answer.status, answer.headers['content-type']], [404, 'application/json'], path);
  }
  assert.equal((await send('/app/probe', 'GET', bareBase)).status, 204);
});

test('a directory without index.html or that cannot be read fails and names the variable', () => {
  const empty = join(root, 'empty');
  mkdirSync(empty);
  for (const directory of [empty, join(root, 'missing'), join(root, 'secret.txt')]) {
    const failure = failed(readWebAppDirectory(directory));
    assert.deepEqual([failure.code, failure.details.variable], ['precondition-failed', WEB_APP_DIR_VARIABLE], directory);
    assert.match(failure.message, new RegExp(WEB_APP_DIR_VARIABLE));
  }
});

test('the request log names the web app as the operation and holds no path', async () => {
  await send('/app/assets/index-AbC123.js?token=abc');
  const line = sink.records.filter((record) => record.event === 'api.request').at(-1);
  assert.equal(line?.fields.operationId, WEB_APP_OPERATION);
  assert.doesNotMatch(JSON.stringify(line), /index-AbC123|token|abc/);
});

// A fresh build with one asset, and the file and directory outside it that
// a replaced entry would point to.
function replaceableBuild(): { build: string; outside: string } {
  const each = mkdtempSync(join(root, 'replaced-'));
  const fresh = join(each, 'dist');
  mkdirSync(join(fresh, 'assets'), { recursive: true });
  writeFileSync(join(fresh, 'index.html'), INDEX);
  writeFileSync(join(fresh, 'assets', 'index-AbC123.js'), SCRIPT);
  const outside = join(each, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'index-AbC123.js'), SECRET);
  return { build: fresh, outside };
}

function assertChanged(read: ReturnType<typeof readWebAppDirectory>): void {
  const refused = failed(read);
  assert.deepEqual([refused.code, refused.details.variable], ['precondition-failed', WEB_APP_DIR_VARIABLE]);
  assert.match(refused.message, /stays unchanged while it is read/);
}

test('a file replaced by a link after the directory listed it fails the read', () => {
  const { build: fresh, outside } = replaceableBuild();
  const asset = join(fresh, 'assets', 'index-AbC123.js');
  assertChanged(readWebAppDirectory(fresh, (path) => {
    if (path !== 'assets/index-AbC123.js') return;
    rmSync(asset);
    symlinkSync(join(outside, 'index-AbC123.js'), asset);
  }));
});

test('a directory replaced by a link after the listing fails the read', () => {
  const { build: fresh, outside } = replaceableBuild();
  assertChanged(readWebAppDirectory(fresh, (path) => {
    if (path !== 'assets') return;
    renameSync(join(fresh, 'assets'), join(fresh, '..', 'kept'));
    symlinkSync(outside, join(fresh, 'assets'));
  }));
});

test('a directory replaced by a link while its files are read fails the read', () => {
  const { build: fresh, outside } = replaceableBuild();
  assertChanged(readWebAppDirectory(fresh, (path) => {
    if (path !== 'assets/index-AbC123.js') return;
    renameSync(join(fresh, 'assets'), join(fresh, '..', 'kept'));
    symlinkSync(outside, join(fresh, 'assets'));
  }));
});

test('a build root that is a symbolic link fails the read and names the variable', () => {
  const { build: fresh } = replaceableBuild();
  const linked = join(fresh, '..', 'linked');
  symlinkSync(fresh, linked);
  const refused = failed(readWebAppDirectory(linked));
  assert.deepEqual([refused.code, refused.details.variable], ['precondition-failed', WEB_APP_DIR_VARIABLE]);
  assert.match(refused.message, /not a symbolic link/);
});
