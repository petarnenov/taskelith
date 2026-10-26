import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MERGE_METHODS } from '@taskelith/integrations';
import * as portEntry from '@taskelith/integrations/port';

// The compiled modules the port entry loads, following relative imports.
function portEntryModules(): string[] {
  const dist = new URL('../dist/', import.meta.url);
  const loaded = new Set<string>();
  const visit = (path: string) => {
    if (loaded.has(path)) return;
    loaded.add(path);
    const source = readFileSync(new URL(path, dist), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:^import\s*|\bfrom\s*)['"]([^'"]+)['"]/gm)) {
      assert.ok(specifier!.startsWith('./'), `${path} loads ${specifier}`);
      visit(new URL(specifier!, new URL(path, dist)).href.slice(dist.href.length));
    }
  };
  visit('port.js');
  return [...loaded].sort();
}

test('the port entry loads only the source control port', () => {
  assert.deepEqual(portEntryModules(), ['port.js', 'ports/source-control.js']);
});

test('the port entry carries only the port constants, at version 0.1.0', () => {
  assert.deepEqual(Object.keys(portEntry).sort(), [
    'CHANGE_REQUEST_STATES',
    'COMMIT_STATUS_STATES',
    'MERGE_METHODS',
    'REVIEW_EVIDENCE_KINDS',
    'SCM_PERMISSIONS',
    'SOURCE_CONTROL_PORT_VERSION',
    'WEBHOOK_EVENT_KINDS',
  ]);
  assert.equal(portEntry.SOURCE_CONTROL_PORT_VERSION, '0.1.0');
  assert.equal(portEntry.MERGE_METHODS, MERGE_METHODS);
});
