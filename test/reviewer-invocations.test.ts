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

test('the table holds the nine authorized reviewers under canonical keys', () => {
  assert.deepEqual([...REVIEWER_INVOCATIONS.keys()], [
    'codex gpt-6.1-sol#medium',
    'opencode opencode-go/kimi-k3.1-pro#high',
    'agy gemini-4-argon-medium#medium',
    'opencode opencode-go/deepseek-v4-pro#high',
    'claude claude-fable-5-1#medium',
    'opencode opencode-go/kimi-k2.7-code#default',
    'codex gpt-6-astra#medium',
    'opencode opencode-go/qwen3.8-max#medium',
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
      '-p', 'Review the change.', '--model', 'claude-opus-5-5', '--effort', 'high', '--permission-mode', 'plan',
      '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', '--output-format', 'stream-json', '--verbose',
    ],
    stdin: 'closed',
  });
  assert.deepEqual(invocationOf('claude claude-fable-5-1#medium').invocation(CONTEXT).args.slice(2, 6),
    ['--model', 'claude-fable-5-1', '--effort', 'medium']);
});

test('OpenCode runs standalone with -m, its variant, and stdin closed, never --auto', () => {
  assert.deepEqual(invocationOf('opencode opencode-go/kimi-k3.1-pro#high').invocation(CONTEXT), {
    command: 'opencode',
    args: [
      'run', '--standalone', '--agent', 'reviewer', '-m', 'opencode-go/kimi-k3.1-pro#high',
      '--format', 'json', '--title', 'some-change', 'Review the change.',
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

test('the session and model come from each reviewer\'s output', () => {
  assert.deepEqual(invocationOf('codex gpt-6.1-sol#medium').confirm({ output: CODEX_OUTPUT }),
    { session: '01a181b7-647f-7d90-abe6-9892355ab6ca', model: 'gpt-6.1-sol' });
  assert.deepEqual(invocationOf('claude claude-opus-5-5#high').confirm({ output: CLAUDE_OUTPUT }),
    { session: 'd58a9021-a9a3-40ca-8b5d-d7e096f085bb', model: 'claude-opus-5-5' });
  assert.deepEqual(invocationOf('opencode opencode-go/kimi-k2.7-code#default').confirm({ output: OPENCODE_OUTPUT }),
    { session: 'ses_e8458010bffet2OY8uVNIDFp33' });
  const agy = invocationOf('agy gemini-4-argon-medium#medium');
  assert.deepEqual(agy.confirm({ output: '{"conversation_id":"conv-1","response":"ok"}\n', cliLog: 'model=gemini-4-argon-medium\n' }),
    { session: 'conv-1', model: 'gemini-4-argon-medium' });
  assert.deepEqual(agy.confirm({ output: 'not json\n' }), { session: undefined, model: undefined });
});

test('a Claude Code run without a result line or with another model confirms nothing', () => {
  const claude = invocationOf('claude claude-opus-5-5#high');
  assert.deepEqual(claude.confirm({ output: CLAUDE_OUTPUT.split('\n')[0]! }), {});
  const other = CLAUDE_OUTPUT.replace('"modelUsage":{"claude-opus-5-5"', '"modelUsage":{"claude-sonnet-x"');
  assert.equal(claude.confirm({ output: other }).model, 'claude-sonnet-x');
  assert.deepEqual(invocationOf('codex gpt-6.1-sol#medium').confirm({ output: 'error: quota\n' }), { session: undefined, model: undefined });
});
