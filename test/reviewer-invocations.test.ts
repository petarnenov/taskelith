import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewerKey } from '../scripts/review-findings.ts';
import { CREDENTIAL_VARIABLE } from '../scripts/review-route-jev.ts';
import { reviewerKeyProblems } from '../scripts/reviewer-keys.ts';
import {
  BASE_ENVIRONMENT, REVIEWER_INVOCATIONS, reviewerEnvironment, type InvocationContext, type ReviewerInvocation,
} from '../scripts/reviewer-invocations.ts';

// The invocation table of make review: its fixed flags, its environment
// allowlist, and the session and model read from captured outputs.

const CONTEXT: InvocationContext = {
  worktree: '/work/tree',
  change: 'some-change',
  promptFile: '/scratch/prompt.txt',
  promptText: 'Review the change.',
  cliLog: '/scratch/pass.log.cli.log',
};

function invocationOf(key: string): ReviewerInvocation {
  const invocation = REVIEWER_INVOCATIONS.get(key);
  assert.ok(invocation, key);
  return invocation;
}

// Fails before the change: opus had only its #high key.
test('the table holds the nine authorized reviewers, opus at medium and high', () => {
  assert.deepEqual([...REVIEWER_INVOCATIONS.keys()], [
    'codex gpt-6.1-sol#medium',
    'opencode opencode-go/kimi-k3.1-pro#high',
    'agy gemini-4-argon-medium#medium',
    'opencode opencode-go/deepseek-v4-pro#high',
    'claude claude-fable-5-1#medium',
    'opencode opencode-go/kimi-k2.7-code#default',
    'codex gpt-6-astra#medium',
    'opencode opencode-go/qwen3.8-max#medium',
    'claude claude-opus-5-5#medium',
    'claude claude-opus-5-5#high',
  ]);
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    assert.equal(reviewerKey(invocation.reviewer), key);
    assert.deepEqual(reviewerKeyProblems(invocation.reviewer), [], key);
  }
});

test('Codex runs read-only in the worktree with the prompt on stdin', () => {
  assert.deepEqual(invocationOf('codex gpt-6.1-sol#medium').invocation(CONTEXT), {
    command: 'codex',
    args: ['exec', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="medium"', '-s', 'read-only', '-C', '/work/tree', '-'],
    stdin: 'prompt',
  });
  assert.deepEqual(invocationOf('codex gpt-6-astra#medium').invocation(CONTEXT).args.slice(1, 5),
    ['-m', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"']);
});

test('Claude Code runs in plan mode without editing tools and with stdin closed', () => {
  assert.deepEqual(invocationOf('claude claude-opus-5-5#high').invocation(CONTEXT), {
    command: 'claude',
    args: [
      '-p', '--model', 'claude-opus-5-5', '--effort', 'high', '--permission-mode', 'plan',
      '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', '--output-format', 'stream-json', '--verbose',
      '--', 'Review the change.',
    ],
    stdin: 'closed',
  });
  assert.deepEqual(invocationOf('claude claude-fable-5-1#medium').invocation(CONTEXT).args.slice(1, 5),
    ['--model', 'claude-fable-5-1', '--effort', 'medium']);
  assert.deepEqual(invocationOf('claude claude-opus-5-5#medium').invocation(CONTEXT).args.slice(1, 5),
    ['--model', 'claude-opus-5-5', '--effort', 'medium']);
});

test('OpenCode runs standalone with -m, its variant, and stdin closed, never --auto', () => {
  assert.deepEqual(invocationOf('opencode opencode-go/kimi-k3.1-pro#high').invocation(CONTEXT), {
    command: 'opencode',
    args: [
      'run', '--standalone', '--agent', 'reviewer', '-m', 'opencode-go/kimi-k3.1-pro#high',
      '--format', 'json', '--title', 'some-change', '--', 'Review the change.',
    ],
    stdin: 'closed',
  });
  const defaultVariant = invocationOf('opencode opencode-go/kimi-k2.7-code#default').invocation(CONTEXT);
  assert.equal(defaultVariant.args[5], 'opencode-go/kimi-k2.7-code');
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    assert.equal(invocation.invocation(CONTEXT).args.includes('--auto'), false, key);
  }
});

test('Antigravity runs in plan mode and writes its own log', () => {
  assert.deepEqual(invocationOf('agy gemini-4-argon-medium#medium').invocation(CONTEXT), {
    command: 'agy',
    args: [
      '-p', 'Review the change.', '--model', 'gemini-4-argon-medium', '--effort', 'medium', '--mode', 'plan',
      '--output-format', 'json', '--log-file', '/scratch/pass.log.cli.log',
    ],
    stdin: 'closed',
  });
});

// Antigravity's -p takes the prompt as its value, even one with a dash.
test('a prompt that starts with a dash is never read as an option', () => {
  const dashed = { ...CONTEXT, promptText: '-x Review the change.' };
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    const { args } = invocation.invocation(dashed);
    const at = args.indexOf(dashed.promptText);
    if (at === -1) continue;
    assert.equal(args[at - 1], invocation.reviewer.harness === 'agy' ? '-p' : '--', key);
  }
});

test('the environment keeps only the base variables and the reviewer\'s own', () => {
  const inherited = {
    PATH: '/bin', HOME: '/home/r', USER: 'r', LANG: 'C', TERM: 'xterm', TMPDIR: '/tmp/r',
    [CREDENTIAL_VARIABLE]: 'sentinel-credential', GH_TOKEN: 'sentinel-token', SHELL: '/bin/zsh',
    CODEX_HOME: '/home/r/.codex', CLAUDE_CONFIG_DIR: '/home/r/.claude', XDG_CONFIG_HOME: '/home/r/.config',
  };
  assert.deepEqual(reviewerEnvironment(invocationOf('codex gpt-6.1-sol#medium'), inherited), {
    PATH: '/bin', HOME: '/home/r', USER: 'r', LANG: 'C', TERM: 'xterm', TMPDIR: '/tmp/r', CODEX_HOME: '/home/r/.codex',
  });
  assert.deepEqual(Object.keys(reviewerEnvironment(invocationOf('claude claude-opus-5-5#high'), inherited)),
    [...BASE_ENVIRONMENT, 'CLAUDE_CONFIG_DIR']);
  assert.deepEqual(Object.keys(reviewerEnvironment(invocationOf('opencode opencode-go/kimi-k2.7-code#default'), inherited)),
    [...BASE_ENVIRONMENT, 'XDG_CONFIG_HOME']);
  assert.deepEqual(reviewerEnvironment(invocationOf('agy gemini-4-argon-medium#medium'), { HOME: '/h', GH_TOKEN: 't' }), { HOME: '/h' });
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    assert.equal(invocation.environment.includes(CREDENTIAL_VARIABLE), false, key);
  }
});

// Trimmed copies of captured reviewer logs of 2026-10-28.
const CODEX_OUTPUT = `OpenAI Codex v0.164.0
--------
workdir: /Users/petarnenov/taskelith-worktrees/complete-g2-native-acceptance-rows-macos
model: gpt-6.1-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a181b7-647f-7d90-abe6-9892355ab6ca
--------
user
You are reviewer A (pass 1).
`;

const CLAUDE_OUTPUT = [
  '{"type":"system","subtype":"init","session_id":"d58a9021-a9a3-40ca-8b5d-d7e096f085bb","model":"claude-opus-5-5"}',
  '{"type":"assistant","session_id":"d58a9021-a9a3-40ca-8b5d-d7e096f085bb","message":{"content":[]}}',
  '{"type":"result","subtype":"success","session_id":"d58a9021-a9a3-40ca-8b5d-d7e096f085bb",'
    + '"modelUsage":{"claude-opus-5-5":{"inputTokens":92,"outputTokens":34620}},"result":"Counts: 0"}',
  '',
].join('\n');

const OPENCODE_OUTPUT = [
  '{"type":"step_start","timestamp":1793075972758,"sessionID":"ses_e8458010bffet2OY8uVNIDFp33",'
    + '"part":{"type":"step-start","sessionID":"ses_e8458010bffet2OY8uVNIDFp33"}}',
  '{"type":"text","timestamp":1793075984401,"sessionID":"ses_e8458010bffet2OY8uVNIDFp33","part":{"type":"text"}}',
  '',
].join('\n');

// A sanitized `opencode session export` of 2026-10-27, trimmed.
const OPENCODE_EXPORT = JSON.stringify({
  info: { id: 'ses_e8447b3c8ffe8QYk8bdDlmTmcQ', agent: 'reviewer' },
  messages: [
    { id: 'msg_17bb84e4c001QRs1OqF4R7hXn2', type: 'user', text: '[redacted:text]' },
    {
      id: 'msg_17bb84fb9001KpBN4pNw20NedM', type: 'assistant', agent: 'reviewer',
      model: { id: 'kimi-k2.7-code', providerID: 'opencode-go', variant: 'default' },
    },
  ],
});

// The model line of the CLI's own log of 2026-10-24.
const AGY_LOG = 'I1024 13:19:29.967626     715 model_config_manager.go:340] '
  + 'Propagating selected model override to backend: label="Gemini 4 Argon (Medium)"\n';

test('the session and model come from each reviewer\'s output', () => {
  const codex = invocationOf('codex gpt-6.1-sol#medium');
  assert.equal(codex.session({ output: CODEX_OUTPUT }), '01a181b7-647f-7d90-abe6-9892355ab6ca');
  assert.equal(codex.model({ output: CODEX_OUTPUT }), 'gpt-6.1-sol');
  assert.deepEqual(codex.settings?.({ output: CODEX_OUTPUT }), [
    { name: 'effort', expected: 'medium', reported: 'medium' },
    { name: 'sandbox', expected: 'read-only', reported: 'read-only' },
  ]);
  const claude = invocationOf('claude claude-opus-5-5#high');
  assert.equal(claude.session({ output: CLAUDE_OUTPUT }), 'd58a9021-a9a3-40ca-8b5d-d7e096f085bb');
  assert.equal(claude.model({ output: CLAUDE_OUTPUT }), 'claude-opus-5-5');
  const opencode = invocationOf('opencode opencode-go/kimi-k2.7-code#default');
  assert.equal(opencode.session({ output: OPENCODE_OUTPUT }), 'ses_e8458010bffet2OY8uVNIDFp33');
  assert.equal(opencode.model({ output: OPENCODE_OUTPUT, modelSource: OPENCODE_EXPORT }), 'opencode-go/kimi-k2.7-code');
  const agy = invocationOf('agy gemini-4-argon-medium#medium');
  assert.equal(agy.session({ output: '{"conversation_id":"conv-1","response":"ok"}\n' }), 'conv-1');
  assert.equal(agy.model({ output: '', cliLog: AGY_LOG }), 'gemini-4-argon-medium');
  assert.equal(agy.session({ output: 'not json\n' }), undefined);
});

test('a Claude Code run without a result line or with another model confirms nothing', () => {
  const claude = invocationOf('claude claude-opus-5-5#high');
  assert.equal(claude.session({ output: CLAUDE_OUTPUT.split('\n')[0]! }), undefined);
  assert.equal(claude.model({ output: CLAUDE_OUTPUT.split('\n')[0]! }), undefined);
  const other = CLAUDE_OUTPUT.replace('"modelUsage":{"claude-opus-5-5"', '"modelUsage":{"claude-sonnet-x"');
  assert.equal(claude.model({ output: other }), 'claude-sonnet-x');
  const codex = invocationOf('codex gpt-6.1-sol#medium');
  assert.equal(codex.session({ output: 'error: quota\n' }), undefined);
  assert.equal(codex.model({ output: 'error: quota\n' }), undefined);
  assert.deepEqual(codex.settings?.({ output: 'error: quota\n' }).map(({ reported }) => reported), [undefined, undefined]);
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    assert.equal(invocation.settings === undefined, invocation.reviewer.harness !== 'codex', key);
  }
});

test('OpenCode reads its model from the session export, which names the variant', () => {
  const opencode = invocationOf('opencode opencode-go/kimi-k3.1-pro#high');
  assert.deepEqual(opencode.modelSource?.('ses_1'), {
    command: 'opencode', args: ['session', 'export', '--standalone', '--sanitize', 'ses_1'], stdin: 'closed',
  });
  const exported = (model: unknown) => JSON.stringify({ messages: [{ type: 'assistant', model }] });
  const kimi = { id: 'kimi-k3.1-pro', providerID: 'opencode-go', variant: 'high' };
  assert.equal(opencode.model({ output: '', modelSource: exported(kimi) }), 'opencode-go/kimi-k3.1-pro');
  assert.equal(opencode.model({ output: '', modelSource: exported({ ...kimi, variant: 'default' }) }),
    'opencode-go/kimi-k3.1-pro#default');
  assert.equal(opencode.model({ output: '', modelSource: exported({ ...kimi, id: 'other' }) }), 'opencode-go/other');
  assert.equal(opencode.model({ output: '', modelSource: exported(null) }), 'none');
  assert.equal(opencode.model({ output: '', modelSource: JSON.stringify({ messages: [] }) }), undefined);
  assert.equal(opencode.model({ output: '', modelSource: 'null' }), undefined);
  assert.equal(opencode.model({ output: '' }), undefined);
  const twoModels = JSON.stringify({ messages: [{ type: 'assistant', model: kimi }, { type: 'assistant', model: { ...kimi, id: 'x' } }] });
  assert.equal(opencode.model({ output: '', modelSource: twoModels }), 'opencode-go/kimi-k3.1-pro, opencode-go/x');
  for (const [key, invocation] of REVIEWER_INVOCATIONS) {
    assert.equal(invocation.modelSource === undefined, invocation.reviewer.harness !== 'opencode', key);
  }
});

test('Antigravity confirms only the model label of its own log, not any mention', () => {
  const agy = invocationOf('agy gemini-4-argon-medium#medium');
  const mention = 'requested=gemini-4-argon-medium actual_model=other-model\n';
  assert.equal(agy.model({ output: mention, cliLog: mention }), undefined);
  assert.equal(agy.model({ output: '', cliLog: AGY_LOG.replace('(Medium)', '(Low)') }), 'Gemini 4 Argon (Low)');
  assert.equal(agy.model({ output: '', cliLog: AGY_LOG + AGY_LOG.replace('(Medium)', '(Low)') }),
    'gemini-4-argon-medium, Gemini 4 Argon (Low)');
  assert.equal(agy.model({ output: '' }), undefined);
});
