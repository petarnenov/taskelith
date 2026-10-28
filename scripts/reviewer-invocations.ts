import { reviewerKey, type Reviewer } from './review-findings.ts';

// The fixed invocation of every authorized reviewer, the variables its
// CLI may see, and how its session and model are read from its output.

// What a reviewer run needs; the prompt and logs lie outside the worktree.
export interface InvocationContext {
  readonly worktree: string;
  readonly change: string;
  readonly promptFile: string;
  readonly promptText: string;
  readonly cliLog: string;
}

// 'prompt' feeds the prompt file on stdin; 'closed' is < /dev/null.
export type Stdin = 'prompt' | 'closed';

export interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdin: Stdin;
}

// The captured output: stdout and stderr together, and the CLI's own log.
export interface ReviewerOutput {
  readonly output: string;
  readonly cliLog?: string;
}

export interface Confirmation {
  readonly session?: string;
  // The model the reviewer reported; undefined when its output has none.
  readonly model?: string;
}

export interface ReviewerInvocation {
  readonly reviewer: Required<Reviewer>;
  readonly environment: readonly string[];
  readonly writesCliLog: boolean;
  // Where the model is confirmed when the output does not report it.
  readonly modelNote?: string;
  invocation(context: InvocationContext): Invocation;
  confirm(output: ReviewerOutput): Confirmation;
}

// Every reviewer gets these and nothing else of the caller's environment.
export const BASE_ENVIRONMENT: readonly string[] = ['PATH', 'HOME', 'USER', 'LANG', 'TERM', 'TMPDIR'];

const CODEX_ENVIRONMENT = ['CODEX_HOME'];
const CLAUDE_ENVIRONMENT = ['CLAUDE_CONFIG_DIR'];
const OPENCODE_ENVIRONMENT = ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'OPENCODE_CONFIG'];
const OPENCODE_MODEL_NOTE = 'the stored assistant messages of the session record the model and variant';

function headerValue(output: string, name: string): string | undefined {
  return new RegExp(`^${name}:[ \\t]*(\\S+)[ \\t]*$`, 'm').exec(output)?.[1];
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output.split('\n').flatMap((line) => {
    if (!line.trimStart().startsWith('{')) return [];
    try {
      const value: unknown = JSON.parse(line);
      return typeof value === 'object' && value !== null ? [value as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function codex(model: string, effort: string): ReviewerInvocation {
  return {
    reviewer: { harness: 'codex', model, variant: effort },
    environment: CODEX_ENVIRONMENT,
    writesCliLog: false,
    invocation: ({ worktree }) => ({
      command: 'codex',
      args: ['exec', '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-s', 'read-only', '-C', worktree, '-'],
      stdin: 'prompt',
    }),
    confirm: ({ output }) => ({ session: headerValue(output, 'session id'), model: headerValue(output, 'model') }),
  };
}

// The last result line of the stream; its modelUsage names the models.
function claudeConfirmation(model: string, output: string): Confirmation {
  const result = jsonLines(output).filter((line) => line.type === 'result').at(-1);
  if (result === undefined) return {};
  const usage = result.modelUsage;
  const models = typeof usage === 'object' && usage !== null ? Object.keys(usage) : [];
  return { session: text(result.session_id), model: models.includes(model) ? model : models[0] };
}

function claude(model: string, effort: string): ReviewerInvocation {
  return {
    reviewer: { harness: 'claude', model, variant: effort },
    environment: CLAUDE_ENVIRONMENT,
    writesCliLog: false,
    invocation: ({ promptText }) => ({
      command: 'claude',
      args: [
        '-p', promptText, '--model', model, '--effort', effort, '--permission-mode', 'plan',
        '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', '--output-format', 'stream-json', '--verbose',
      ],
      stdin: 'closed',
    }),
    confirm: ({ output }) => claudeConfirmation(model, output),
  };
}

// The default variant is the one that runs when -m names none.
function opencode(model: string, variant: string): ReviewerInvocation {
  const modelArgument = variant === 'default' ? model : `${model}#${variant}`;
  return {
    reviewer: { harness: 'opencode', model, variant },
    environment: OPENCODE_ENVIRONMENT,
    writesCliLog: false,
    modelNote: OPENCODE_MODEL_NOTE,
    invocation: ({ change, promptText }) => ({
      command: 'opencode',
      args: ['run', '--standalone', '--agent', 'reviewer', '-m', modelArgument, '--format', 'json', '--title', change, promptText],
      stdin: 'closed',
    }),
    confirm: ({ output }) => ({ session: jsonLines(output).map((line) => text(line.sessionID)).find(Boolean) }),
  };
}

function antigravity(model: string, effort: string): ReviewerInvocation {
  return {
    reviewer: { harness: 'agy', model, variant: effort },
    environment: [],
    writesCliLog: true,
    invocation: ({ promptText, cliLog }) => ({
      command: 'agy',
      args: ['-p', promptText, '--model', model, '--effort', effort, '--mode', 'plan', '--output-format', 'json', '--log-file', cliLog],
      stdin: 'closed',
    }),
    confirm: ({ output, cliLog }) => ({
      session: jsonLines(output).map((line) => text(line.conversation_id)).find(Boolean),
      model: cliLog?.includes(model) ? model : undefined,
    }),
  };
}

// docs/agent-task-protocol.md "Reviewer invocations" and the efforts of
// governance "Authorized reviewers" (policy version 7).
const INVOCATIONS: readonly ReviewerInvocation[] = [
  codex('gpt-6.1-sol', 'medium'),
  opencode('opencode-go/kimi-k3.1-pro', 'high'),
  antigravity('gemini-4-argon-medium', 'medium'),
  opencode('opencode-go/deepseek-v4-pro', 'high'),
  claude('claude-fable-5-1', 'medium'),
  opencode('opencode-go/kimi-k2.7-code', 'default'),
  codex('gpt-6-astra', 'medium'),
  opencode('opencode-go/qwen3.8-max', 'medium'),
  claude('claude-opus-5-5', 'high'),
];

export const REVIEWER_INVOCATIONS: ReadonlyMap<string, ReviewerInvocation> = new Map(
  INVOCATIONS.map((invocation) => [reviewerKey(invocation.reviewer), invocation]),
);

// The variables a reviewer's CLI sees: the base ones and its own, if set.
export function reviewerEnvironment(
  invocation: ReviewerInvocation,
  inherited: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const names = [...BASE_ENVIRONMENT, ...invocation.environment];
  const kept = names.flatMap((name) => {
    const value = inherited[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return Object.fromEntries(kept);
}
