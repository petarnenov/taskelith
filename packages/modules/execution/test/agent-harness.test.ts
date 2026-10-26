import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
import {
  ACCOUNT_SIGNALS,
  AGENT_HARNESS_PORT_VERSION,
  CLASSIFIED_OPERATION_KINDS,
  DELEGATION_OUTCOMES,
  HARNESS_CAPABILITIES,
  HARNESS_FAILURES,
  HARNESS_PLATFORMS,
  MAX_HARNESS_TEXT_LENGTH,
  PERMISSION_DECISIONS,
  REQUIRED_HARNESS_CAPABILITIES,
  SESSION_END_REASONS,
  SUBSCRIPTION_MECHANISMS,
  ScriptedAgentHarness,
  TURN_OUTCOMES,
  parseAgentHarnessCapabilities,
  parseHarnessEvent,
  parseOperationResult,
  runAgentHarnessConformance,
  type AgentHarnessCapabilities,
  type AgentHarnessConformanceFixture,
  type AgentHarnessOperation,
  type HarnessEventData,
  type ParsedAgentHarnessCapabilities,
  type RespondRequest,
  type ResumeSessionRequest,
  type ScriptStep,
  type ScriptedAgentHarnessOptions,
  type SessionHandleData,
  type SessionRequest,
  type TerminalProgramData,
  type TurnRequest,
} from '@taskelith/execution';

// The values the agent harness port contract fixes; a change here is a
// contract change and needs the contract updated with it.
const CONTRACT_VALUES = [
  ['HARNESS_CAPABILITIES', HARNESS_CAPABILITIES, [
    'chat', 'prompt-correlation', 'resume', 'permission-requests', 'input-requests',
    'interruption', 'exit-observation', 'delegation', 'terminal',
  ]],
  ['REQUIRED_HARNESS_CAPABILITIES', REQUIRED_HARNESS_CAPABILITIES, [
    'chat', 'prompt-correlation', 'permission-requests', 'interruption', 'exit-observation',
  ]],
  ['SUBSCRIPTION_MECHANISMS', SUBSCRIPTION_MECHANISMS, ['subscription-token', 'device-login']],
  ['ACCOUNT_SIGNALS', ACCOUNT_SIGNALS, ['usage', 'limit', 'reset-time']],
  ['HARNESS_PLATFORMS', HARNESS_PLATFORMS, ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']],
  ['TURN_OUTCOMES', TURN_OUTCOMES, ['completed', 'interrupted', 'turn-limit-reached', 'account-limit-reached', 'failed']],
  ['HARNESS_FAILURES', HARNESS_FAILURES, ['authentication', 'transport', 'harness-exited', 'protocol', 'internal']],
  ['SESSION_END_REASONS', SESSION_END_REASONS, ['closed', 'exited', 'failed']],
  ['PERMISSION_DECISIONS', PERMISSION_DECISIONS, ['allow', 'deny']],
  ['DELEGATION_OUTCOMES', DELEGATION_OUTCOMES, ['completed', 'rejected', 'failed', 'cancelled']],
  ['CLASSIFIED_OPERATION_KINDS', CLASSIFIED_OPERATION_KINDS, ['push']],
] as const;

const BINARY = { platform: 'linux-x64', version: '1.0.0', path: 'bin/harness', sha256: 'a'.repeat(64) };

const ALL: AgentHarnessCapabilities = {
  supported: [...HARNESS_CAPABILITIES],
  subscriptionMechanisms: ['subscription-token'],
  accountSignals: ['usage', 'limit', 'reset-time'],
  binaries: [BINARY],
};

const REQUIRED_ONLY: AgentHarnessCapabilities = { ...ALL, supported: [...REQUIRED_HARNESS_CAPABILITIES] };

const SCRIPT: Readonly<Record<string, readonly ScriptStep[]>> = {
  remember: [{ output: 'noted' }, { usage: 0.25 }],
  recall: [{ output: 'the word is tangerine' }],
  permission: [{ permission: 'push the branch', operation: { kind: 'push', ref: 'refs/heads/task-1' } }, { output: 'done' }],
  long: [{ output: 'working' }, { waitForInterrupt: true }],
  input: [{ input: 'which file?' }],
  delegate: [{ delegation: 'review the change' }],
  'turn limit': [{ end: 'turn-limit-reached' }],
  'account limit': [{ limit: { resetsAt: '2026-10-26T12:00:00Z' } }, { end: 'account-limit-reached' }],
};

const OPTIONS: ScriptedAgentHarnessOptions = { capabilities: ALL, script: SCRIPT };

const START = {
  sessionId: 's', generation: 1, binaryPath: '/plugin/bin/harness', workingDirectory: '/w', stateDirectory: '/s',
  credential: { mechanism: 'subscription-token', secret: 'not-a-secret' },
};

function fixtureFor(harness: ScriptedAgentHarness, overrides: Partial<AgentHarnessConformanceFixture> = {}): AgentHarnessConformanceFixture {
  return {
    workingDirectory: '/work',
    stateDirectory: '/state',
    binaryPath: '/plugin/bin/harness',
    credential: { mechanism: 'subscription-token', secret: 'not-a-secret' },
    prompts: {
      remember: 'remember', recall: 'recall', permission: 'permission', longRunning: 'long',
      input: 'input', delegation: 'delegate', turnLimit: 'turn limit', accountLimit: 'account limit',
    },
    recalled: 'tangerine',
    actionRuns: async () => harness.actionRuns(),
    endHarness: (session) => harness.exitHarness(session.nativeSessionId),
    timeoutMs: 200,
    ...overrides,
  };
}

async function findingsOf(harness: ScriptedAgentHarness, overrides: Partial<AgentHarnessConformanceFixture> = {}) {
  return (await runAgentHarnessConformance(harness, fixtureFor(harness, overrides))).findings;
}

async function checksOf(harness: ScriptedAgentHarness, overrides: Partial<AgentHarnessConformanceFixture> = {}): Promise<Set<string>> {
  return new Set((await findingsOf(harness, overrides)).map((finding) => finding.check));
}

function parsed(capabilities: AgentHarnessCapabilities = ALL): ParsedAgentHarnessCapabilities {
  const result = parseAgentHarnessCapabilities(capabilities);
  assert.ok(result.ok);
  return result.value;
}

function code(result: Result<unknown>): string {
  return result.ok ? 'ok' : result.error.code;
}

async function started(harness: ScriptedAgentHarness): Promise<{ session: SessionRequest; events: AsyncIterator<HarnessEventData> }> {
  const handle = await harness.startSession(START);
  assert.ok(handle.ok);
  const session = { nativeSessionId: handle.value.nativeSessionId, generation: 1 };
  const events = await harness.events(session);
  assert.ok(events.ok);
  return { session, events: events.value[Symbol.asyncIterator]() };
}

async function drain(events: AsyncIterator<HarnessEventData>): Promise<string[]> {
  const kinds: string[] = [];
  for (let step = await events.next(); step.done !== true; step = await events.next()) {
    const event = step.value;
    kinds.push(event.kind === 'turn-ended' ? `${event.kind}:${event.outcome}` : event.kind);
  }
  return kinds;
}

test('the contract values are fixed', () => {
  assert.equal(AGENT_HARNESS_PORT_VERSION, '0.1.0');
  for (const [name, actual, expected] of CONTRACT_VALUES) {
    assert.deepEqual(actual, expected, name);
    assert.ok(Object.isFrozen(actual), `${name} is frozen`);
  }
});

test('the scripted harness passes the suite with every capability', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const report = await runAgentHarnessConformance(harness, fixtureFor(harness));
  assert.deepEqual(report.findings, []);
  assert.equal(report.scenarios, 10);
});

test('the scripted harness passes the suite with only the required capabilities', async () => {
  const harness = new ScriptedAgentHarness({ ...OPTIONS, capabilities: REQUIRED_ONLY });
  const { turnLimit: _turnLimit, accountLimit: _accountLimit, ...prompts } = fixtureFor(harness).prompts;
  assert.deepEqual(await findingsOf(harness, { prompts }), []);
});

test('capability declarations are checked', () => {
  const cases: readonly [string, unknown][] = [
    ['missing required', { ...ALL, supported: ['chat'] }],
    ['unknown capability', { ...ALL, supported: [...ALL.supported, 'browser'] }],
    ['duplicate', { ...ALL, supported: [...ALL.supported, 'chat'] }],
    ['no mechanism', { ...ALL, subscriptionMechanisms: [] }],
    ['reset-time without limit', { ...ALL, accountSignals: ['reset-time'] }],
    ['no binary', { ...ALL, binaries: [] }],
    ['bad digest', { ...ALL, binaries: [{ ...BINARY, sha256: 'ABC' }] }],
    ['absolute path', { ...ALL, binaries: [{ ...BINARY, path: '/usr/bin/harness' }] }],
    ['path leaves the package', { ...ALL, binaries: [{ ...BINARY, path: 'bin/../../harness' }] }],
    ['empty path segment', { ...ALL, binaries: [{ ...BINARY, path: 'bin//harness' }] }],
    ['platform twice', { ...ALL, binaries: [BINARY, BINARY] }],
    ['unknown platform', { ...ALL, binaries: [{ ...BINARY, platform: 'windows-x64' }] }],
    ['extra field', { ...ALL, telemetry: true }],
    ['not an object', 'capabilities'],
    ['class instance', new (class { supported = []; })()],
    ['array with a hole', { ...ALL, supported: Array(5) }],
    ['getter', Object.defineProperty({ ...ALL }, 'supported', { get: () => [], enumerable: true })],
    ['throwing proxy', new Proxy({}, { ownKeys: () => { throw new Error('no'); } })],
  ];
  for (const [name, raw] of cases) assert.equal(code(parseAgentHarnessCapabilities(raw)), 'invalid', name);
  assert.deepEqual(parsed().binaries, [BINARY]);
});

test('harness events are parsed against the declaration', () => {
  const capabilities = parsed();
  const valid: readonly HarnessEventData[] = [
    { kind: 'output', turnId: 't', text: 'x' },
    { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's' },
    { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref: 'refs/heads/a/b' } },
    { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref: 'refs/heads/@' } },
    { kind: 'input-request', turnId: 't', nativeRequestId: 'r', prompt: 'p' },
    { kind: 'delegation-request', turnId: 't', nativeRequestId: 'r', instructions: 'i' },
    { kind: 'account-signal', signal: 'usage', usage: 1 },
    { kind: 'account-signal', signal: 'limit' },
    { kind: 'account-signal', signal: 'limit', resetsAt: '2026-10-26T12:00:00.000Z' },
    { kind: 'turn-ended', turnId: 't', outcome: 'completed' },
    { kind: 'turn-ended', turnId: 't', outcome: 'failed', failure: 'transport' },
    { kind: 'session-ended', reason: 'exited', exitCode: 1 },
    { kind: 'session-ended', reason: 'failed', signal: 'SIGKILL' },
  ];
  for (const event of valid) assert.deepEqual(parseHarnessEvent(event, capabilities), { ok: true, value: event }, event.kind);
  const minimal = parsed({ ...REQUIRED_ONLY, accountSignals: [] });
  const push = (ref: string): unknown => ({ kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref } });
  const invalid: readonly [string, unknown, ParsedAgentHarnessCapabilities][] = [
    ['unknown kind', { kind: 'browse' }, capabilities],
    ['undeclared request', { kind: 'input-request', turnId: 't', nativeRequestId: 'r', prompt: 'p' }, minimal],
    ['undeclared usage', { kind: 'account-signal', signal: 'usage', usage: 0 }, minimal],
    ['undeclared limit', { kind: 'account-signal', signal: 'limit' }, minimal],
    ['undeclared reset', { kind: 'account-signal', signal: 'limit', resetsAt: '2026-10-26T12:00:00Z' }, parsed({ ...ALL, accountSignals: ['limit'] })],
    ['unknown signal', { kind: 'account-signal', signal: 'load' }, capabilities],
    ['usage above one', { kind: 'account-signal', signal: 'usage', usage: 2 }, capabilities],
    ['bad reset time', { kind: 'account-signal', signal: 'limit', resetsAt: 'tomorrow' }, capabilities],
    ['30 February', { kind: 'account-signal', signal: 'limit', resetsAt: '2026-02-30T00:00:00Z' }, capabilities],
    ['reset time with an offset', { kind: 'account-signal', signal: 'limit', resetsAt: '2026-10-26T12:00:00+00:00' }, capabilities],
    ['reset time without seconds', { kind: 'account-signal', signal: 'limit', resetsAt: '2026-10-26T12:00Z' }, capabilities],
    ['long ref', push(`refs/heads/${'a'.repeat(1015)}`), capabilities],
    ['failure on success', { kind: 'turn-ended', turnId: 't', outcome: 'completed', failure: 'internal' }, capabilities],
    ['failed without failure', { kind: 'turn-ended', turnId: 't', outcome: 'failed' }, capabilities],
    ['unknown outcome', { kind: 'turn-ended', turnId: 't', outcome: 'success' }, capabilities],
    ['empty turn ID', { kind: 'output', turnId: '', text: 'x' }, capabilities],
    ['long text', { kind: 'output', turnId: 't', text: 'x'.repeat(65_537) }, capabilities],
    ['missing field', { kind: 'output', turnId: 't' }, capabilities],
    ['extra field', { kind: 'output', turnId: 't', text: 'x', secret: 'y' }, capabilities],
    ['empty request ID', { kind: 'permission-request', turnId: 't', nativeRequestId: '', summary: 's' }, capabilities],
    ['long summary', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 'x'.repeat(65_537) }, capabilities],
    ['short ref', push('main'), capabilities],
    ['empty branch', push('refs/heads/'), capabilities],
    ['whitespace in ref', push('refs/heads/a b'), capabilities],
    ['dot dot in ref', push('refs/heads/a..b'), capabilities],
    ['trailing slash', push('refs/heads/a/'), capabilities],
    ['lock suffix', push('refs/heads/a.lock'), capabilities],
    ['hidden component', push('refs/heads/a/.b'), capabilities],
    ['unknown operation', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'delete', ref: 'refs/heads/a' } }, capabilities],
    ['malformed operation', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: 'push' }, capabilities],
    ['bad exit code', { kind: 'session-ended', reason: 'exited', exitCode: 256 }, capabilities],
    ['bad signal', { kind: 'session-ended', reason: 'exited', signal: 'kill' }, capabilities],
    ['unknown reason', { kind: 'session-ended', reason: 'gone' }, capabilities],
    ['accessor', Object.defineProperty({ kind: 'output', turnId: 't' }, 'text', { get: () => 'x', enumerable: true }), capabilities],
    ['null', null, capabilities],
  ];
  for (const [name, raw, declared] of invalid) assert.equal(code(parseHarnessEvent(raw, declared)), 'invalid', name);
});

test('operation results are parsed as exact kernel Results', () => {
  const iterable = { async *[Symbol.asyncIterator]() { /* no events */ } };
  assert.deepEqual(parseOperationResult('startSession', ok({ nativeSessionId: 'n' })), ok(ok({ nativeSessionId: 'n' })));
  assert.deepEqual(parseOperationResult('submitTurn', ok(undefined)), ok(ok(undefined)));
  assert.deepEqual(parseOperationResult('submitTurn', { ok: true, value: undefined }), ok(ok(undefined)));
  assert.deepEqual(parseOperationResult('terminalProgram', ok({ argv: ['sh'], workingDirectory: '/w' })), ok(ok({ argv: ['sh'], workingDirectory: '/w' })));
  assert.deepEqual(parseOperationResult('respond', err(failure('conflict', 'again', { field: 'x' }))), ok(err(failure('conflict', 'again', { field: 'x' }))));
  assert.equal(code(parseOperationResult('events', ok(iterable))), 'ok');
  const malformed: readonly [string, Parameters<typeof parseOperationResult>[0], unknown][] = [
    ['not an object', 'submitTurn', 'ok'],
    ['inherited ok', 'submitTurn', Object.create({ ok: true })],
    ['success without value', 'submitTurn', { ok: true }],
    ['extra field', 'submitTurn', { ok: true, value: undefined, extra: 1 }],
    ['value on void', 'submitTurn', ok('x')],
    ['error on success', 'submitTurn', { ok: true, error: failure('internal', 'x') }],
    ['value on failure', 'submitTurn', { ok: false, value: 1, error: failure('internal', 'x') }],
    ['non-boolean ok', 'submitTurn', { ok: 'yes' }],
    ['unknown code', 'respond', { ok: false, error: { code: 'teapot', message: 'x', details: {} } }],
    ['no details', 'respond', { ok: false, error: { code: 'internal', message: 'x' } }],
    ['non-string detail', 'respond', { ok: false, error: { code: 'internal', message: 'x', details: { a: 1 } } }],
    ['long message', 'respond', { ok: false, error: { code: 'internal', message: 'x'.repeat(4097), details: {} } }],
    ['long native session ID', 'startSession', ok({ nativeSessionId: 'x'.repeat(129) })],
    ['long argv element', 'terminalProgram', ok({ argv: ['x'.repeat(1025)], workingDirectory: '/w' })],
    ['long working directory', 'terminalProgram', ok({ argv: ['sh'], workingDirectory: `/${'w'.repeat(1024)}` })],
    ['extra handle field', 'resumeSession', ok({ nativeSessionId: 'n', token: 't' })],
    ['empty argv', 'terminalProgram', ok({ argv: [], workingDirectory: '/w' })],
    ['argv of numbers', 'terminalProgram', ok({ argv: [1], workingDirectory: '/w' })],
    ['argv not an array', 'terminalProgram', ok({ argv: 'sh', workingDirectory: '/w' })],
    ['no working directory', 'terminalProgram', ok({ argv: ['sh'], workingDirectory: '' })],
    ['events not iterable', 'events', ok({})],
    ['events null', 'events', ok(null)],
  ];
  for (const [name, operation, raw] of malformed) assert.equal(code(parseOperationResult(operation, raw)), 'invalid', name);
  assert.equal(code(parseOperationResult('startSession', ok({ nativeSessionId: 'x'.repeat(128) }))), 'ok');
  assert.equal(code(parseOperationResult('terminalProgram', ok({ argv: ['x'.repeat(1024)], workingDirectory: '/w' }))), 'ok');
});

test('a __proto__ failure detail is a field like any other', () => {
  const failed = (details: string): unknown =>
    JSON.parse(`{"ok":false,"error":{"code":"internal","message":"x","details":${details}}}`);
  const kept = parseOperationResult('respond', failed('{"__proto__":"a","b":"c"}'));
  assert.ok(kept.ok && !kept.value.ok);
  assert.deepEqual(Object.entries(kept.value.error.details), [['__proto__', 'a'], ['b', 'c']]);
  assert.equal(Object.getPrototypeOf(kept.value.error.details), Object.prototype);
  assert.equal(code(parseOperationResult('respond', failed('{"__proto__":1}'))), 'invalid');
  assert.equal(code(parseOperationResult('respond', failed('{"__proto__":{"a":"b"}}'))), 'invalid');
  const bare = Object.assign(Object.create(null) as Record<string, string>, { a: 'b' });
  const nullPrototype = parseOperationResult('respond', { ok: false, error: { code: 'internal', message: 'x', details: bare } });
  assert.ok(nullPrototype.ok && !nullPrototype.value.ok);
  assert.deepEqual({ ...nullPrototype.value.error.details }, { a: 'b' });
});

test('the scripted harness keeps its own rules outside the suite', async () => {
  const harness = new ScriptedAgentHarness({
    capabilities: ALL,
    script: { fail: [{ output: 'x' }, { end: 'failed', failure: 'transport' }] },
    terminal: { argv: ['shell'], workingDirectory: '/work' },
  });
  assert.equal(code(await harness.startSession({ ...START, generation: 0 })), 'invalid');
  assert.equal(code(await harness.startSession({ ...START, generation: 2 })), 'invalid');
  assert.equal(code(await harness.startSession({ ...START, binaryPath: '' })), 'invalid');
  assert.equal(code(await harness.startSession({ ...START, credential: { mechanism: 'device-login', secret: '' } })), 'invalid');
  const { session, events } = await started(harness);
  assert.equal(code(await harness.startSession(START)), 'conflict');
  const resume = { ...START, generation: 2, nativeSessionId: session.nativeSessionId };
  assert.equal(code(await harness.resumeSession(resume)), 'precondition-failed');
  assert.equal(code(await harness.resumeSession({ ...resume, generation: 0 })), 'invalid');
  assert.equal(code(await harness.resumeSession({ ...resume, nativeSessionId: 'unknown' })), 'not-found');
  assert.deepEqual(await harness.terminalProgram(session), ok({ argv: ['shell'], workingDirectory: '/work' }));
  assert.equal(code(await harness.submitTurn({ ...session, turnId: 't', text: 'fail' })), 'ok');
  const delegation = { ...session, nativeRequestId: 'r', response: { kind: 'delegation-result', delegationId: '', outcome: 'completed', summary: '' } } as RespondRequest;
  assert.equal(code(await harness.respond(delegation)), 'invalid');
  assert.equal(code(await harness.closeSession({ ...session, generation: 2 })), 'precondition-failed');
  assert.equal(code(await harness.closeSession({ ...session, nativeSessionId: 'unknown' })), 'not-found');
  const [first, second] = await Promise.all([harness.closeSession(session), harness.closeSession(session)]);
  assert.deepEqual([code(first), code(second)], ['ok', 'ok']);
  assert.deepEqual(await drain(events), ['output', 'turn-ended:failed', 'session-ended']);
  assert.equal(code(await harness.resumeSession({ ...resume, generation: 3 })), 'precondition-failed');
  await harness.exitHarness(session.nativeSessionId);
  await harness.exitHarness('unknown');
});

test('the scripted harness ends an interrupted turn as interrupted, even at once', async () => {
  const harness = new ScriptedAgentHarness({ ...OPTIONS, script: { quick: [{ output: 'done' }] } });
  const { session, events } = await started(harness);
  const submitted = harness.submitTurn({ ...session, turnId: 't1', text: 'quick' });
  const interrupted = harness.interrupt({ ...session, turnId: 't1' });
  assert.deepEqual([code(await submitted), code(await interrupted)], ['ok', 'ok']);
  assert.equal(code(await harness.interrupt({ ...session, turnId: 't1' })), 'precondition-failed');
  assert.equal(code(await harness.closeSession(session)), 'ok');
  assert.deepEqual(await drain(events), ['output', 'turn-ended:interrupted', 'session-ended']);
});

test('the scripted harness rejects a response of the wrong kind', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session, events } = await started(harness);
  await harness.submitTurn({ ...session, turnId: 't', text: 'permission' });
  const request = (await events.next()).value as HarnessEventData;
  assert.equal(request.kind, 'permission-request');
  const nativeRequestId = request.kind === 'permission-request' ? request.nativeRequestId : '';
  assert.equal(code(await harness.respond({ ...session, nativeRequestId, response: { kind: 'input', text: 'x' } })), 'invalid');
  const long = 'x'.repeat(65_537);
  const malformed: readonly unknown[] = [
    { kind: 'permission', decision: 'allow', message: 1 },
    { kind: 'permission', decision: 'allow', message: long },
    { kind: 'permission', decision: 'allow', scope: 'always' },
    { kind: 'input', text: 'x', format: 'plain' },
    { kind: 'input', text: long },
    { kind: 'delegation-result', delegationId: 'd'.repeat(129), outcome: 'completed', summary: 's' },
    { kind: 'delegation-result', delegationId: 'd', outcome: 'completed', summary: long },
    { kind: 'delegation-result', delegationId: 'd', outcome: 'completed', summary: 's', cost: 1 },
  ];
  for (const response of malformed) {
    const respond = { ...session, nativeRequestId, response } as RespondRequest;
    assert.equal(code(await harness.respond(respond)), 'invalid', JSON.stringify(response).slice(0, 80));
  }
  assert.equal(code(await harness.respond({ ...session, nativeRequestId, response: { kind: 'permission', decision: 'allow' } })), 'ok');
  assert.equal(code(await harness.closeSession(session)), 'ok');
});

test('the scripted harness resumes only after an unfinished close', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session, events } = await started(harness);
  await harness.submitTurn({ ...session, turnId: 't1', text: 'permission' });
  assert.equal((await events.next()).value?.kind, 'permission-request');
  const resume = { ...START, generation: 2, workingDirectory: '/moved', nativeSessionId: session.nativeSessionId };
  const closed = harness.closeSession(session);
  const resumed = harness.resumeSession(resume);
  const raced = harness.resumeSession(resume);
  assert.deepEqual([code(await closed), code(await resumed), code(await raced)], ['ok', 'ok', 'precondition-failed']);
  const next = { ...session, generation: 2 };
  const subscribed = await harness.events(next);
  assert.ok(subscribed.ok);
  const fresh = subscribed.value[Symbol.asyncIterator]();
  assert.deepEqual(await harness.terminalProgram(next), ok({ argv: ['scripted-terminal'], workingDirectory: '/moved' }));
  await harness.submitTurn({ ...next, turnId: 't2', text: 'permission' });
  const request = (await fresh.next()).value as HarnessEventData;
  assert.ok(request.kind === 'permission-request');
  const allow = { ...next, nativeRequestId: request.nativeRequestId, response: { kind: 'permission', decision: 'allow' } } as const;
  assert.equal(code(await harness.respond(allow)), 'ok');
  assert.deepEqual([(await fresh.next()).value?.kind, (await fresh.next()).value], ['output', { kind: 'turn-ended', turnId: 't2', outcome: 'completed' }]);
  assert.equal(code(await harness.closeSession(next)), 'ok');
  assert.deepEqual(await drain(fresh), ['session-ended']);
  assert.deepEqual(await drain(events), ['turn-ended:interrupted', 'session-ended']);
  assert.equal(harness.actionRuns(), 1);
});

test('the scripted harness never lets a resume overlap a close', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session, events } = await started(harness);
  await harness.submitTurn({ ...session, turnId: 't1', text: 'long' });
  const resume = { ...START, generation: 2, nativeSessionId: session.nativeSessionId };
  const early = harness.resumeSession(resume);
  const closed = harness.closeSession(session);
  assert.deepEqual([code(await early), code(await closed)], ['precondition-failed', 'ok']);
  assert.deepEqual(await drain(events), ['output', 'turn-ended:interrupted', 'session-ended']);
  const next = { ...session, generation: 2 };
  const reclosed = harness.closeSession(session);
  const resumed = harness.resumeSession(resume);
  assert.deepEqual([code(await reclosed), code(await resumed)], ['ok', 'ok']);
  assert.equal(code(await harness.closeSession(next)), 'ok');
});

test('a request expires with its turn', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session, events } = await started(harness);
  const allow = { kind: 'permission', decision: 'allow' } as const;
  await harness.submitTurn({ ...session, turnId: 't1', text: 'permission' });
  const answered = (await events.next()).value as HarnessEventData;
  assert.ok(answered.kind === 'permission-request');
  assert.equal(code(await harness.respond({ ...session, nativeRequestId: answered.nativeRequestId, response: allow })), 'ok');
  assert.deepEqual([(await events.next()).value?.kind, (await events.next()).value?.kind], ['output', 'turn-ended']);
  assert.equal(code(await harness.respond({ ...session, nativeRequestId: answered.nativeRequestId, response: allow })), 'conflict');
  await harness.submitTurn({ ...session, turnId: 't2', text: 'permission' });
  const interrupted = (await events.next()).value as HarnessEventData;
  assert.ok(interrupted.kind === 'permission-request');
  assert.equal(code(await harness.interrupt({ ...session, turnId: 't2' })), 'ok');
  assert.equal(code(await harness.respond({ ...session, nativeRequestId: interrupted.nativeRequestId, response: allow })), 'not-found');
  assert.equal(code(await harness.closeSession(session)), 'ok');
  assert.deepEqual(await drain(events), ['turn-ended:interrupted', 'session-ended']);
  assert.equal(harness.actionRuns(), 1);
});

test('the scripted harness rejects a malformed request as invalid', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session } = await started(harness);
  const call = (operation: AgentHarnessOperation, request: unknown): Promise<Result<unknown>> =>
    (harness[operation] as (request: unknown) => Promise<Result<unknown>>).call(harness, request);
  const operations: readonly AgentHarnessOperation[] = [
    'startSession', 'resumeSession', 'events', 'submitTurn', 'interrupt', 'respond', 'terminalProgram', 'closeSession',
  ];
  const allow = { kind: 'permission', decision: 'allow' };
  const full = { ...START, ...session, turnId: 'tx', text: 'x', nativeRequestId: 'r', response: allow };
  for (const operation of operations) {
    for (const request of [null, 'request', { ...full, generation: 0 }, { ...full, generation: 1.5 }, { ...full, generation: Number.NaN }]) {
      assert.equal(code(await call(operation, request)), 'invalid', `${operation} ${JSON.stringify(request)?.slice(0, 40)}`);
    }
    assert.equal(code(await call(operation, { ...full, nativeSessionId: 'n'.repeat(129) })), operation === 'startSession' ? 'conflict' : 'invalid', operation);
  }
  const malformed: readonly [AgentHarnessOperation, unknown][] = [
    ['startSession', { ...START, sessionId: '' }],
    ['startSession', { ...START, sessionId: 's'.repeat(129) }],
    ['startSession', { ...START, workingDirectory: 'w'.repeat(1025) }],
    ['startSession', { ...START, stateDirectory: 7 }],
    ['startSession', { ...START, credential: null }],
    ['startSession', { ...START, credential: { mechanism: 'subscription-token' } }],
    ['submitTurn', { ...session, turnId: '', text: 'x' }],
    ['submitTurn', { ...session, turnId: 't'.repeat(129), text: 'x' }],
    ['submitTurn', { ...session, turnId: 't', text: null }],
    ['interrupt', { ...session, turnId: '' }],
    ['respond', { ...session, nativeRequestId: '', response: allow }],
    ['respond', { ...session, nativeRequestId: 'r', response: null }],
    ['respond', { ...session, nativeRequestId: 'r' }],
  ];
  for (const [operation, request] of malformed) {
    assert.equal(code(await call(operation, request)), 'invalid', `${operation} ${JSON.stringify(request)?.slice(0, 60)}`);
  }
  assert.equal(code(await harness.closeSession(session)), 'ok');
});

test('the scripted harness keeps a native session ID within a label', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const handle = await harness.startSession({ ...START, sessionId: 's'.repeat(128) });
  assert.equal(code(parseOperationResult('startSession', handle)), 'ok');
  assert.ok(handle.ok);
  assert.equal(code(await harness.closeSession({ nativeSessionId: handle.value.nativeSessionId, generation: 1 })), 'ok');
});

test('the scripted harness splits long output into several events', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const { session, events } = await started(harness);
  const outputsOf = async (turnId: string): Promise<string[]> => {
    const outputs: string[] = [];
    for (let event = (await events.next()).value; event.kind !== 'turn-ended'; event = (await events.next()).value) {
      assert.equal(code(parseHarnessEvent(event, parsed())), 'ok', event.kind);
      if (event.kind === 'output' && event.turnId === turnId) outputs.push(event.text);
    }
    return outputs;
  };
  const long = 'x'.repeat(2 * MAX_HARNESS_TEXT_LENGTH + 1);
  await harness.submitTurn({ ...session, turnId: 't1', text: long });
  const fallback = await outputsOf('t1');
  assert.deepEqual([fallback.length, fallback.join('')], [3, long]);
  await harness.submitTurn({ ...session, turnId: 't2', text: 'delegate' });
  const request = (await events.next()).value as HarnessEventData;
  assert.ok(request.kind === 'delegation-request');
  const summary = 's'.repeat(MAX_HARNESS_TEXT_LENGTH);
  const result = { kind: 'delegation-result', delegationId: 'd'.repeat(128), outcome: 'completed', summary } as const;
  assert.equal(code(await harness.respond({ ...session, nativeRequestId: request.nativeRequestId, response: result })), 'ok');
  const echo = await outputsOf('t2');
  assert.deepEqual([echo.length, echo.join('')], [2, `${result.delegationId} completed: ${summary}`]);
  assert.equal(code(await harness.closeSession(session)), 'ok');
});

// Broken harnesses, each breaking one rule, to show the suite finds it.
class ThrowingHarness extends ScriptedAgentHarness {
  override async submitTurn(): Promise<Result<void>> {
    throw new Error('boom');
  }
}

class RepeatAnswerHarness extends ScriptedAgentHarness {
  override async respond(request: RespondRequest): Promise<Result<void>> {
    const result = await super.respond(request);
    return !result.ok && result.error.code === 'conflict' ? ok(undefined) : result;
  }
}

class DenyRunsHarness extends ScriptedAgentHarness {
  override async respond(request: RespondRequest): Promise<Result<void>> {
    const response = request.response.kind === 'permission' ? { kind: 'permission' as const, decision: 'allow' } : request.response;
    return super.respond({ ...request, response });
  }
}

class DroppedAnswerHarness extends ScriptedAgentHarness {
  override async respond(request: RespondRequest): Promise<Result<void>> {
    const response = request.response.kind === 'input' ? { kind: 'input' as const, text: 'something else' } : request.response;
    return super.respond({ ...request, response });
  }
}

class UndeclaredTerminalHarness extends ScriptedAgentHarness {
  override async terminalProgram(): Promise<Result<TerminalProgramData>> {
    return ok({ argv: ['sh'], workingDirectory: '/' });
  }
}

class NoResultHarness extends ScriptedAgentHarness {
  override async interrupt(): Promise<Result<void>> {
    return 'done' as unknown as Result<void>;
  }
}

class HangingHarness extends ScriptedAgentHarness {
  override interrupt(): Promise<Result<void>> {
    return new Promise(() => undefined);
  }
}

class WrongCodeHarness extends ScriptedAgentHarness {
  override async submitTurn(request: TurnRequest): Promise<Result<void>> {
    const result = await super.submitTurn(request);
    return !result.ok && result.error.code === 'conflict' ? err(failure('invalid', 'x')) : result;
  }
}

class ChangedSessionIdHarness extends ScriptedAgentHarness {
  override async resumeSession(request: ResumeSessionRequest): Promise<Result<SessionHandleData>> {
    const result = await super.resumeSession(request);
    return result.ok ? ok({ nativeSessionId: 'another' }) : result;
  }
}

class StrayEventHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    if (!events.ok) return events;
    const source = events.value;
    return ok((async function* stray() {
      yield { kind: 'output', turnId: 'stray', text: 'x' } as const;
      yield { kind: 'output', turnId: 'stray', text: 'x', extra: 1 } as unknown as HarnessEventData;
      yield* source;
      yield { kind: 'output', turnId: 'stray', text: 'late' } as const;
    })());
  }
}

// After a resume, it replays an event of a turn of the first generation.
class ReplayHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    if (!events.ok || request.generation === 1) return events;
    const source = events.value;
    return ok((async function* replay() {
      yield { kind: 'output', turnId: 'turn-1', text: 'again' } as const;
      yield* source;
    })());
  }
}

class SilentHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    return events.ok ? ok({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }) }) : events;
  }
}

class ThrowingEventsHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    if (!events.ok) return events;
    return ok({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('broken stream')),
        return: () => { throw new Error('no return'); },
      }),
    });
  }
}

// Events that resolve at once and never match, so the timer never fires.
class EndlessEventsHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    const usage = { kind: 'account-signal', signal: 'usage', usage: 0.5 } as const;
    return events.ok ? ok({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: false, value: usage }) }) }) : events;
  }
}

class UnfencedCloseHarness extends ScriptedAgentHarness {
  override async closeSession(request: SessionRequest): Promise<Result<void>> {
    const result = await super.closeSession(request);
    return !result.ok && result.error.code === 'precondition-failed' ? ok(undefined) : result;
  }
}

class CountedCloseHarness extends ScriptedAgentHarness {
  readonly closed: string[] = [];

  override async closeSession(request: SessionRequest): Promise<Result<void>> {
    this.closed.push(request.nativeSessionId);
    return super.closeSession(request);
  }
}

class FailingCloseHarness extends ScriptedAgentHarness {
  override async closeSession(): Promise<Result<void>> {
    return err(failure('internal', 'cannot close'));
  }
}

class UniterableEventsHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    return events.ok ? ok({ [Symbol.asyncIterator]: () => { throw new Error('no iterator'); } }) : events;
  }
}

// It accepts a late answer to any request it has issued.
class LateAnswerHarness extends ScriptedAgentHarness {
  readonly #issued = new Set<string>();

  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    if (!events.ok) return events;
    const source = events.value;
    const issued = this.#issued;
    return ok((async function* record() {
      for await (const event of source) {
        if ('nativeRequestId' in event) issued.add(event.nativeRequestId);
        yield event;
      }
    })());
  }

  override async respond(request: RespondRequest): Promise<Result<void>> {
    const result = await super.respond(request);
    const late = !result.ok && result.error.code === 'not-found' && this.#issued.has(request.nativeRequestId);
    return late ? ok(undefined) : result;
  }
}

// Its events yield a malformed iterator result instead of an event.
class MalformedStepHarness extends ScriptedAgentHarness {
  readonly #step: () => unknown;

  constructor(step: () => unknown) {
    super(OPTIONS);
    this.#step = step;
  }

  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    const next = async (): Promise<IteratorResult<HarnessEventData>> => this.#step() as IteratorResult<HarnessEventData>;
    return events.ok ? ok({ [Symbol.asyncIterator]: () => ({ next }) }) : events;
  }
}

// It answers one operation's failure code with another one.
class MiscodedHarness extends ScriptedAgentHarness {
  constructor(operation: AgentHarnessOperation, from: FailureCode, to: FailureCode) {
    super(OPTIONS);
    const original = this[operation] as (request: unknown) => Promise<Result<unknown>>;
    const miscoded = async (request: unknown): Promise<Result<unknown>> => {
      const result = await original.call(this, request);
      return !result.ok && result.error.code === from ? err(failure(to, 'miscoded')) : result;
    };
    Object.defineProperty(this, operation, { value: miscoded });
  }
}

// It refuses to close a session whose harness exited on its own.
class ExitedCloseHarness extends ScriptedAgentHarness {
  readonly #exited = new Set<string>();

  override async exitHarness(nativeSessionId: string): Promise<void> {
    this.#exited.add(nativeSessionId);
    await super.exitHarness(nativeSessionId);
  }

  override async closeSession(request: SessionRequest): Promise<Result<void>> {
    return this.#exited.has(request.nativeSessionId) ? err(failure('precondition-failed', 'exited')) : super.closeSession(request);
  }
}

// It issues the IDs that the suite once used for an unknown session or
// request, which a harness may choose.
class CollidingIdsHarness extends ScriptedAgentHarness {
  protected override nativeSessionIdFor(count: number): string {
    return count === 1 ? 'unknown' : `unknown-${count}`;
  }

  protected override nativeRequestIdFor(_generation: number, count: number): string {
    return count === 1 ? 'unknown-request' : `unknown-request-${count}`;
  }
}

test('the suite reports a late answer, a malformed iterator result, and a miscoded rule', async () => {
  const messages = async (harness: ScriptedAgentHarness): Promise<string[]> =>
    (await findingsOf(harness)).map((finding) => finding.message);
  const has = (found: readonly string[], label: string): boolean => found.some((message) => message.startsWith(label));
  assert.ok(has(await messages(new LateAnswerHarness(OPTIONS)), 'response after the turn ended'));
  const throwing = (field: string) => () => Object.defineProperty({}, field, { get: () => { throw new Error(field); } });
  const steps: readonly [string, () => unknown][] = [
    ['null', () => null], ['undefined', () => undefined], ['a string', () => 'event'],
    ['a non-boolean done', () => ({ done: 'yes', value: undefined })], ['throwing done', throwing('done')], ['throwing value', throwing('value')],
  ];
  for (const [name, step] of steps) {
    const checks = await checksOf(new MalformedStepHarness(step));
    assert.ok(checks.has('event') || checks.has('threw'), name);
  }
  const cases: readonly [string, AgentHarnessOperation, FailureCode, FailureCode][] = [
    ['second start of the session', 'startSession', 'conflict', 'invalid'],
    ['start at generation 2', 'startSession', 'invalid', 'precondition-failed'],
    ['start with an undeclared mechanism', 'startSession', 'invalid', 'precondition-failed'],
    ['start with an empty binary path', 'startSession', 'invalid', 'precondition-failed'],
    ['resume of a running session', 'resumeSession', 'precondition-failed', 'conflict'],
    ['resume that skips a generation', 'resumeSession', 'precondition-failed', 'conflict'],
    ['resume of an unknown session', 'resumeSession', 'not-found', 'precondition-failed'],
    ['resume at generation 0', 'resumeSession', 'invalid', 'precondition-failed'],
    ['events of an unknown session', 'events', 'not-found', 'precondition-failed'],
    ['interrupt of an unknown session', 'interrupt', 'not-found', 'precondition-failed'],
    ['response of an unknown session', 'respond', 'not-found', 'precondition-failed'],
    ['terminal of an unknown session', 'terminalProgram', 'not-found', 'precondition-failed'],
    ['close of an unknown session', 'closeSession', 'not-found', 'precondition-failed'],
    ['events at generation 0', 'events', 'invalid', 'precondition-failed'],
    ['turn at generation 1.5', 'submitTurn', 'invalid', 'precondition-failed'],
    ['interrupt at generation 0', 'interrupt', 'invalid', 'precondition-failed'],
    ['response at generation 1.5', 'respond', 'invalid', 'precondition-failed'],
    ['terminal at generation 0', 'terminalProgram', 'invalid', 'precondition-failed'],
    ['close at generation 1.5', 'closeSession', 'invalid', 'precondition-failed'],
  ];
  for (const [label, operation, from, to] of cases) {
    assert.ok(has(await messages(new MiscodedHarness(operation, from, to)), label), label);
  }
  assert.ok(has(await messages(new ExitedCloseHarness(OPTIONS)), 'close after the harness exited'));
});

test('the suite never names an ID the harness issued as unknown', async () => {
  assert.deepEqual(await findingsOf(new CollidingIdsHarness(OPTIONS)), []);
});

test('the suite reports each broken rule', async () => {
  const cases: readonly [string, ScriptedAgentHarness, string, Partial<AgentHarnessConformanceFixture>?][] = [
    ['throwing operation', new ThrowingHarness(OPTIONS), 'threw'],
    ['second response accepted', new RepeatAnswerHarness(OPTIONS), 'outcome'],
    ['deny runs the action', new DenyRunsHarness(OPTIONS), 'outcome'],
    ['answer not delivered', new DroppedAnswerHarness(OPTIONS), 'outcome'],
    ['undeclared terminal', new UndeclaredTerminalHarness({ ...OPTIONS, capabilities: REQUIRED_ONLY }), 'undeclared-capability'],
    ['no Result', new NoResultHarness(OPTIONS), 'result'],
    ['hanging operation', new HangingHarness(OPTIONS), 'timeout'],
    ['wrong failure code', new WrongCodeHarness(OPTIONS), 'outcome'],
    ['changed native session ID', new ChangedSessionIdHarness(OPTIONS), 'result'],
    ['stray events', new StrayEventHarness(OPTIONS), 'event'],
    ['replay after resume', new ReplayHarness(OPTIONS), 'event'],
    ['silent events', new SilentHarness(OPTIONS), 'timeout'],
    ['throwing events', new ThrowingEventsHarness(OPTIONS), 'threw'],
    ['events without an iterator', new UniterableEventsHarness(OPTIONS), 'threw'],
    ['endless immediate events', new EndlessEventsHarness(OPTIONS), 'timeout'],
    ['close at an earlier generation', new UnfencedCloseHarness(OPTIONS), 'outcome'],
    ['forgotten context', new ScriptedAgentHarness({ ...OPTIONS, script: { ...SCRIPT, recall: [{ output: 'no idea' }] } }), 'outcome'],
    ['wrong outcome', new ScriptedAgentHarness({ ...OPTIONS, script: { ...SCRIPT, remember: [{ end: 'interrupted' }] } }), 'outcome'],
    ['limit without signal', new ScriptedAgentHarness({ ...OPTIONS, script: { ...SCRIPT, 'account limit': [{ end: 'account-limit-reached' }] } }), 'event'],
    ['wrong failure', new ScriptedAgentHarness({ ...OPTIONS, script: { ...SCRIPT, 'turn limit': [{ end: 'failed', failure: 'internal' }] } }), 'outcome'],
  ];
  for (const [name, harness, check, overrides] of cases) assert.ok((await checksOf(harness, overrides)).has(check), name);
});

test('the suite closes a session that a scenario left open', async () => {
  const passing = new CountedCloseHarness(OPTIONS);
  assert.deepEqual(await findingsOf(passing), []);
  assert.equal(passing.closed.filter((id) => id === 'scripted-1').length, 2);
  assert.ok(!passing.closed.includes('scripted-4'));
  const stuck = new CountedCloseHarness({ ...OPTIONS, script: { ...SCRIPT, remember: [{ waitForInterrupt: true }] } });
  const findings = await findingsOf(stuck);
  assert.ok(findings.some((finding) => finding.scenario === 'chat with prompt correlation' && finding.check === 'timeout'));
  assert.ok(stuck.closed.includes('scripted-1'));
  const unclosable = new FailingCloseHarness(OPTIONS);
  const ended: string[] = [];
  await findingsOf(unclosable, { endHarness: async (session) => { ended.push(session.nativeSessionId); } });
  assert.ok(ended.includes('scripted-1'));
});

test('the suite reports a broken fixture', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  const noPrompts = { prompts: { remember: 'remember', recall: 'recall', permission: 'permission', longRunning: 'long' } };
  assert.ok((await checksOf(harness, noPrompts)).has('fixture'));
  const noExit = new ScriptedAgentHarness(OPTIONS);
  assert.ok((await checksOf(noExit, { endHarness: async () => undefined })).has('timeout'));
  const brokenProbe = new ScriptedAgentHarness(OPTIONS);
  assert.ok((await checksOf(brokenProbe, { actionRuns: async () => { throw new Error('gone'); } })).has('fixture'));
  for (const runs of [0.5, -1, 2 ** 53]) {
    assert.ok((await checksOf(new ScriptedAgentHarness(OPTIONS), { actionRuns: async () => runs })).has('fixture'), String(runs));
  }
  for (const recalled of ['', '  \n']) {
    assert.deepEqual(await findingsOf(new ScriptedAgentHarness(OPTIONS), { recalled }), [
      { scenario: 'fixture', check: 'fixture', message: 'recalled must not be blank' },
    ]);
  }
  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.deepEqual(await findingsOf(new ScriptedAgentHarness(OPTIONS), { timeoutMs }), [
      { scenario: 'fixture', check: 'fixture', message: 'timeoutMs must be an integer from 1 to 600000' },
    ]);
  }
});

test('the suite stops at an unreadable declaration', async () => {
  const harness = new ScriptedAgentHarness(OPTIONS);
  Object.defineProperty(harness, 'capabilities', { get: () => { throw new Error('no'); } });
  assert.deepEqual(await runAgentHarnessConformance(harness, fixtureFor(harness)), {
    scenarios: 0,
    findings: [{ scenario: 'capabilities', check: 'capabilities', message: 'capabilities could not be read' }],
  });
  const undeclared = new ScriptedAgentHarness({ capabilities: { ...ALL, supported: ['chat'] }, script: SCRIPT });
  const findings = await findingsOf(undeclared);
  assert.equal(findings[0]?.check, 'capabilities');
});
