import assert from 'node:assert/strict';
import test from 'node:test';
import type { Diagnostic } from '@asyncapi/parser';
import {
  blockingDiagnostics,
  CONTRACT_DOCUMENTS,
  mergeOpenapi,
  mergeSchemas,
  mergeSecuritySchemes,
  namedTypesSchema,
  schemaBundle,
} from '../scripts/generate-contracts.ts';

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

test('documents may share a schema name only for the same schema', () => {
  const identifier = { type: 'string', minLength: 1 };

  assert.deepEqual(mergeSchemas([{ path: 'a.json', schemas: { Identifier: identifier } }, { path: 'b.json', schemas: { Identifier: { ...identifier }, Run: { type: 'object' } } }]), {
    Identifier: identifier,
    Run: { type: 'object' },
  });
  assert.throws(
    () => mergeSchemas([{ path: 'a.openapi.json', schemas: { Identifier: identifier } }, { path: 'b.asyncapi.json', schemas: { Identifier: { type: 'string' } } }]),
    /The schema Identifier of b.asyncapi.json differs from the one of a.openapi.json/,
  );
});

test('OpenAPI documents are joined for the type generator, and a path is defined once', () => {
  const runs = { path: 'runs.json', document: { paths: { '/runs': { get: {} } }, components: { schemas: { Run: { type: 'object' } } } } };
  const evidence = {
    path: 'evidence.json',
    document: { paths: { '/evidence': { post: {} } }, components: { schemas: {}, securitySchemes: { worker: { type: 'http', scheme: 'bearer' } } } },
  };

  const merged = mergeOpenapi([runs, evidence]);

  assert.deepEqual(Object.keys(merged.paths), ['/runs', '/evidence']);
  assert.deepEqual(merged.components, { schemas: { Run: { type: 'object' } }, securitySchemes: { worker: { type: 'http', scheme: 'bearer' } } });
  assert.throws(() => mergeOpenapi([runs, { ...runs, path: 'other.json' }]), /The path \/runs of other.json is defined by another document/);
});

test('documents may share a security scheme name only for the same scheme', () => {
  const operator = { type: 'http', scheme: 'bearer', description: 'The installation bootstrap credential.' };
  const document = (path: string, securitySchemes: Record<string, unknown>) => ({ path, document: { paths: {}, components: { schemas: {}, securitySchemes } } });
  const session = { type: 'apiKey', in: 'cookie', name: 'session' };

  assert.deepEqual(mergeSecuritySchemes([document('a.json', { operatorToken: operator }), document('b.json', { operatorToken: { ...operator }, session })]), {
    operatorToken: operator,
    session,
  });
  assert.throws(
    () => mergeSecuritySchemes([document('a.json', { operatorToken: operator }), document('b.json', { operatorToken: { ...operator, scheme: 'basic' } })]),
    /The security scheme operatorToken of b.json differs from the one of a.json/,
  );
  assert.throws(
    () => mergeOpenapi([document('a.json', { operatorToken: operator }), document('c.json', { operatorToken: session })]),
    /The security scheme operatorToken of c.json differs from the one of a.json/,
  );
});

test('the control-plane document is generated with the other contract documents', () => {
  assert.ok(CONTRACT_DOCUMENTS.some(({ kind, path }) => kind === 'openapi' && path === 'packages/contracts/documents/control-plane.openapi.json'));
});
