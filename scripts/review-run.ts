import { execFileSync, spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { closeSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunResult } from './findings-common.ts';
import { reviewerKey, type Reviewer, type Role } from './review-findings.ts';
import { PASSES_FILE, type PassSummary } from './review-passes.ts';
import { ROUTE_FILE } from './review-route.ts';
import { routeDependencies, runRoute } from './review-route-command.ts';
import { changeDirectory } from './review-route-features.ts';
import { checkReviewFiles, openFreshLog, openPrompt, readPrompt, ReviewFileError } from './review-files.ts';
import {
  isRecord,
  REVIEWER_INVOCATIONS,
  reviewerEnvironment,
  type Invocation,
  type ReviewerInvocation,
} from './reviewer-invocations.ts';
import {
  checkStamp, currentToolchain, decideProfile, gitIn, mergeBase, type Environment, type Git, type Toolchain,
} from './verify-stamp.ts';

// make review: the route gate before pass 1, and the reviewer's fixed
// invocation in a clean environment; the worker writes the pass line.

export const REVIEW_USAGE = 'usage: make review CHANGE=<change> PASS=<1-9> ROLE=<A|B> '
  + 'REVIEWER=<reviewer key> PROMPT=<prompt file> LOG=<log file>';

export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;
export const EXIT_ROUTED = 3;
export const EXIT_REVIEWER_FAILED = 4;

const CHANGE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const MAX_PASS = 9;
const CLI_LOG_SUFFIX = '.cli.log';
// Started with -i and the allowlist, the reviewer inherits nothing else.
const ENV_COMMAND = '/usr/bin/env';

export interface ReviewRequest {
  readonly change: string;
  readonly pass: number;
  readonly role: Role;
  readonly reviewer: ReviewerInvocation;
  readonly promptFile: string;
  readonly log: string;
}

export interface ReviewDependencies {
  readonly root: string;
  readonly environment: Environment;
  readonly toolchain: () => Toolchain;
  // The route command of make findings, for the change named.
  readonly route: (change: string) => Promise<RunResult>;
}

// A precondition that does not hold; the message says what to do.
class ReviewRefusal extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_REFUSED) {
    super(message);
    this.exitCode = exitCode;
  }
}

export async function runReview(args: readonly string[], dependencies: ReviewDependencies): Promise<RunResult> {
  try {
    const request = parseRequest(args, dependencies.root);
    const gate = await routeGate(request, dependencies);
    const advice = recommendation(dependencies.root, request);
    const run = await runReviewer(request, dependencies);
    return { exitCode: 0, stdout: [...gate, ...advice, ...run].join('\n') + '\n', stderr: '' };
  } catch (error) {
    const exitCode = refusalExitCode(error);
    if (exitCode === undefined) throw error;
    return { exitCode, stdout: '', stderr: `make review: ${(error as Error).message}\n` };
  }
}

function refusalExitCode(error: unknown): number | undefined {
  if (error instanceof ReviewRefusal) return error.exitCode;
  return error instanceof ReviewFileError ? EXIT_REFUSED : undefined;
}

function usage(reason: string): ReviewRefusal {
  const keys = [...REVIEWER_INVOCATIONS.keys()].map((key) => `  ${key}`).join('\n');
  return new ReviewRefusal(`${reason}\n${REVIEW_USAGE}\nReviewer keys:\n${keys}`, EXIT_USAGE);
}

export function parseRequest(args: readonly string[], root: string): ReviewRequest {
  if (args.length !== 6 || args.some((arg) => arg === '')) throw usage('every argument is required');
  const [change, pass, role, key, promptFile, log] = args as [string, string, string, string, string, string];
  if (!CHANGE_NAME.test(change) || change === 'archive') throw usage(`CHANGE "${change}" is no change name`);
  if (!/^[1-9]$/.test(pass) || Number(pass) > MAX_PASS) throw usage(`PASS "${pass}" is none of 1 to ${MAX_PASS}`);
  if (role !== 'A' && role !== 'B') throw usage(`ROLE "${role}" is neither A nor B`);
  const reviewer = REVIEWER_INVOCATIONS.get(key);
  if (reviewer === undefined) throw usage(`REVIEWER "${key}" is no authorized reviewer key`);
  if (!existsSync(join(root, changeDirectory(change)))) throw new ReviewRefusal(`${changeDirectory(change)} is no active change`);
  const request = { change, pass: Number(pass), role, reviewer, promptFile: resolve(promptFile), log: resolve(log) } as const;
  checkReviewFiles(root, { prompt: request.promptFile, logs: writtenLogs(request) });
  refuseSummarizedPass(root, request);
  return request;
}

function cliLogOf(request: ReviewRequest): string {
  return `${request.log}${CLI_LOG_SUFFIX}`;
}

// The logs that the run writes: its own, and the CLI's where it has one.
function writtenLogs(request: ReviewRequest): string[] {
  return request.reviewer.writesCliLog ? [request.log, cliLogOf(request)] : [request.log];
}

function passesPath(root: string, change: string): string {
  return join(root, changeDirectory(change), PASSES_FILE);
}

// A pass with a line has run; refusing it early saves a second run.
function refuseSummarizedPass(root: string, { change, pass }: ReviewRequest): void {
  const path = passesPath(root, change);
  if (!existsSync(path)) throw new ReviewRefusal(`${changeDirectory(change)}/${PASSES_FILE} is missing`);
  const summarized = readFileSync(path, 'utf8').split('\n').some((line) => {
    try {
      const summary = JSON.parse(line) as Partial<PassSummary>;
      return summary.pass === pass && summary.artifact === undefined;
    } catch {
      return false;
    }
  });
  if (summarized) throw new ReviewRefusal(`pass ${pass} already has a line in ${PASSES_FILE}`);
}

type RouteState = 'fresh' | 'missing' | 'stale';

interface RoutedRevision {
  readonly devCommit?: unknown;
  readonly headCommit?: unknown;
}

function routePath(root: string, change: string): string {
  return join(root, changeDirectory(change), ROUTE_FILE);
}

// The parsed route object; undefined when the file holds none.
function routeRecord(path: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Fresh when made at the current merge base for a commit whose tree
// equals HEAD's outside the change's own directory.
export function routeState(root: string, change: string, git: Git): RouteState {
  const path = routePath(root, change);
  if (!existsSync(path)) return 'missing';
  const routed = routeRecord(path) as RoutedRevision | undefined;
  if (routed === undefined || typeof routed.headCommit !== 'string' || routed.devCommit !== mergeBase(git)) return 'stale';
  try {
    git(['diff', '--quiet', routed.headCommit, 'HEAD', '--', '.', `:(exclude)${changeDirectory(change)}`]);
    return 'fresh';
  } catch {
    return 'stale';
  }
}

// Pass 1 needs a route of the current tree; later passes never re-route.
async function routeGate(request: ReviewRequest, dependencies: ReviewDependencies): Promise<string[]> {
  if (request.pass !== 1) return [];
  const { root, environment } = dependencies;
  const git = gitIn(root);
  const state = routeState(root, request.change, git);
  if (state === 'fresh') return [`route: ${ROUTE_FILE} was made for this tree`];
  const route = `${changeDirectory(request.change)}/${ROUTE_FILE}`;
  const why = state === 'missing' ? `${route} is missing` : `${route} was made for another tree`;
  const context = { root, git, toolchain: dependencies.toolchain(), environment };
  const stamp = checkStamp(context, decideProfile(git, environment).profile);
  if (!stamp.verified) {
    throw new ReviewRefusal(`${why}, and ${stamp.message}; commit the change and pass make verify first`);
  }
  if (state === 'stale') rmSync(routePath(root, request.change));
  const routed = await dependencies.route(request.change);
  if (routed.exitCode !== 0) throw new ReviewRefusal(`${why}; routing failed:\n${routed.stderr.trimEnd()}`);
  const recordWhy = state === 'stale' ? ', record in verification.md why it was routed again' : '';
  throw new ReviewRefusal(
    `${why}, so it was routed:\n${routed.stdout.trimEnd()}\n`
      + `Commit ${route}${recordWhy}, run make verify and make record, then run make review again.`,
    EXIT_ROUTED,
  );
}

// route.json only recommends: the authorized effort stays (governance
// "Routed effort", policy version 7); pass 3 keeps pass 1's reviewer.
function recommendation(root: string, request: ReviewRequest): string[] {
  const path = routePath(root, request.change);
  const rule = existsSync(path) ? routeRecord(path)?.rule : undefined;
  const passes = isRecord(rule) && Array.isArray(rule.passes) ? rule.passes : [];
  const recommended = plannedReviewer(passes[request.pass === 2 ? 1 : 0]);
  if (recommended === undefined) return [];
  const chosen = reviewerKey(request.reviewer.reviewer);
  const key = reviewerKey(recommended);
  if (key === chosen) return [`route: recommends ${chosen}`];
  return [`route: recommends ${key}; ${chosen} runs at its authorized effort, and another reviewer A goes to the coordinator`];
}

function plannedReviewer(plan: unknown): Reviewer | undefined {
  const reviewer = isRecord(plan) ? plan.reviewer : undefined;
  if (!isRecord(reviewer) || typeof reviewer.harness !== 'string' || typeof reviewer.model !== 'string') return undefined;
  const variant = typeof reviewer.variant === 'string' ? { variant: reviewer.variant } : {};
  return { harness: reviewer.harness, model: reviewer.model, ...variant };
}

async function runReviewer(request: ReviewRequest, dependencies: ReviewDependencies): Promise<string[]> {
  const { reviewer } = request;
  const cliLog = cliLogOf(request);
  const invocation = reviewer.invocation({
    worktree: dependencies.root,
    change: request.change,
    promptFile: request.promptFile,
    promptText: readPrompt(request.promptFile),
    cliLog,
  });
  const environment = reviewerEnvironment(reviewer, dependencies.environment);
  const run: CleanRun = { env: environment, cwd: dependencies.root, log: request.log };
  if (reviewer.writesCliLog) closeSync(openFreshLog(cliLog));
  const status = await launch(invocation, run, request.promptFile);
  const key = reviewerKey(reviewer.reviewer);
  if (status !== 0) throw failed(`${key} exited with status ${status}`, request.log);
  const output = readFileSync(request.log, 'utf8');
  const cliText = reviewer.writesCliLog ? readFileSync(cliLog, 'utf8') : undefined;
  const session = reviewer.session({ output, cliLog: cliText });
  if (session === undefined || !SESSION.test(session)) throw failed(`${key} reported no valid session ID`, request.log);
  const modelSource = await readModelSource(reviewer, session, run);
  confirmModel(reviewer, reviewer.model({ output, cliLog: cliText, modelSource }), request.log);
  return [
    `review: ${invocation.command} ${shownArgs(invocation).join(' ')}`,
    `environment: ${Object.keys(environment).join(' ')}`,
    `log: ${request.log}`,
    `session: ${session}`,
    `model: ${reviewer.reviewer.model} (reported)`,
    `${PASSES_FILE} template: ${passLineTemplate(request, session)}`,
    `No line was written: after the report, replace each count placeholder and append the line to ${PASSES_FILE}.`,
  ];
}

function confirmModel(reviewer: ReviewerInvocation, model: string | undefined, log: string): void {
  const expected = reviewer.reviewer.model;
  if (model !== expected) throw failed(`${reviewerKey(reviewer.reviewer)} reported model ${model ?? 'none'}, not ${expected}`, log);
}

// How a reviewer command runs: its environment, directory, and log.
interface CleanRun {
  readonly env: Record<string, string>;
  readonly cwd: string;
  readonly log: string;
}

// The stdout of the reviewer's model source, in the same environment.
async function readModelSource(reviewer: ReviewerInvocation, session: string, run: CleanRun): Promise<string | undefined> {
  if (reviewer.modelSource === undefined) return undefined;
  const source = reviewer.modelSource(session);
  const child = startClean(source, run, ['ignore', 'pipe', 'ignore']);
  const chunks: Buffer[] = [];
  child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
  const status = await exitStatus(child);
  const name = `${source.command} ${source.args.slice(0, 2).join(' ')}`;
  if (status !== 0) throw failed(`${name} exited with status ${status}`, run.log);
  return Buffer.concat(chunks).toString('utf8');
}

function failed(reason: string, log: string): ReviewRefusal {
  return new ReviewRefusal(`${reason}; no pass line written, see ${log}. A failed attempt is no pass.`, EXIT_REVIEWER_FAILED);
}

// The prompt text is long and already in its file, so it is not echoed.
function shownArgs({ args }: Invocation): string[] {
  return args.map((arg) => (arg.length > 200 || arg.includes('\n') ? '<prompt>' : arg));
}

async function launch(invocation: Invocation, run: CleanRun, promptFile: string): Promise<number> {
  const out = openFreshLog(run.log);
  try {
    const stdin = invocation.stdin === 'prompt' ? openPrompt(promptFile) : 'ignore';
    try {
      return await exitStatus(startClean(invocation, run, [stdin, out, out]));
    } finally {
      if (typeof stdin === 'number') closeSync(stdin);
    }
  } finally {
    closeSync(out);
  }
}

// Node.js adds variables such as NODE_V8_COVERAGE to a child's env;
// env -i drops them before the reviewer starts.
function startClean(invocation: Invocation, { env, cwd, log }: CleanRun, stdio: StdioOptions): ChildProcess {
  const assignments = Object.entries(env).map(([name, value]) => `${name}=${value}`);
  try {
    return spawn(ENV_COMMAND, ['-i', ...assignments, invocation.command, ...invocation.args], { cwd, env: {}, stdio });
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code ?? (error as Error).name;
    throw failed(`${invocation.command} could not start: ${reason}`, log);
  }
}

function exitStatus(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolveStatus) => {
    child.on('error', () => resolveStatus(127));
    child.on('close', (code, signal) => resolveStatus(code ?? (signal === null ? 1 : 128)));
  });
}

// String placeholders fail the pass schema until the worker counts.
function passLineTemplate(request: ReviewRequest, session: string): string {
  const template = {
    change: request.change,
    pass: request.pass,
    role: request.role,
    reviewer: request.reviewer.reviewer,
    session,
    counts: { critical: '<critical>', high: '<high>', medium: '<medium>', low: '<low>' },
  };
  return JSON.stringify(template);
}

// The composition root; the route command reads the inherited credential.
export function routeChange(root: string, change: string): Promise<RunResult> {
  return runRoute(['--change', change], root, routeDependencies(root, process.env));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const result = await runReview(process.argv.slice(2), {
    root,
    environment: process.env,
    toolchain: currentToolchain,
    route: (change) => routeChange(root, change),
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
