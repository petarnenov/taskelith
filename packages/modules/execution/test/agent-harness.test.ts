import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, type Result } from '@taskelith/kernel';
import {
  ACCOUNT_SIGNALS,
  AGENT_HARNESS_PORT_VERSION,
  CLASSIFIED_OPERATION_KINDS,
  DELEGATION_OUTCOMES,
  HARNESS_CAPABILITIES,
  HARNESS_FAILURES,
  HARNESS_PLATFORMS,
  PERMISSION_DECISIONS,
  REQUIRED_HARNESS_CAPABILITIES,
  SESSION_END_REASONS,
  SUBSCRIPTION_MECHANISMS,
  ScriptedAgentHarness,
  TURN_OUTCOMES,
  parseAgentHarnessCapabilities,
  parseHarnessEvent,
  runAgentHarnessConformance,
  type AgentHarnessCapabilities,
  type AgentHarnessConformanceFixture,
  type HarnessEventData,
  type ParsedAgentHarnessCapabilities,
  type RespondRequest,
  type ScriptStep,
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

const ALL: AgentHarnessCapabilities = {
  supported: [...HARNESS_CAPABILITIES],
  subscriptionMechanisms: ['subscription-token'],
  accountSignals: ['usage', 'limit', 'reset-time'],
  binaries: [{ platform: 'linux-x64', version: '1.0.0', sha256: 'a'.repeat(64) }],
};

const REQUIRED_ONLY: AgentHarnessCapabilities = { ...ALL, supported: [...REQUIRED_HARNESS_CAPABILITIES] };

const SCRIPT: Readonly<Record<string, readonly ScriptStep[]>> = {
  answer: [{ output: 'hello' }, { usage: 0.25 }],
  permission: [{ permission: 'push the branch', operation: { kind: 'push', ref: 'refs/heads/task-1' } }, { output: 'done' }],
  long: [{ output: 'working' }, { waitForInterrupt: true }],
  input: [{ input: 'which file?' }, { output: 'thanks' }],
  delegate: [{ delegation: 'review the change' }, { limit: { resetsAt: '2026-10-26T12:00:00Z' } }],
};

const FIXTURE: AgentHarnessConformanceFixture = {
  workingDirectory: '/work',
  stateDirectory: '/state',
  credential: { mechanism: 'subscription-token', secret: 'not-a-secret' },
  prompts: { answer: 'answer', permission: 'permission', longRunning: 'long', input: 'input', delegation: 'delegate' },
  timeoutMs: 200,
};

function scripted(capabilities: AgentHarnessCapabilities = ALL): ScriptedAgentHarness {
  return new ScriptedAgentHarness({ capabilities, script: SCRIPT });
}

function parsed(capabilities: AgentHarnessCapabilities = ALL): ParsedAgentHarnessCapabilities {
  const result = parseAgentHarnessCapabilities(capabilities);
  assert.ok(result.ok);
  return result.value;
}

function code(result: Result<unknown>): string {
  return result.ok ? 'ok' : result.error.code;
}

test('the contract values are fixed', () => {
  assert.equal(AGENT_HARNESS_PORT_VERSION, '0.1.0');
  for (const [name, actual, expected] of CONTRACT_VALUES) {
    assert.deepEqual(actual, expected, name);
    assert.ok(Object.isFrozen(actual), `${name} is frozen`);
  }
});

test('the scripted harness passes the suite with every capability', async () => {
  const report = await runAgentHarnessConformance(scripted(), FIXTURE);
  assert.deepEqual(report.findings, []);
  assert.equal(report.scenarios, 7);
});

test('the scripted harness passes the suite with only the required capabilities', async () => {
  const report = await runAgentHarnessConformance(scripted(REQUIRED_ONLY), FIXTURE);
  assert.deepEqual(report.findings, []);
});

test('capability declarations are checked', () => {
  const cases: readonly [string, unknown][] = [
    ['missing required', { ...ALL, supported: ['chat'] }],
    ['unknown capability', { ...ALL, supported: [...ALL.supported, 'browser'] }],
    ['duplicate', { ...ALL, supported: [...ALL.supported, 'chat'] }],
    ['no mechanism', { ...ALL, subscriptionMechanisms: [] }],
    ['reset-time without limit', { ...ALL, accountSignals: ['reset-time'] }],
    ['no binary', { ...ALL, binaries: [] }],
    ['bad digest', { ...ALL, binaries: [{ platform: 'linux-x64', version: '1', sha256: 'ABC' }] }],
    ['platform twice', { ...ALL, binaries: [ALL.binaries[0], ALL.binaries[0]] }],
    ['unknown platform', { ...ALL, binaries: [{ ...ALL.binaries[0], platform: 'windows-x64' }] }],
    ['extra field', { ...ALL, telemetry: true }],
    ['not an object', 'capabilities'],
    ['class instance', new (class { supported = []; })()],
    ['array with a hole', { ...ALL, supported: Array(5) }],
    ['getter', Object.defineProperty({ ...ALL }, 'supported', { get: () => [], enumerable: true })],
    ['throwing proxy', new Proxy({}, { ownKeys: () => { throw new Error('no'); } })],
  ];
  for (const [name, raw] of cases) assert.equal(code(parseAgentHarnessCapabilities(raw)), 'invalid', name);
  assert.deepEqual(parsed().supported, ALL.supported);
});

test('harness events are parsed against the declaration', () => {
  const capabilities = parsed();
  const valid: readonly HarnessEventData[] = [
    { kind: 'output', turnId: 't', text: 'x' },
    { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's' },
    { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref: 'refs/heads/a' } },
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
  const invalid: readonly [string, unknown, ParsedAgentHarnessCapabilities][] = [
    ['unknown kind', { kind: 'browse' }, capabilities],
    ['undeclared request', { kind: 'input-request', turnId: 't', nativeRequestId: 'r', prompt: 'p' }, minimal],
    ['undeclared usage', { kind: 'account-signal', signal: 'usage', usage: 0 }, minimal],
    ['undeclared limit', { kind: 'account-signal', signal: 'limit' }, minimal],
    ['undeclared reset', { kind: 'account-signal', signal: 'limit', resetsAt: '2026-10-26T12:00:00Z' }, parsed({ ...ALL, accountSignals: ['limit'] })],
    ['unknown signal', { kind: 'account-signal', signal: 'load' }, capabilities],
    ['usage above one', { kind: 'account-signal', signal: 'usage', usage: 2 }, capabilities],
    ['bad reset time', { kind: 'account-signal', signal: 'limit', resetsAt: 'tomorrow' }, capabilities],
    ['failure on success', { kind: 'turn-ended', turnId: 't', outcome: 'completed', failure: 'internal' }, capabilities],
    ['failed without failure', { kind: 'turn-ended', turnId: 't', outcome: 'failed' }, capabilities],
    ['unknown outcome', { kind: 'turn-ended', turnId: 't', outcome: 'success' }, capabilities],
    ['empty turn ID', { kind: 'output', turnId: '', text: 'x' }, capabilities],
    ['long text', { kind: 'output', turnId: 't', text: 'x'.repeat(65_537) }, capabilities],
    ['missing field', { kind: 'output', turnId: 't' }, capabilities],
    ['extra field', { kind: 'output', turnId: 't', text: 'x', secret: 'y' }, capabilities],
    ['empty request ID', { kind: 'permission-request', turnId: 't', nativeRequestId: '', summary: 's' }, capabilities],
    ['long summary', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 'x'.repeat(65_537) }, capabilities],
    ['short ref', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref: 'main' } }, capabilities],
    ['unknown operation', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'delete', ref: 'refs/heads/a' } }, capabilities],
    ['bad ref', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: { kind: 'push', ref: '' } }, capabilities],
    ['malformed operation', { kind: 'permission-request', turnId: 't', nativeRequestId: 'r', summary: 's', operation: 'push' }, capabilities],
    ['bad exit code', { kind: 'session-ended', reason: 'exited', exitCode: 256 }, capabilities],
    ['bad signal', { kind: 'session-ended', reason: 'exited', signal: 'kill' }, capabilities],
    ['unknown reason', { kind: 'session-ended', reason: 'gone' }, capabilities],
    ['accessor', Object.defineProperty({ kind: 'output', turnId: 't' }, 'text', { get: () => 'x', enumerable: true }), capabilities],
    ['null', null, capabilities],
  ];
  for (const [name, raw, declared] of invalid) assert.equal(code(parseHarnessEvent(raw, declared)), 'invalid', name);
});

test('the scripted harness keeps its own rules outside the suite', async () => {
  const harness = new ScriptedAgentHarness({
    capabilities: ALL,
    script: { fail: [{ output: 'x' }, { end: 'failed', failure: 'transport' }] },
    terminal: { argv: ['shell'], workingDirectory: '/work' },
  });
  const start = { sessionId: 's', generation: 1, workingDirectory: '/w', stateDirectory: '/s', credential: FIXTURE.credential };
  assert.equal(code(await harness.startSession({ ...start, generation: 0 })), 'invalid');
  assert.equal(code(await harness.startSession({ ...start, credential: { mechanism: 'device-login', secret: '' } })), 'invalid');
  const handle = await harness.startSession(start);
  assert.ok(handle.ok);
  assert.equal(code(await harness.startSession(start)), 'conflict');
  const session: SessionRequest = { nativeSessionId: handle.value.nativeSessionId, generation: 1 };
  const resume = { ...start, generation: 2, nativeSessionId: session.nativeSessionId };
  assert.equal(code(await harness.resumeSession(resume)), 'precondition-failed');
  assert.equal(code(await harness.resumeSession({ ...resume, nativeSessionId: 'unknown' })), 'not-found');
  assert.deepEqual(await harness.terminalProgram(session), { ok: true, value: { argv: ['shell'], workingDirectory: '/work' } });
  const events = await harness.events(session);
  assert.ok(events.ok);
  assert.equal(code(await harness.submitTurn({ ...session, turnId: 't', text: 'fail' })), 'ok');
  const malformed = { ...session, nativeRequestId: 'r', response: { kind: 'permission', decision: 'maybe' } } as RespondRequest;
  assert.equal(code(await harness.respond(malformed)), 'invalid');
  assert.equal(code(await harness.closeSession({ ...session, generation: 2 })), 'precondition-failed');
  assert.equal(code(await harness.closeSession({ ...session, nativeSessionId: 'unknown' })), 'not-found');
  assert.equal(code(await harness.closeSession(session)), 'ok');
  const kinds: string[] = [];
  for await (const event of events.value) kinds.push(event.kind === 'turn-ended' ? `${event.kind}:${event.outcome}` : event.kind);
  assert.deepEqual(kinds, ['output', 'turn-ended:failed', 'session-ended']);
});

test('the scripted harness rejects a response of the wrong kind', async () => {
  const harness = scripted();
  const start = { sessionId: 's', generation: 1, workingDirectory: '/w', stateDirectory: '/s', credential: FIXTURE.credential };
  const handle = await harness.startSession(start);
  assert.ok(handle.ok);
  const session: SessionRequest = { nativeSessionId: handle.value.nativeSessionId, generation: 1 };
  const events = await harness.events(session);
  assert.ok(events.ok);
  await harness.submitTurn({ ...session, turnId: 't', text: 'permission' });
  const iterator = events.value[Symbol.asyncIterator]();
  const request = (await iterator.next()).value as HarnessEventData;
  assert.equal(request.kind, 'permission-request');
  const nativeRequestId = request.kind === 'permission-request' ? request.nativeRequestId : '';
  assert.equal(code(await harness.respond({ ...session, nativeRequestId, response: { kind: 'input', text: 'x' } })), 'invalid');
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
    return !result.ok && result.error.code === 'conflict' ? { ok: true, value: undefined } : result;
  }
}

class UndeclaredTerminalHarness extends ScriptedAgentHarness {
  override async terminalProgram(): Promise<Result<TerminalProgramData>> {
    return { ok: true, value: { argv: ['sh'], workingDirectory: '/' } };
  }
}

class NoResultHarness extends ScriptedAgentHarness {
  override async interrupt(): Promise<Result<void>> {
    return 'done' as unknown as Result<void>;
  }
}

class WrongCodeHarness extends ScriptedAgentHarness {
  override async submitTurn(request: TurnRequest): Promise<Result<void>> {
    const result = await super.submitTurn(request);
    return !result.ok && result.error.code === 'conflict' ? err(failure('invalid', 'x')) : result;
  }
}

class StrayEventHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    if (!events.ok) return events;
    const source = events.value;
    return {
      ok: true,
      value: (async function* stray() {
        yield { kind: 'output', turnId: 'stray', text: 'x' } as const;
        yield { kind: 'output', turnId: 'stray', text: 'x', extra: 1 } as unknown as HarnessEventData;
        yield* source;
        yield { kind: 'output', turnId: 'stray', text: 'late' } as const;
      })(),
    };
  }
}

class SilentHarness extends ScriptedAgentHarness {
  override async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const events = await super.events(request);
    return events.ok ? { ok: true, value: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }) } } : events;
  }
}

async function checksOf(harness: ScriptedAgentHarness, fixture: AgentHarnessConformanceFixture = FIXTURE): Promise<Set<string>> {
  const report = await runAgentHarnessConformance(harness, fixture);
  return new Set(report.findings.map((finding) => finding.check));
}

test('the suite reports each broken rule', async () => {
  const options = { capabilities: ALL, script: SCRIPT };
  assert.ok((await checksOf(new ThrowingHarness(options))).has('threw'));
  assert.ok((await checksOf(new RepeatAnswerHarness(options))).has('outcome'));
  assert.ok((await checksOf(new UndeclaredTerminalHarness({ ...options, capabilities: REQUIRED_ONLY }))).has('undeclared-capability'));
  assert.ok((await checksOf(new NoResultHarness(options))).has('result'));
  assert.ok((await checksOf(new WrongCodeHarness(options))).has('outcome'));
  assert.ok((await checksOf(new StrayEventHarness(options))).has('event'));
  assert.ok((await checksOf(new SilentHarness(options))).has('timeout'));
  const noPrompts = { ...FIXTURE, prompts: { answer: 'answer', permission: 'permission', longRunning: 'long' } };
  assert.ok((await checksOf(scripted(), noPrompts)).has('fixture'));
  const wrongOutcome = new ScriptedAgentHarness({ ...options, script: { ...SCRIPT, answer: [{ end: 'interrupted' }] } });
  assert.ok((await checksOf(wrongOutcome)).has('outcome'));
});

test('the suite stops at an unreadable declaration', async () => {
  const harness = scripted();
  Object.defineProperty(harness, 'capabilities', { get: () => { throw new Error('no'); } });
  assert.deepEqual(await runAgentHarnessConformance(harness, FIXTURE), {
    scenarios: 0,
    findings: [{ scenario: 'capabilities', check: 'capabilities', message: 'capabilities could not be read' }],
  });
  const undeclared = new ScriptedAgentHarness({ capabilities: { ...ALL, supported: ['chat'] }, script: SCRIPT });
  const report = await runAgentHarnessConformance(undeclared, FIXTURE);
  assert.equal(report.findings[0]?.check, 'capabilities');
});
