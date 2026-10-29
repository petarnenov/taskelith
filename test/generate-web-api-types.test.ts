import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { OpenAPI3 } from 'openapi-typescript';
import { CONTROL_PLANE_DOCUMENT, staleWebApiTypes, WEB_API_TYPES, webApiTypes } from '../scripts/generate-web-api-types.ts';

function copyOf(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-web-api-types-'));
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    cpSync(file, join(root, file));
  }
  return root;
}

test('the committed web API types match the control-plane document', async () => {
  assert.equal(await staleWebApiTypes(process.cwd()), false);
});

test('a document change makes the committed types stale', async () => {
  const root = copyOf([CONTROL_PLANE_DOCUMENT, WEB_API_TYPES]);
  try {
    const document = JSON.parse(readFileSync(join(root, CONTROL_PLANE_DOCUMENT), 'utf8'));
    document.paths['/added'] = { get: { operationId: 'added', responses: { 204: { description: 'Nothing.' } } } };
    writeFileSync(join(root, CONTROL_PLANE_DOCUMENT), JSON.stringify(document));
    assert.equal(await staleWebApiTypes(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing committed types are stale', async () => {
  const root = copyOf([CONTROL_PLANE_DOCUMENT]);
  try {
    assert.equal(await staleWebApiTypes(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the types hold the control-plane paths only and no description comments', async () => {
  const document = JSON.parse(readFileSync(CONTROL_PLANE_DOCUMENT, 'utf8')) as OpenAPI3 & { paths: Record<string, unknown> };
  const types = await webApiTypes(document);
  const typedPaths = [...types.matchAll(/^ {4}"(\/[^"]*)": \{$/gm)].map((match) => match[1]);
  assert.deepEqual(typedPaths, Object.keys(document.paths));
  assert.doesNotMatch(types, /^\s*\/\*/m);
  assert.equal(types.split('\n').filter((line) => line.trimStart().startsWith('//')).length, 1);
});
