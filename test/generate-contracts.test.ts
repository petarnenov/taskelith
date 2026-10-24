import assert from 'node:assert/strict';
import test from 'node:test';
import type { Diagnostic } from '@asyncapi/parser';
import { blockingDiagnostics, namedTypesSchema, schemaBundle } from '../scripts/generate-contracts.ts';

function diagnostic(severity: number, message: string): Diagnostic {
  return { severity, message, path: ['info'], code: 'example', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } } as Diagnostic;
}

test('errors and warnings of the AsyncAPI parser block generation, information and hints do not', () => {
  const diagnostics = [diagnostic(0, 'error'), diagnostic(1, 'warning'), diagnostic(2, 'newer version'), diagnostic(3, 'hint')];

  assert.deepEqual(blockingDiagnostics(diagnostics), ['info: error', 'info: warning']);
});

test('a schema bundle points the component references at its own definitions', () => {
  const schemas = { Run: { type: 'object', properties: { id: { $ref: '#/components/schemas/Identifier' } } }, Identifier: { type: 'string' } };

  assert.deepEqual(schemaBundle('taskelith:test', '$defs', schemas), {
    $id: 'taskelith:test',
    $defs: { Run: { type: 'object', properties: { id: { $ref: '#/$defs/Identifier' } } }, Identifier: { type: 'string' } },
  });
});

test('the named types schema requires one property per definition', () => {
  const schema = namedTypesSchema('Names', { Identifier: { type: 'string' }, Run: { type: 'object' } });

  assert.deepEqual(schema.required, ['Identifier', 'Run']);
  assert.deepEqual(schema.properties, { Identifier: { $ref: '#/definitions/Identifier' }, Run: { $ref: '#/definitions/Run' } });
});
