import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkHttpSchema, checkMessageSchema, type MessageSchemas } from '@taskelith/contracts';
import { document, type Json, type Operation, operation, SCHEMAS, violations } from './control-plane-document.ts';

interface AsyncapiDocument {
  readonly asyncapi: string;
  readonly info: { readonly version: string; readonly description: string };
  readonly channels: Record<string, { address: string | null; description: string; messages: Record<string, { $ref: string }> }>;
  readonly operations: Record<string, { action: string; channel: { $ref: string }; messages: { $ref: string }[] }>;
  readonly components: { readonly schemas: Record<string, Json>; readonly messages: Record<string, { title: string; payload: { $ref: string } }> };
}

const TERMINAL = JSON.parse(readFileSync(new URL('../documents/terminal.asyncapi.json', import.meta.url), 'utf8')) as AsyncapiDocument;
const FRAMES = TERMINAL.components.schemas;
const EXECUTION = document('execution.openapi.json');
const CSRF = 'A'.repeat(43);
const HANDSHAKE_HEADERS = ['Upgrade', 'Sec-WebSocket-Version', 'Sec-WebSocket-Key', 'Sec-WebSocket-Protocol'];

function relay(): Operation & { path: string; method: string } {
  const entries = Object.entries(EXECUTION.paths).flatMap(([path, item]) => Object.entries(item).map(([method, found]) => ({ path, method, ...found })));
  const found = entries.find(({ operationId }) => operationId === 'openWorkerRelay');
  assert.ok(found);
  return found;
}

function frame(name: string, input: unknown) {
  return checkMessageSchema(name as keyof MessageSchemas & string, input);
}

function enumOf(schema: Json): string[] {
  return schema.enum as string[];
}

function refusalReasons(schema: Json): string[] {
  const reason = ((schema.properties as Json).details as { properties: { reason: Json } }).properties.reason;
  return (reason.enum ?? [reason.const]) as string[];
}

test('the terminal WebSocket is a GET upgrade of an agent session with the 9a and 9b credentials', () => {
  const terminal = operation('openTerminal');

  assert.equal(terminal.method, 'get');
  assert.equal(terminal.path, '/projects/{projectId}/agent-sessions/{sessionId}/terminal');
  assert.deepEqual(terminal.security, [{ browserSession: [] }, { operatorToken: [] }]);
  assert.deepEqual(Object.keys(terminal.responses).sort(), ['101', '400', '401', '403', '404', '422', '500', '503']);
  assert.equal(terminal.responses['101']!.content, undefined);
  assert.deepEqual(terminal.responses['101']!.headers!['Sec-WebSocket-Protocol']!.schema, { type: 'string', const: 'taskelith.terminal.v1' });
  assert.deepEqual(terminal.responses['401']!.content!['application/json']!.schema, { $ref: '#/components/schemas/AuthenticationFailure' });
  assert.deepEqual(terminal.responses['403']!.content!['application/json']!.schema, {
    oneOf: [{ $ref: '#/components/schemas/AccessDenial' }, { $ref: '#/components/schemas/CsrfRejection' }],
  });
  const names = (terminal.parameters ?? []).map(({ name, in: place, required }) => `${place}:${name}:${required === true}`);
  for (const name of ['path:projectId', 'path:sessionId', 'query:attemptId', 'query:ownershipGeneration', 'query:generation']) assert.ok(names.includes(`${name}:true`), name);
  for (const name of HANDSHAKE_HEADERS) assert.ok(names.includes(`header:${name}:true`), name);
  assert.ok(names.includes('header:Origin:false'));
});

test('the terminal checks the role before it reads the session and refuses with typed reasons', () => {
  const terminal = operation('openTerminal');
  const refusal = SCHEMAS.TerminalRefusal!;

  assert.match(terminal.description!, /`project-operator` or above/);
  assert.match(terminal.description!, /checks the role before it reads the session/);
  assert.deepEqual(refusalReasons(refusal), ['attempt-not-current', 'terminal-not-offered']);
  for (const reason of refusalReasons(refusal)) {
    assert.ok(checkHttpSchema('TerminalRefusal', { code: 'precondition-failed', message: `refused: ${reason}`, details: { reason } }).ok, reason);
  }
  assert.ok(violations(checkHttpSchema('TerminalRefusal', { code: 'precondition-failed', message: 'no', details: { reason: 'role-required' } })).length > 0);
  assert.ok(checkHttpSchema('AccessDenial', { code: 'forbidden', message: 'project-operator is required', details: { reason: 'role-required' } }).ok);
});

test('the worker opens its relay with the worker credential only, and only at protocol version 2', () => {
  const opened = relay();

  assert.equal(opened.method, 'get');
  assert.equal(opened.path, '/workers/relay');
  assert.deepEqual(opened.security, [{ workerCredential: [] }]);
  assert.deepEqual(Object.keys(opened.responses).sort(), ['101', '400', '401', '422', '500', '503']);
  assert.deepEqual(opened.responses['101']!.headers!['Sec-WebSocket-Protocol']!.schema, { type: 'string', const: 'taskelith.relay.v1' });
  assert.deepEqual(refusalReasons(EXECUTION.components.schemas.RelayRefusal!), ['protocol-not-supported']);
  assert.deepEqual((opened.parameters ?? []).map(({ name }) => name), HANDSHAKE_HEADERS);
});

test('the frames are the terminal document\'s, upgraded by an HTTP operation and never at a second path', () => {
  assert.equal(TERMINAL.asyncapi, '3.0.0');
  assert.equal(TERMINAL.info.version, '0.1.0');
  assert.deepEqual(Object.keys(TERMINAL.channels).sort(), ['browserTerminal', 'workerRelay']);
  for (const [name, channel] of Object.entries(TERMINAL.channels)) assert.equal(channel.address, null, name);
  assert.match(TERMINAL.channels.browserTerminal!.description, /`openTerminal`/);
  assert.match(TERMINAL.channels.workerRelay!.description, /`openWorkerRelay`/);
  for (const [name, schema] of Object.entries({ Identifier: EXECUTION.components.schemas.Identifier, CsrfToken: SCHEMAS.CsrfToken, AgentSessionId: SCHEMAS.AgentSessionId })) {
    assert.deepEqual(FRAMES[name], schema, name);
  }
});

test('a client attaches first, with the session\'s CSRF token when the cookie authenticated it', () => {
  const attach = { type: 'terminal.attach', csrfToken: CSRF, cols: 120, rows: 40 };

  assert.ok(frame('TerminalAttachFrame', attach).ok);
  assert.ok(!frame('TerminalAttachFrame', { ...attach, csrfToken: 'short' }).ok);
  assert.ok(!frame('TerminalAttachFrame', { ...attach, cols: 0 }).ok);
  assert.ok(frame('TerminalClientFrame', attach).ok);
  assert.ok(frame('TerminalClientFrame', { type: 'terminal.close' }).ok);
  assert.match((FRAMES.TerminalAttachFrame as { description: string }).description, /first and only first client frame/);
});

test('a reattach names the terminal its cursor belongs to', () => {
  const reattach = { type: 'terminal.attach', cols: 80, rows: 24, after: 17 };

  assert.ok(frame('TerminalAttachFrame', { ...reattach, terminalId: 'terminal-1' }).ok);
  assert.ok(frame('TerminalAttachFrame', { type: 'terminal.attach', cols: 80, rows: 24, terminalId: 'terminal-1' }).ok);
  assert.ok(!frame('TerminalAttachFrame', reattach).ok);
});

test('a cursor of another terminal is ignored, and only the attached one is range-checked', () => {
  const cursor = (FRAMES.TerminalAttachFrame as { properties: { after: { description: string } } }).properties.after.description;

  assert.match(cursor, /not the one attached, `after` is ignored and output follows from the earliest retained chunk/);
  assert.match(cursor, /when it is, an `after` beyond its last sequence closes the connection with `invalid-frame`/);
  assert.doesNotMatch(cursor, /beyond the attached terminal's last sequence/);
});

test('an upgrade accepts a subprotocol list that offers its protocol', () => {
  const upgrades = [[operation('openTerminal'), 'taskelith.terminal.v1'], [relay(), 'taskelith.relay.v1']] as const;

  for (const [upgrade, protocol] of upgrades) {
    const header = (upgrade.parameters ?? []).find(({ name }) => name === 'Sec-WebSocket-Protocol');
    const offers = new RegExp((header?.schema as { pattern: string }).pattern);
    for (const offered of [protocol, `chat, ${protocol}`, `${protocol},chat`]) assert.match(offered, offers);
    for (const offered of ['chat', `${protocol}x`, `x${protocol}`, `chat ${protocol}`]) assert.doesNotMatch(offered, offers);
  }
});

test('terminal input and output are bounded per frame', () => {
  assert.ok(frame('TerminalInputFrame', { type: 'terminal.input', data: 'x'.repeat(4096) }).ok);
  assert.ok(!frame('TerminalInputFrame', { type: 'terminal.input', data: 'x'.repeat(4097) }).ok);
  assert.ok(!frame('TerminalInputFrame', { type: 'terminal.input', data: '' }).ok);
  assert.ok(frame('TerminalOutputFrame', { type: 'terminal.output', sequence: 1, data: 'x'.repeat(65_536) }).ok);
  assert.ok(!frame('TerminalOutputFrame', { type: 'terminal.output', sequence: 1, data: 'x'.repeat(65_537) }).ok);
  assert.ok(!frame('TerminalOutputFrame', { type: 'terminal.output', sequence: 0, data: 'x' }).ok);
});

test('a terminal ends with its reason, and with the worker\'s refusal exactly when it was refused', () => {
  const ended = (input: object) => frame('TerminalEndedFrame', { type: 'terminal.ended', ...input });

  assert.ok(ended({ reason: 'program-exited' }).ok);
  assert.ok(ended({ reason: 'refused', refusal: 'terminal-not-offered' }).ok);
  assert.ok(!ended({ reason: 'refused' }).ok);
  assert.ok(!ended({ reason: 'program-exited', refusal: 'terminal-not-offered' }).ok);
  assert.deepEqual(enumOf(FRAMES.TerminalRefusalReason!), [
    'attempt-not-held', 'execution-not-running', 'generation-not-running', 'terminal-not-offered', 'terminal-start-failed',
  ]);
  assert.ok(ended({ reason: 'refused', refusal: 'terminal-start-failed' }).ok);
  assert.deepEqual(enumOf(FRAMES.TerminalCloseReason!), [
    'invalid-frame', 'unauthenticated', 'csrf-token-invalid', 'role-changed', 'attach-timeout', 'superseded', 'terminal-ended', 'rate-limited', 'relay-unavailable',
  ]);
});

test('relay frames name their terminal, and an open names the attempt, execution, and generation it joins', () => {
  const open = {
    type: 'relay.terminal.open', terminalId: 'm1', attemptId: 'attempt-1', ownershipGeneration: 2, executionId: 'execution-1',
    sessionId: 'session-1', generation: 3, cols: 120, rows: 40,
  };
  const { executionId: _executionId, ...unbound } = open;

  assert.ok(frame('RelayControlFrame', open).ok);
  assert.ok(violations(frame('RelayOpenFrame', unbound)).some((text) => text.includes('executionId')));
  assert.ok(frame('RelayWorkerFrame', { type: 'relay.terminal.refused', terminalId: 'm1', reason: 'attempt-not-held' }).ok);
  assert.ok(frame('RelayWorkerFrame', { type: 'relay.terminal.refused', terminalId: 'm1', reason: 'terminal-start-failed' }).ok);
  assert.ok(frame('RelayWorkerFrame', { type: 'relay.terminal.output', terminalId: 'm1', sequence: 4, data: 'ok' }).ok);
  assert.ok(!frame('RelayWorkerFrame', { type: 'relay.terminal.output', sequence: 4, data: 'ok' }).ok);
  const relayEnds = enumOf((FRAMES.RelayEndedFrame!.properties as Json).reason as Json);
  assert.ok(relayEnds.every((reason) => enumOf(FRAMES.TerminalEndReason!).includes(reason)));
});

test('the terminal document lists every frame on its channel and operation, and carries no example', () => {
  for (const [name, { channel, messages }] of Object.entries(TERMINAL.operations)) {
    const channelName = channel.$ref.replace('#/channels/', '');
    for (const { $ref } of messages) assert.ok($ref.startsWith(`#/channels/${channelName}/messages/`), name);
  }
  const listed = Object.values(TERMINAL.operations).flatMap(({ messages }) => messages.map(({ $ref }) => $ref.split('/').pop()));
  assert.deepEqual(listed.sort(), Object.keys(TERMINAL.components.messages).sort());
  assert.ok(!/"examples?"\s*:/.test(JSON.stringify(TERMINAL)));
  assert.match(TERMINAL.info.description, /never logged, recorded, journaled, published to the broker, or sent on an event stream/);
});
