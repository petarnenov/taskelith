import { closeSync, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Claude Code UserPromptSubmit hook (decision D4): warns when the session's
// estimated context nears 150,000 tokens; never blocks, never quotes it.

export const DEFAULT_WARN_TOKENS = 140_000;
export const TAIL_BYTES = 1024 * 1024;
export const BYTES_PER_TOKEN = 4;

export interface Estimate {
  readonly tokens: number;
  readonly source: 'usage' | 'size';
}

interface Usage {
  readonly input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

interface TranscriptLine {
  readonly type?: string;
  readonly isSidechain?: boolean;
  readonly message?: { readonly usage?: Usage };
}

// The input of the last request is the context; its output is not counted.
function usageTokens(usage: Usage): number {
  return (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
}

// The newest main-thread assistant usage is the context the model last saw,
// also after /compact, which the transcript size does not show.
export function lastUsageTokens(tail: string): number | undefined {
  const lines = tail.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(lines[index]) as TranscriptLine;
    } catch {
      continue;
    }
    const usage = entry.message?.usage;
    if (entry.type === 'assistant' && entry.isSidechain !== true && usage !== undefined) return usageTokens(usage);
  }
  return undefined;
}

export function readTail(path: string, bytes: number): { readonly text: string; readonly size: number } {
  const descriptor = openSync(path, 'r');
  try {
    const { size } = fstatSync(descriptor);
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    return { text: buffer.toString('utf8'), size };
  } finally {
    closeSync(descriptor);
  }
}

export function estimateContext(path: string): Estimate {
  const { text, size } = readTail(path, TAIL_BYTES);
  const tokens = lastUsageTokens(text);
  if (tokens !== undefined) return { tokens, source: 'usage' };
  return { tokens: Math.round(size / BYTES_PER_TOKEN), source: 'size' };
}

export function warnThreshold(value: string | undefined): number {
  const parsed = Number(value);
  return value !== undefined && Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WARN_TOKENS;
}

export function warning(estimate: Estimate, threshold: number): string | undefined {
  if (estimate.tokens < threshold) return undefined;
  const basis = estimate.source === 'usage' ? 'from the last response usage' : 'from the transcript size';
  return `Context warning: about ${Math.round(estimate.tokens / 1000)}k tokens (an estimate ${basis}), at or above ${threshold}. `
    + 'Follow docs/agent-task-protocol.md "Context size": record what a reset would lose, tell the owner, and recommend /compact or /clear.';
}

// Any failure means no warning: the hook must never block or break a prompt.
export function hookOutput(input: string, environment: Readonly<Record<string, string | undefined>>): string {
  try {
    const { transcript_path: path } = JSON.parse(input) as { transcript_path?: unknown };
    if (typeof path !== 'string' || path === '') return '';
    const message = warning(estimateContext(path), warnThreshold(environment.TASKELITH_CONTEXT_WARN_TOKENS));
    return message === undefined ? '' : `${message}\n`;
  } catch {
    return '';
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    input = '';
  }
  process.stdout.write(hookOutput(input, process.env));
  process.exitCode = 0;
}
