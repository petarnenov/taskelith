import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_WARN_TOKENS, estimateContext, hookOutput, lastUsageTokens, readTail, TAIL_BYTES, warnThreshold, warning,
} from '../scripts/context-warning.ts';

const repository = resolve(import.meta.dirname, '..');
const SECRET = 'transcript-text-that-must-never-be-printed';

function assistant(input: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: SECRET }], usage: { input_tokens: input, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 500 } },
    ...extra,
  });
}

function withTranscript(lines: readonly string[], body: (path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-context-'));
  try {
    const path = join(directory, 'transcript.jsonl');
    writeFileSync(path, `${lines.join('\n')}\n`);
    body(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the newest main-thread assistant usage is the context', () => {
  const user = JSON.stringify({ type: 'user', message: { content: SECRET } });
  const tail = [assistant(10_000), assistant(150_000, { isSidechain: true }), user, 'not json', assistant(1)].join('\n');
  assert.equal(lastUsageTokens(tail), 1 + 3000, 'output tokens are not counted');
  assert.equal(lastUsageTokens([assistant(100_000), assistant(150_000, { isSidechain: true })].join('\n')), 103_000);
  assert.equal(lastUsageTokens(JSON.stringify({ type: 'assistant', message: { usage: {} } })), 0);
  assert.equal(lastUsageTokens(user), undefined);
});

test('without a usage line the context is estimated from the size', () => {
  withTranscript([JSON.stringify({ type: 'user', message: { content: 'x'.repeat(4000) } })], (path) => {
    const size = readFileSync(path).length;
    assert.deepEqual(estimateContext(path), { tokens: Math.round(size / 4), source: 'size' });
  });
});

test('only the tail of a large transcript is read', () => {
  withTranscript(['x'.repeat(TAIL_BYTES + 10), assistant(140_000)], (path) => {
    const { text, size } = readTail(path, TAIL_BYTES);
    assert.equal(text.length, TAIL_BYTES);
    assert.ok(size > TAIL_BYTES);
    assert.deepEqual(estimateContext(path), { tokens: 143_000, source: 'usage' });
  });
});

test('a warning appears at the threshold and names the protocol section', () => {
  assert.equal(warning({ tokens: DEFAULT_WARN_TOKENS - 1, source: 'usage' }, DEFAULT_WARN_TOKENS), undefined);
  assert.equal(warning({ tokens: 143_500, source: 'usage' }, DEFAULT_WARN_TOKENS),
    'Context warning: about 144k tokens (an estimate from the last response usage), at or above 140000. '
    + 'Follow docs/agent-task-protocol.md "Context size": record what a reset would lose, tell the owner, and recommend /compact or /clear.');
  assert.match(warning({ tokens: 200_000, source: 'size' }, 1000) ?? '', /an estimate from the transcript size/);
});

test('the threshold comes from the environment when it is a positive integer', () => {
  assert.equal(warnThreshold(undefined), DEFAULT_WARN_TOKENS);
  assert.equal(warnThreshold('50000'), 50_000);
  for (const value of ['', '0', '-5', '1.5', 'many']) assert.equal(warnThreshold(value), DEFAULT_WARN_TOKENS, value);
});

test('bad input, a missing transcript, and a small context print nothing', () => {
  assert.equal(hookOutput('not json', {}), '');
  assert.equal(hookOutput('{}', {}), '');
  assert.equal(hookOutput(JSON.stringify({ transcript_path: join(tmpdir(), 'taskelith-no-such-transcript.jsonl') }), {}), '');
  withTranscript([assistant(1000)], (path) => {
    assert.equal(hookOutput(JSON.stringify({ transcript_path: path }), {}), '');
    assert.match(hookOutput(JSON.stringify({ transcript_path: path }), { TASKELITH_CONTEXT_WARN_TOKENS: '4000' }), /^Context warning: about 4k tokens/);
  });
});

test('the hook command warns, exits 0, and never prints transcript content', () => {
  withTranscript([assistant(150_000)], (path) => {
    const run = spawnSync(process.execPath, ['--experimental-strip-types', join(repository, 'scripts/context-warning.ts')], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', transcript_path: path, prompt: SECRET }), encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^Context warning: about 153k tokens/);
    assert.doesNotMatch(run.stdout + run.stderr, new RegExp(SECRET));
  });
  const closed = spawnSync(process.execPath, ['--experimental-strip-types', join(repository, 'scripts/context-warning.ts')], { input: '', encoding: 'utf8' });
  assert.equal(closed.status, 0);
  assert.equal(closed.stdout, '');
});

test('the tracked Claude Code settings run the hook on each prompt with a short timeout', () => {
  const settings = JSON.parse(readFileSync(join(repository, '.claude/settings.json'), 'utf8'));
  const [hook] = settings.hooks.UserPromptSubmit[0].hooks;
  assert.deepEqual(hook, {
    type: 'command',
    command: 'node --experimental-strip-types "$CLAUDE_PROJECT_DIR/scripts/context-warning.ts"',
    timeout: 5,
  });
});
