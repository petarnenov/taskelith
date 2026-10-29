import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SECRET_PREFIXES } from '@taskelith/access';
import { ISSUED_SECRET_PREFIXES, textProblems, WEB_DIST, webBundleProblems } from '../scripts/check-web-bundle.ts';

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

test('only the listed namespace names and error links pass, and only in scripts', () => {
  assert.deepEqual(textProblems('assets/a.js', 'ns="http://www.w3.org/2000/svg";u=`https://react.dev/errors/`+e'), []);
  assert.deepEqual(textProblems('assets/a.js', 'fetch("https://react.dev/errors/x")'), ['assets/a.js: references the external origin of https://react.dev/errors/x']);
  assert.deepEqual(textProblems('index.html', '<svg xmlns="http://www.w3.org/2000/svg">'), ['index.html: references the external origin of http://www.w3.org/2000/svg']);
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
