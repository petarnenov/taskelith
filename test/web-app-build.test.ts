import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { WEB_APP_NONCE_PLACEHOLDER, readWebAppDirectory } from '@taskelith/control-plane';
import { value } from '@taskelith/testing';
import { WEB_DIST } from '../scripts/check-web-bundle.ts';

// The SPA that npm run build made, as the control plane serves it.
const index = readFileSync(join(WEB_DIST, 'index.html'), 'utf8');

test('the built page names the nonce placeholder that the control plane replaces', () => {
  assert.ok(index.includes(`<meta property="csp-nonce" nonce="${WEB_APP_NONCE_PLACEHOLDER}">`), index);
});

test('the built page has no inline script or style, only hashed files of the build', () => {
  const files = value(readWebAppDirectory(WEB_DIST));
  const scripts = [...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  for (const [, attributes, body] of scripts) assert.deepEqual([/\bsrc="/.test(attributes ?? ''), body], [true, ''], attributes);
  assert.doesNotMatch(index, /<style\b|\sstyle="|\son[a-z]+="/i);
  const references = [...index.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(([, reference]) => reference ?? '');
  assert.ok(references.length >= 2, references.join(' '));
  for (const reference of references) {
    assert.match(reference, /^\/app\/assets\/[^/]+$/, reference);
    assert.ok(files.file(reference.slice('/app/'.length)), `${reference} is in the build`);
  }
});
