import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkHttpSchema, type HttpComponents, type HttpOperations, type SchemaViolations } from '@taskelith/contracts';
import { SPEC_APPROVERS } from '@taskelith/execution';
import { WORKER_ADMISSION_STATES } from '@taskelith/fleet';
import { MERGE_METHODS } from '@taskelith/integrations/port';
import type { Result } from '@taskelith/kernel';
import { COOLDOWN_SOURCES, SLOT_HEALTH, SLOT_STATES } from '@taskelith/scheduling';

type Json = Record<string, unknown>;
type SecurityRequirement = Record<string, string[]>;

interface Operation {
  readonly operationId: string;
  readonly security: SecurityRequirement[];
  readonly parameters?: { readonly name: string; readonly in: string }[];
  readonly requestBody?: { readonly content: Record<string, { schema?: Json }> };
  readonly responses: Record<string, { headers?: Record<string, Json>; content?: Record<string, { schema: Json }> }>;
}

interface Document {
  readonly openapi: string;
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, Json>; readonly securitySchemes: Record<string, Json> };
}

function document(name: string): Document {
  return JSON.parse(readFileSync(new URL(`../documents/${name}`, import.meta.url), 'utf8'));
}

function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

const CONTROL_PLANE = document('control-plane.openapi.json');
const SCHEMAS = CONTROL_PLANE.components.schemas;
const WEBHOOK = 'receiveScmWebhook';
const AT = '2026-10-28T10:00:00.000Z';
const CSRF = 'A'.repeat(43);

const OPERATIONS = Object.values(CONTROL_PLANE.paths).flatMap((item) =>
  Object.entries(item).map(([method, operation]) => ({ method, ...operation })),
);

function operation(id: string): Operation & { method: string } {
  const found = OPERATIONS.find((candidate) => candidate.operationId === id);
  assert.ok(found, id);
  return found;
}

function referencesIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(referencesIn);
  if (node === null || typeof node !== 'object') return [];
  const own = typeof (node as Json).$ref === 'string' ? [(node as Json).$ref as string] : [];
  return [...own, ...Object.values(node).flatMap(referencesIn)];
}

// Every schema a node reaches, following component references.
function reachable(node: unknown, seen = new Set<string>()): unknown[] {
  const nodes: unknown[] = [node];
  for (const reference of referencesIn(node)) {
    const name = reference.replace('#/components/schemas/', '');
    if (seen.has(name)) continue;
    seen.add(name);
    nodes.push(...reachable(SCHEMAS[name], seen));
  }
  return nodes;
}

function holdsKey(node: unknown, key: string, value: unknown): boolean {
  if (Array.isArray(node)) return node.some((item) => holdsKey(item, key, value));
  if (node === null || typeof node !== 'object') return false;
  return (node as Json)[key] === value || Object.values(node).some((item) => holdsKey(item, key, value));
}

function responseSchemas(candidate: Operation): unknown[] {
  return Object.values(candidate.responses).flatMap((response) => Object.values(response.content ?? {}).map(({ schema }) => schema));
}

test('the control-plane document is OpenAPI 3.1.0 at version 0.1.0 and every reference resolves', () => {
  assert.equal(CONTROL_PLANE.openapi, '3.1.0');
  assert.equal(CONTROL_PLANE.info.version, '0.1.0');
  for (const reference of referencesIn(CONTROL_PLANE)) {
    assert.match(reference, /^#\/components\/schemas\//);
    assert.ok(reference.replace('#/components/schemas/', '') in SCHEMAS, reference);
  }
  const others = ['sdlc.openapi.json', 'execution.openapi.json'].flatMap((name) =>
    Object.values(document(name).paths).flatMap((item) => Object.values(item).map(({ operationId }) => operationId)));
  const ids = [...others, ...OPERATIONS.map(({ operationId }) => operationId)];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(OPERATIONS.length, 34);
});

test('every security requirement names a scheme of the document', () => {
  const schemes = Object.keys(CONTROL_PLANE.components.securitySchemes);

  assert.deepEqual(schemes, ['browserSession', 'csrfToken', 'operatorToken']);
  for (const { operationId, security } of OPERATIONS) {
    for (const requirement of security) assert.ok(Object.keys(requirement).every((name) => schemes.includes(name)), operationId);
  }
});

test('the operator credential is the scheme that the other documents define', () => {
  const { operatorToken } = CONTROL_PLANE.components.securitySchemes;

  assert.deepEqual(operatorToken, document('execution.openapi.json').components.securitySchemes.operatorToken);
  assert.deepEqual(operatorToken, document('sdlc.openapi.json').components.securitySchemes.operatorToken);
});

test('every operation other than GET requires the CSRF header with the session cookie', () => {
  const mutations = OPERATIONS.filter(({ method, operationId }) => method !== 'get' && operationId !== WEBHOOK);

  assert.ok(mutations.length > 0);
  for (const { operationId, security } of mutations) {
    assert.ok(security.length > 0, operationId);
    for (const requirement of security) {
      const names = Object.keys(requirement).sort();
      assert.ok(
        JSON.stringify(names) === '["browserSession","csrfToken"]' || JSON.stringify(names) === '["operatorToken"]',
        `${operationId}: ${names.join(', ')}`,
      );
    }
  }
});

test('every mutation but the session operations also accepts the operator bearer alone', () => {
  const mutations = OPERATIONS.filter(({ method, operationId }) => method !== 'get' && operationId !== WEBHOOK);
  const bearer = mutations.filter(({ security }) => security.some((requirement) => 'operatorToken' in requirement));

  assert.deepEqual(mutations.filter((candidate) => !bearer.includes(candidate)).map(({ operationId }) => operationId).sort(), ['logIn', 'logOut']);
});

test('only reading the session is allowed without a credential, apart from the webhook receiver', () => {
  const anonymous = OPERATIONS.filter(({ security }) => security.length === 0 || security.some((requirement) => Object.keys(requirement).length === 0));

  assert.deepEqual(anonymous.map(({ operationId }) => operationId).sort(), ['readSession', WEBHOOK]);
  assert.deepEqual(operation('readSession').security, [{ browserSession: [] }, {}]);
});

test('the session cookie is a host-only HttpOnly, Secure, SameSite=Strict cookie', () => {
  const scheme = CONTROL_PLANE.components.securitySchemes.browserSession as { type: string; in: string; name: string; description: string };

  assert.equal(scheme.type, 'apiKey');
  assert.equal(scheme.in, 'cookie');
  assert.match(scheme.name, /^__Host-/);
  for (const attribute of ['`HttpOnly`', '`Secure`', '`SameSite=Strict`', '`Path=/`', 'without `Domain`']) assert.ok(scheme.description.includes(attribute), attribute);
  assert.deepEqual(CONTROL_PLANE.components.securitySchemes.csrfToken, {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description: (CONTROL_PLANE.components.securitySchemes.csrfToken as { description: string }).description,
  });
  assert.equal(operation('logIn').responses['200']!.headers!['Set-Cookie']!.required, true);
});

test('authentication, authorization, and CSRF failures are distinct responses', () => {
  const csrf = { code: 'forbidden', message: 'the CSRF token is missing', details: { reason: 'csrf-token-invalid' } };
  const denial = { code: 'forbidden', message: 'project-maintainer is required', details: { reason: 'role-required' } };
  const unauthenticated = { code: 'forbidden', message: 'log in first', details: { reason: 'unauthenticated' } };
  const rejected = { code: 'forbidden', message: 'the delivery is refused', details: { reason: 'signature-invalid' } };

  assert.ok(checkHttpSchema('CsrfRejection', csrf).ok);
  assert.ok(violations(checkHttpSchema('AccessDenial', csrf)).some((text) => text.includes('/details/reason')));
  assert.ok(checkHttpSchema('AccessDenial', denial).ok);
  assert.ok(checkHttpSchema('AuthenticationFailure', unauthenticated).ok);
  assert.ok(violations(checkHttpSchema('AuthenticationFailure', csrf)).some((text) => text.includes('/details/reason')));
  assert.ok(checkHttpSchema('WebhookRejection', rejected).ok);
  assert.ok(violations(checkHttpSchema('WebhookRejection', unauthenticated)).some((text) => text.includes('/details/reason')));
  assert.ok(violations(checkHttpSchema('AuthenticationFailure', rejected)).some((text) => text.includes('/details/reason')));
  for (const { method, operationId, responses } of OPERATIONS) {
    const unauthorized = responses['401']?.content?.['application/json']!.schema;
    const expected = operationId === WEBHOOK ? 'WebhookRejection' : 'AuthenticationFailure';
    if (unauthorized !== undefined) assert.deepEqual(unauthorized, { $ref: `#/components/schemas/${expected}` }, operationId);
    const forbidden = responses['403']?.content?.['application/json']!.schema;
    if (method !== 'get' && operationId !== WEBHOOK) assert.ok(forbidden !== undefined && holdsKey(forbidden, '$ref', '#/components/schemas/CsrfRejection'), operationId);
  }
  assert.deepEqual(operation('updateProject').responses['403']!.content!['application/json']!.schema, {
    oneOf: [{ $ref: '#/components/schemas/AccessDenial' }, { $ref: '#/components/schemas/CsrfRejection' }],
  });
});

test('no response schema can carry a write-only value', () => {
  const writeOnly = Object.entries(SCHEMAS).filter(([, schema]) => schema.writeOnly === true).map(([name]) => name);

  assert.deepEqual(writeOnly.sort(), ['Password', 'ScmSecrets', 'SlotCredential']);
  for (const candidate of OPERATIONS) {
    const schemas = responseSchemas(candidate).flatMap((schema) => reachable(schema));
    assert.ok(!schemas.some((schema) => holdsKey(schema, 'writeOnly', true)), candidate.operationId);
  }
  assert.ok(reachable(operation('addAccountSlot').requestBody!.content['application/json']!.schema).some((schema) => holdsKey(schema, 'writeOnly', true)));
  assert.ok(reachable(operation('rotateSlotCredential').requestBody!.content['application/json']!.schema).some((schema) => holdsKey(schema, 'writeOnly', true)));
});

test('every operation with a path parameter but the receiver answers 400 to an invalid one', () => {
  const withPath = OPERATIONS.filter(({ operationId, parameters }) => operationId !== WEBHOOK && (parameters ?? []).some(({ in: place }) => place === 'path'));

  assert.ok(withPath.length > 0);
  for (const { operationId, responses } of withPath) assert.ok('400' in responses, operationId);
});

test('every response with a CSRF token is uncached', () => {
  for (const id of ['readSession', 'logIn']) assert.deepEqual(operation(id).responses['200']!.headers!['Cache-Control']!.schema, { type: 'string', const: 'no-store' }, id);
});

test('only issuing and rotating an enrollment token reveal its secret, uncached', () => {
  const secret = '#/components/schemas/EnrollmentTokenSecret';
  const revealing = OPERATIONS.filter((candidate) => responseSchemas(candidate).some((schema) => reachable(schema).some((node) => holdsKey(node, '$ref', secret))));

  assert.deepEqual(revealing.map(({ operationId }) => operationId).sort(), ['issueEnrollmentToken', 'rotateEnrollmentToken']);
  for (const { responses } of revealing) assert.deepEqual(responses['201']!.headers!['Cache-Control']!.schema, { type: 'string', const: 'no-store' });
  const issued = { token: { tokenId: `e${'0'.repeat(32)}`, issuedAt: AT, expiresAt: AT, constraints: { platform: 'linux' } }, secret: `tken_${'a'.repeat(43)}` };
  assert.ok(checkHttpSchema('IssuedEnrollmentToken', issued).ok);
  assert.ok(violations(checkHttpSchema('EnrollmentToken', { ...issued.token, secret: issued.secret })).some((text) => text.includes('"secret"')));
});

test('the webhook receiver needs no session, CSRF token, or operator credential and takes the raw body', () => {
  const receiver = operation(WEBHOOK);

  assert.equal(receiver.method, 'post');
  assert.deepEqual(receiver.security, []);
  assert.deepEqual(receiver.requestBody!.content, { '*/*': {} });
  assert.deepEqual(Object.keys(receiver.responses).sort(), ['202', '400', '401', '413', '500', '503']);
});

test('the wire enumerations are the domain vocabularies', () => {
  const enumOf = (name: string) => (SCHEMAS[name] as { enum: string[] }).enum;
  const cooldown = SCHEMAS.SlotCooldown as { properties: { source: { enum: string[] } } };

  assert.deepEqual(enumOf('WorkerAdmissionState'), [...WORKER_ADMISSION_STATES]);
  assert.deepEqual(enumOf('MergeMethod'), [...MERGE_METHODS]);
  assert.deepEqual(enumOf('SlotState'), [...SLOT_STATES]);
  assert.deepEqual(enumOf('SlotHealth'), [...SLOT_HEALTH]);
  assert.deepEqual(cooldown.properties.source.enum, [...COOLDOWN_SOURCES]);
  assert.deepEqual(enumOf('SpecApprover'), [...SPEC_APPROVERS]);
});

test('a login and the sessions before and after it match the generated types and schemas', () => {
  const login: HttpComponents['schemas']['LoginRequest'] = { loginName: 'owner', password: 'correct horse battery staple' };
  const anonymous: HttpComponents['schemas']['AnonymousSession'] = { state: 'anonymous', csrfToken: CSRF };
  const authenticated: HttpOperations['logIn']['responses'][200]['content']['application/json'] = {
    state: 'authenticated',
    csrfToken: CSRF,
    principal: { principalId: 'u1', loginName: 'owner' },
    installationRoles: ['installation-owner'],
    expiresAt: AT,
  };

  assert.ok(checkHttpSchema('LoginRequest', login).ok);
  assert.ok(checkHttpSchema('SessionState', anonymous).ok);
  assert.ok(checkHttpSchema('SessionState', authenticated).ok);
  assert.ok(violations(checkHttpSchema('LoginRequest', { ...login, loginName: 'Owner' })).some((text) => text.includes('/loginName')));
  assert.ok(violations(checkHttpSchema('SessionState', { ...anonymous, principal: authenticated.principal })).length > 0);
});

test('projects carry their defaults, members, auto-merge setting, and repository binding', () => {
  const defaults: HttpComponents['schemas']['ProjectDefaultsInput'] = {
    framework: { pluginId: 'openspec' },
    implementers: ['harness-a', 'harness-b'],
    reviewer: 'harness-b',
    specApprover: 'delegated-reviewer',
    noEligibleSlot: 'wait',
  };
  const binding: HttpComponents['schemas']['RepositoryBindingUpdate'] = {
    binding: {
      integrationId: 'i1', repository: 'owner/repository', remoteUrl: 'https://scm.example/owner/repository.git', integrationBranch: 'dev', mergeMethod: 'merge-commit',
    },
  };

  assert.ok(checkHttpSchema('ProjectCreation', { name: 'Taskelith', defaults }).ok);
  assert.ok(violations(checkHttpSchema('ProjectDefaultsInput', { ...defaults, implementers: ['harness-a', 'harness-a'] })).some((text) => text.includes('/implementers')));
  assert.ok(checkHttpSchema('ProjectDefaultsUpdate', { expectedRevision: 3, defaults }).ok);
  assert.ok(checkHttpSchema('MemberAssignment', { role: 'project-operator' }).ok);
  assert.ok(violations(checkHttpSchema('MemberAssignment', { role: 'installation-owner' })).some((text) => text.includes('/role')));
  assert.ok(checkHttpSchema('AutoMergeSetting', { enabled: true, revision: 1 }).ok);
  assert.ok(checkHttpSchema('RepositoryBindingUpdate', binding).ok);
  assert.ok(checkHttpSchema('RepositoryBinding', { ...binding.binding, revision: 1 }).ok);
  const { remoteUrl: _remoteUrl, ...withoutRemote } = binding.binding;
  assert.ok(violations(checkHttpSchema('RepositoryBindingInput', withoutRemote)).some((text) => text.includes('remoteUrl')));
});

test('a binding branch is any name that git check-ref-format --branch accepts', () => {
  const accepted = ['dev', 'release/версия', 'feature/a.b', '@', 'a@b', 'HEADS'];
  const refused = [
    'feature branch', '-x', '/x', '.x', 'a/.b', 'a..b', 'a@{b', 'a//b', 'x.lock', 'x.lock/y', 'x/', 'x.', 'HEAD',
    'a~1', 'a^', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a\u007fb', 'a\tb', 'x'.repeat(1025),
  ];

  for (const name of accepted) assert.ok(checkHttpSchema('BranchName', name).ok, name);
  for (const name of refused) assert.ok(violations(checkHttpSchema('BranchName', name)).length > 0, name);
});

test('a bound remote is an HTTPS URL without user information, query, or fragment', () => {
  const refused = [
    'http://scm.example/acme/project.git', 'https://agent@scm.example/acme/project.git', 'https://:token@scm.example/acme/project.git',
    'ssh://git@scm.example/acme/project.git', 'scm.example:acme/project.git', 'https://scm.example/a b',
    'https://scm.example/acme/project.git?x=1', 'https://scm.example/acme/project.git#main',
  ];

  assert.ok(checkHttpSchema('RemoteUrl', 'https://scm.example/acme/project.git').ok);
  for (const remote of refused) assert.ok(violations(checkHttpSchema('RemoteUrl', remote)).length > 0, remote);
});

test('bindRepository refuses a remote outside the integration origin with a typed 422', () => {
  const reachesRefusal = ['http://scm.example/a.git', 'https://agent@scm.example/a.git', 'https://scm.example/a.git?x', 'https://scm.example/a.git#y'];
  const reasons = ['remote-not-https', 'remote-userinfo', 'remote-query', 'remote-fragment', 'remote-origin-mismatch', 'merge-method-undeclared'];
  const refusal = SCHEMAS.BindingRefusal as { properties: { details: { properties: { reason: { enum: string[] } } } } };
  const mismatch = { code: 'precondition-failed', message: 'the remote is outside the origin', details: { reason: 'remote-origin-mismatch' } };

  for (const remote of reachesRefusal) assert.ok(checkHttpSchema('RemoteUrlCandidate', remote).ok, remote);
  for (const remote of ['scm.example:acme/a.git', 'https://scm.example/a b']) assert.ok(violations(checkHttpSchema('RemoteUrlCandidate', remote)).length > 0, remote);
  assert.deepEqual((SCHEMAS.RepositoryBindingInput as { properties: Record<string, Json> }).properties.remoteUrl, { $ref: '#/components/schemas/RemoteUrlCandidate' });
  assert.deepEqual(operation('bindRepository').responses['422']!.content!['application/json']!.schema, { $ref: '#/components/schemas/BindingRefusal' });
  assert.deepEqual(refusal.properties.details.properties.reason.enum, reasons);
  assert.ok(checkHttpSchema('BindingRefusal', mismatch).ok);
  assert.ok(violations(checkHttpSchema('BindingRefusal', { ...mismatch, code: 'invalid' })).some((text) => text.includes('/code')));
});

test('only an installation owner sets the allowed origin of an SCM integration, returned normalized', () => {
  const owned = ['createScmIntegration', 'updateScmIntegration'];
  const setters = OPERATIONS.filter(({ requestBody }) =>
    reachable(requestBody?.content['application/json']?.schema).some((schema) => holdsKey(schema, '$ref', '#/components/schemas/AllowedOrigin')));

  assert.deepEqual(setters.map(({ operationId }) => operationId), owned);
  for (const origin of ['https://scm.example', 'HTTPS://SCM.Example:8443', 'https://[::1]:443']) assert.ok(checkHttpSchema('AllowedOrigin', origin).ok, origin);
  for (const origin of ['http://scm.example', 'https://a@scm.example', 'https://scm.example/', 'https://scm.example?x', 'https://scm.example#x']) {
    assert.ok(violations(checkHttpSchema('AllowedOrigin', origin)).length > 0, origin);
  }
  assert.ok(checkHttpSchema('NormalizedOrigin', 'https://scm.example:443').ok);
  for (const origin of ['https://scm.example', 'https://SCM.example:443']) assert.ok(violations(checkHttpSchema('NormalizedOrigin', origin)).length > 0, origin);
  assert.ok(violations(checkHttpSchema('ScmIntegrationCreation', { pluginId: 'scm-plugin', label: 'Main', settings: {}, secrets: {} })).some((text) => text.includes('allowedOrigin')));
  assert.ok(checkHttpSchema('ScmIntegrationUpdate', { expectedRevision: 1, allowedOrigin: 'https://scm.example' }).ok);
});

interface PageSchema {
  readonly required: string[];
  readonly properties: Record<string, { maxItems?: number; $ref?: string }>;
}

function pageName(schema: Json): string {
  return (schema.$ref as string).replace('#/components/schemas/', '');
}

test('every list but the workers snapshot pages by identifier', () => {
  const lists = OPERATIONS.filter(({ method, operationId }) => method === 'get' && operationId.startsWith('list'));
  const paged = lists.filter(({ parameters }) => (parameters ?? []).some(({ name }) => name === 'after'));

  assert.deepEqual(lists.filter((candidate) => !paged.includes(candidate)).map(({ operationId }) => operationId), ['listWorkers']);
  for (const { operationId, responses } of paged) {
    const page = SCHEMAS[pageName(responses['200']!.content!['application/json']!.schema)] as unknown as PageSchema;
    const items = Object.entries(page.properties).filter(([name]) => name !== 'next');

    assert.equal(items.length, 1, operationId);
    assert.equal(items[0]![1].maxItems, 100, operationId);
    assert.deepEqual(page.properties.next!.$ref, '#/components/schemas/Identifier', operationId);
    assert.ok(!page.required.includes('next'), operationId);
  }
});

test('the workers view holds the admission state and self-check results, never a credential', () => {
  const view: HttpOperations['listWorkers']['responses'][200]['content']['application/json'] = {
    asOf: AT,
    workers: [{
      workerId: `w${'0'.repeat(32)}`,
      host: { platform: 'linux', architecture: 'x64', hostname: 'host-1' },
      enrolledAt: AT,
      admission: 'self-check-failed',
      reportedAt: AT,
      results: [{ checkId: 'linux-containment', outcome: 'failed', details: ['the home cgroup is not writable'] }],
    }],
  };

  assert.ok(checkHttpSchema('WorkersView', view).ok);
  assert.ok(violations(checkHttpSchema('WorkerAdmissionEntry', { ...view.workers[0], credentialGeneration: 1 })).some((text) => text.includes('credentialGeneration')));
});

test('a project sees its pool slots without other projects or any credential', () => {
  const slot: HttpComponents['schemas']['AccountSlot'] = {
    slotId: 's1', harnessId: 'harness-a', mechanismId: 'subscription-token', allowedProjects: ['p1', 'p2'],
    concurrencyLimit: 4, state: 'active', health: 'healthy', cooldown: { endsAt: AT, source: 'default' }, revision: 2,
  };
  const { allowedProjects: _allowed, state: _state, revision: _revision, ...seen } = slot;

  assert.ok(checkHttpSchema('AccountSlot', slot).ok);
  assert.ok(checkHttpSchema('ProjectAccountSlot', { ...seen, sharedWithOtherProjects: true }).ok);
  assert.ok(violations(checkHttpSchema('ProjectAccountSlot', { ...seen, sharedWithOtherProjects: true, allowedProjects: ['p1'] })).length > 0);
  assert.ok(violations(checkHttpSchema('AccountSlot', { ...slot, credential: 'secret' })).some((text) => text.includes('"credential"')));
  assert.ok(violations(checkHttpSchema('AccountSlotAddition', { harnessId: 'harness-a', mechanismId: 'subscription-token', allowedProjects: ['p1'] })).some((text) => text.includes('credential')));
  assert.ok(violations(checkHttpSchema('AccountSlotUpdate', { expectedRevision: 2 })).length > 0);
  assert.ok(checkHttpSchema('SlotCredentialRotation', { expectedRevision: 2, credential: 'new token' }).ok);
});

test('an SCM integration returns the names of its secrets, never their values', () => {
  const integration: HttpComponents['schemas']['ScmIntegration'] = {
    integrationId: 'i1', pluginId: 'scm-plugin', label: 'Main', allowedOrigin: 'https://scm.example:443', settings: { 'app-id': '42' },
    secretNames: ['signing-key', 'webhook-secret'], revision: 1,
  };

  assert.ok(checkHttpSchema('ScmIntegration', integration).ok);
  assert.ok(violations(checkHttpSchema('ScmIntegration', { ...integration, secrets: { 'webhook-secret': 'value' } })).some((text) => text.includes('"secrets"')));
  assert.ok(checkHttpSchema('ScmIntegrationCreation', {
    pluginId: 'scm-plugin', label: 'Main', allowedOrigin: 'https://scm.example', settings: {}, secrets: { 'webhook-secret': 'value' },
  }).ok);
  assert.ok(violations(checkHttpSchema('ScmSettings', { 'App ID': '42' })).length > 0);
  assert.ok(violations(checkHttpSchema('ScmIntegrationUpdate', { expectedRevision: 1 })).length > 0);
});
