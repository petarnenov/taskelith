import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SECRET_PREFIXES } from '@taskelith/access';
import { ALLOWED_URLS, ISSUED_SECRET_PREFIXES, textProblems, WEB_DIST, webBundleProblems } from '../scripts/check-web-bundle.ts';

// Fixture secrets are assembled at run time, so no secret shape is tracked.
const BASE64 = 'A'.repeat(40);
const SECRET_FIXTURES: readonly [string, string][] = [
  ['PEM block', ['-----BEGIN', 'CERTIFICATE-----'].join(' ')],
  ['issued Taskelith secret', `${'tkop'}_${BASE64}`],
  ['NKey seed', `S${'U'}${'A'.repeat(56)}`],
  ['JSON Web Token', `${'eyJ'}hbGciOi.${'eyJ'}zdWIiOi.c2lnbmF0dXJl`],
  ['bearer credential', `${'Bearer'} ${BASE64}`],
  ['GitHub token', `${'ghp'}_${BASE64}`],
  ['provider API key', `${'sk'}-${BASE64}`],
  ['AWS access key', `${'AKIA'}${'A'.repeat(16)}`],
];

// Literals that only dev-server.ts or a web test holds, so a bundled copy of
// either leaves them in the dist; each must still occur in its source.
const DEVELOPMENT_ONLY_MARKERS: readonly [string, string][] = [
  ['dev-server.ts', 'https://127.0.0.1:8443'],
  ['dev-server.ts', 'TASKELITH_WEB_DEV_'],
  ['test/client.test.ts', 'csrf-fixture'],
  ['test/client.test.ts', 'fixture-password'],
  ['test/app.test.tsx', 'names the scaffold honestly'],
];
const SPA_FILE = /^(?:index\.html|assets\/index-[A-Za-z0-9_-]+\.(?:js|css))$/;

function distFiles(root: string): string[] {
  const entries = readdirSync(root, { recursive: true, encoding: 'utf8' });
  return entries.filter((entry) => statSync(join(root, entry)).isFile()).sort();
}

function dist(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-web-bundle-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test('the built web SPA holds no secret shape, environment value, or external origin', () => {
  assert.deepEqual(webBundleProblems(WEB_DIST), []);
});

test('the built web SPA holds neither dev-server.ts nor a web test', () => {
  assert.deepEqual(distFiles(WEB_DIST).filter((file) => !SPA_FILE.test(file)), []);
  const bundle = distFiles(WEB_DIST).map((file) => readFileSync(join(WEB_DIST, file), 'utf8')).join('\n');
  for (const [source, marker] of DEVELOPMENT_ONLY_MARKERS) {
    assert(readFileSync(join('apps/web', source), 'utf8').includes(marker), `${source} no longer holds ${marker}`);
    assert(!bundle.includes(marker), `the dist holds ${marker} of ${source}`);
  }
});

test('the issued-secret prefixes match the access module', () => {
  assert.deepEqual([...ISSUED_SECRET_PREFIXES].sort(), Object.values(SECRET_PREFIXES).sort());
});

for (const [shape, secret] of SECRET_FIXTURES) {
  test(`a ${shape} in the bundle fails the check`, () => {
    assert.deepEqual(textProblems('assets/index.js', `const x = "${secret}";`), [`assets/index.js: holds a ${shape}`]);
  });
}

test('an environment value left in the bundle fails the check', () => {
  assert.deepEqual(textProblems('assets/a.js', 'const e = import.meta.env;'), ['assets/a.js: holds an environment value (import\\.meta\\.env)']);
  assert.deepEqual(textProblems('assets/b.js', 'const k = "VITE_API_KEY";'), ['assets/b.js: holds an environment value (\\bVITE_[A-Z0-9_]+)']);
  assert.deepEqual(textProblems('assets/c.js', 'const e = {BASE_URL:"/app/",MODE:"production"};'), ['assets/c.js: holds an environment value (\\bBASE_URL\\b)']);
});

test('a font or other request to an external origin fails the check', () => {
  const css = '@font-face{src:url(https://fonts.gstatic.com/s/plex.woff2)}';
  assert.deepEqual(textProblems('assets/index.css', css), ['assets/index.css: references the external origin of https://fonts.gstatic.com/s/plex.woff2']);
  const html = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans">';
  assert.deepEqual(textProblems('index.html', html), ['index.html: references the external origin of https://fonts.googleapis.com/css2?family=IBM+Plex+Sans']);
  assert.deepEqual(textProblems('assets/a.js', 'fetch("//cdn.example.com/x.js")'), ['assets/a.js: references the external origin of //cdn.example.com/x.js']);
});

test('an IP, single-label, or userinfo origin fails the check', () => {
  const origins = ['https://127.0.0.1:8443/x', 'https://[::1]:8443/x', 'https://localhost:8443/x', 'https://user:pass@evil.example/x', '//10.0.0.1/x'];
  for (const url of origins) {
    assert.deepEqual(textProblems('assets/a.js', `fetch("${url}")`), [`assets/a.js: references the external origin of ${url}`]);
  }
});

test('a percent-encoded or Unicode host fails the check', () => {
  for (const url of ['https://%65vil.example/x', 'https://例え.テスト/x']) {
    assert.deepEqual(textProblems('assets/a.js', `fetch("${url}")`), [`assets/a.js: references the external origin of ${url}`]);
  }
});

test('an escaped URL fails the check as the browser decodes it', () => {
  const escaped: readonly [string, string][] = [
    ['index.html', '<link href="https:&#47;&#47;fonts.googleapis.com/css">'],
    ['index.html', '<link href="https&colon;&sol;&sol;fonts.googleapis.com/css">'],
    ['index.html', '<link href="https:&#x2F;&#x2f;fonts.googleapis.com/css">'],
    ['assets/a.js', 'fetch("https:\\/\\/fonts.googleapis.com/css")'],
    ['assets/a.js', 'fetch("https:\\u002f\\x2Ffonts.googleapis.com/css")'],
    ['assets/a.js', 'fetch("https:\\u{2f}\\u{2F}fonts.googleapis.com/css")'],
    ['assets/index.css', '@import url("https:\\2f \\00002Ffonts.googleapis.com/css")'],
  ];
  for (const [name, text] of escaped) {
    assert.deepEqual(textProblems(name, text), [`${name}: references the external origin of https://fonts.googleapis.com/css`], text);
  }
});

test('only the listed namespace names and error links pass, and only in scripts', () => {
  assert.deepEqual(textProblems('assets/a.js', 'ns="http://www.w3.org/2000/svg";u=`https://react.dev/errors/`+e'), []);
  assert.deepEqual(textProblems('assets/a.js', 'fetch("https://react.dev/errors/x")'), ['assets/a.js: references the external origin of https://react.dev/errors/x']);
  assert.deepEqual(textProblems('index.html', '<svg xmlns="http://www.w3.org/2000/svg">'), ['index.html: references the external origin of http://www.w3.org/2000/svg']);
});

test('every allowed URL is an exact string with a one-line reason', () => {
  for (const [url, reason] of ALLOWED_URLS) {
    assert.match(url, /^https?:\/\/\S+$/);
    assert.match(reason, /^[^\n]{20,}\.$/);
    assert.deepEqual(textProblems('assets/a.js', `u="${url}"`), []);
    for (const variant of [`${url}x`, url.slice(0, -1)]) {
      assert.deepEqual(textProblems('assets/a.js', `u="${variant}"`), [`assets/a.js: references the external origin of ${variant}`]);
    }
  }
});

test('the check reads every file of the dist and refuses a missing build or an unexpected file', () => {
  const root = dist({ 'index.html': '<div id="root"></div>', 'assets/index.js': `"${SECRET_FIXTURES[5]![1]}"`, 'assets/font.woff2': '' });
  try {
    assert.deepEqual(webBundleProblems(root), ['assets/font.woff2: unexpected file type', 'assets/index.js: holds a GitHub token']);
    assert.deepEqual(webBundleProblems(join(root, 'missing')), [`${join(root, 'missing')} does not exist; build the web SPA first`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
