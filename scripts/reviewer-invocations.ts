import { isRecord } from './findings-common.ts';
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

// The captured output: stdout and stderr together, the CLI's own log,
// and the stdout of the model source.
export interface ReviewerOutput {
  readonly output: string;
  readonly cliLog?: string;
  readonly modelSource?: string;
}

// A run setting, such as the effort, that the reviewer's output reports.
export interface ReportedSetting {
  readonly name: string;
  readonly expected: string;
  readonly reported: string | undefined;
}

export interface ReviewerInvocation {
  readonly reviewer: Required<Reviewer>;
  readonly environment: readonly string[];
  readonly writesCliLog: boolean;
  invocation(context: InvocationContext): Invocation;
  // A command run after the review whose stdout reports the model.
  modelSource?(session: string): Invocation;
  session(output: ReviewerOutput): string | undefined;
  // The model reported, as the key names it; undefined when none is.
  model(output: ReviewerOutput): string | undefined;
  // Further settings that the output reports and the run must match.
  settings?(output: ReviewerOutput): readonly ReportedSetting[];
}

// Every reviewer gets these and nothing else of the caller's environment.
export const BASE_ENVIRONMENT: readonly string[] = ['PATH', 'HOME', 'USER', 'LANG', 'TERM', 'TMPDIR'];

const CODEX_ENVIRONMENT = ['CODEX_HOME'];
const CLAUDE_ENVIRONMENT = ['CLAUDE_CONFIG_DIR'];
const OPENCODE_ENVIRONMENT = ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'OPENCODE_CONFIG'];

function headerValue(output: string, name: string): string | undefined {
  return new RegExp(`^${name}:[ \\t]*(\\S+)[ \\t]*$`, 'm').exec(output)?.[1];
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output.split('\n').flatMap((line) => {
    if (!line.trimStart().startsWith('{')) return [];
    const value = parsedJson(line);
    return isRecord(value) ? [value] : [];
  });
}

// One model, or every model reported when they differ.
function reported(models: readonly string[]): string | undefined {
  const distinct = [...new Set(models)];
  return distinct.length === 0 ? undefined : distinct.join(', ');
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
    session: ({ output }) => headerValue(output, 'session id'),
    model: ({ output }) => headerValue(output, 'model'),
    settings: ({ output }) => [
      { name: 'effort', expected: effort, reported: headerValue(output, 'reasoning effort') },
      { name: 'sandbox', expected: 'read-only', reported: headerValue(output, 'sandbox') },
    ],
  };
}

// The last result line of the stream; its modelUsage names the models.
function claudeResult(output: string): Record<string, unknown> | undefined {
  return jsonLines(output).filter((line) => line.type === 'result').at(-1);
}

function claudeModel(model: string, output: string): string | undefined {
  const usage = claudeResult(output)?.modelUsage;
  const models = isRecord(usage) ? Object.keys(usage) : [];
  return models.includes(model) ? model : models[0];
}

function claude(model: string, effort: string): ReviewerInvocation {
  return {
    reviewer: { harness: 'claude', model, variant: effort },
    environment: CLAUDE_ENVIRONMENT,
    writesCliLog: false,
    invocation: ({ promptText }) => ({
      command: 'claude',
      args: [
        '-p', '--model', model, '--effort', effort, '--permission-mode', 'plan',
        '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', '--output-format', 'stream-json', '--verbose',
        '--', promptText,
      ],
      stdin: 'closed',
    }),
    session: ({ output }) => text(claudeResult(output)?.session_id),
    model: ({ output }) => claudeModel(model, output),
  };
}

// Each assistant message of the export names provider, model, and variant.
function exportedModel(variant: string, exported: string | undefined): string | undefined {
  const session = exported === undefined ? undefined : parsedJson(exported);
  const messages = isRecord(session) && Array.isArray(session.messages) ? session.messages : [];
  const assistant = messages.filter((message) => isRecord(message) && message.type === 'assistant');
  return reported(assistant.map((message: Record<string, unknown>) => modelName(variant, message.model)));
}

function modelName(variant: string, model: unknown): string {
  if (!isRecord(model)) return 'none';
  const name = `${text(model.providerID) ?? '?'}/${text(model.id) ?? '?'}`;
  return model.variant === variant ? name : `${name}#${text(model.variant) ?? '?'}`;
}

// The default variant is the one that runs when -m names none.
function opencode(model: string, variant: string): ReviewerInvocation {
  const modelArgument = variant === 'default' ? model : `${model}#${variant}`;
  return {
    reviewer: { harness: 'opencode', model, variant },
    environment: OPENCODE_ENVIRONMENT,
    writesCliLog: false,
    invocation: ({ change, promptText }) => ({
      command: 'opencode',
      args: ['run', '--standalone', '--agent', 'reviewer', '-m', modelArgument, '--format', 'json', '--title', change, '--', promptText],
      stdin: 'closed',
    }),
    modelSource: (session) => ({
      command: 'opencode', args: ['session', 'export', '--standalone', '--sanitize', session], stdin: 'closed',
    }),
    session: ({ output }) => jsonLines(output).map((line) => text(line.sessionID)).find(Boolean),
    model: ({ modelSource }) => exportedModel(variant, modelSource),
  };
}

// The CLI's own log names the model by its label, never by its ID.
const AGY_MODEL_LINE = /Propagating selected model override to backend: label="([^"\n]*)"/g;

function agyModel(model: string, label: string, cliLog: string | undefined): string | undefined {
  const labels = [...(cliLog ?? '').matchAll(AGY_MODEL_LINE)].map((match) => match[1]!);
  return reported(labels.map((found) => (found === label ? model : found)));
}

function antigravity(model: string, label: string, effort: string): ReviewerInvocation {
  return {
    reviewer: { harness: 'agy', model, variant: effort },
    environment: [],
    writesCliLog: true,
    // -p takes the prompt as its value, so a leading dash is safe.
    invocation: ({ promptText, cliLog }) => ({
      command: 'agy',
      args: ['-p', promptText, '--model', model, '--effort', effort, '--mode', 'plan', '--output-format', 'json', '--log-file', cliLog],
      stdin: 'closed',
    }),
    session: ({ output }) => jsonLines(output).map((line) => text(line.conversation_id)).find(Boolean),
    model: ({ cliLog }) => agyModel(model, label, cliLog),
  };
}

// docs/agent-task-protocol.md "Reviewer invocations" and the efforts of
// governance "Authorized reviewers" (policy version 7).
const INVOCATIONS: readonly ReviewerInvocation[] = [
  codex('gpt-6.1-sol', 'medium'),
  opencode('opencode-go/kimi-k3.1-pro', 'high'),
  antigravity('gemini-4-argon-medium', 'Gemini 4 Argon (Medium)', 'medium'),
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
