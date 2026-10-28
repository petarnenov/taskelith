import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunResult } from './findings-common.ts';
import { reviewerKey, type Reviewer, type Role } from './review-findings.ts';
import { PASSES_FILE, type PassSummary } from './review-passes.ts';
import { ROUTE_FILE } from './review-route.ts';
import { routeDependencies, runRoute } from './review-route-command.ts';
import { changeDirectory } from './review-route-features.ts';
import {
  REVIEWER_INVOCATIONS,
  reviewerEnvironment,
  type Invocation,
  type ReviewerInvocation,
} from './reviewer-invocations.ts';
import {
  checkStamp, currentToolchain, decideProfile, gitIn, mergeBase, type Environment, type Git, type Toolchain,
} from './verify-stamp.ts';

// make review: the route gate before pass 1, the reviewer's fixed
// invocation in a clean environment, and its line in passes.jsonl.

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
    if (!(error instanceof ReviewRefusal)) throw error;
    return { exitCode: error.exitCode, stdout: '', stderr: `make review: ${error.message}\n` };
  }
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
  refuseInsideWorktree(root, request.promptFile, 'PROMPT');
  refuseInsideWorktree(root, request.log, 'LOG');
  if (!existsSync(request.promptFile) || !statSync(request.promptFile).isFile()) {
    throw new ReviewRefusal(`PROMPT ${request.promptFile} is no file`);
  }
  refuseSummarizedPass(root, request);
  return request;
}

// Files inside the worktree would change the reviewer's snapshot.
function refuseInsideWorktree(root: string, path: string, name: string): void {
  const parent = existsSync(dirname(path)) ? realpathSync(dirname(path)) : dirname(path);
  const fromRoot = relative(realpathSync(root), join(parent, basename(path)));
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (!outside) throw new ReviewRefusal(`${name} ${path} lies inside the worktree; keep it in a scratch directory`);
}

function passesPath(root: string, change: string): string {
  return join(root, changeDirectory(change), PASSES_FILE);
}

// Checked before the reviewer runs, so that a second pass line costs no run.
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

// Fresh when made at the current merge base for a commit whose tree
// equals HEAD's outside the change's own directory.
export function routeState(root: string, change: string, git: Git): RouteState {
  const path = routePath(root, change);
  if (!existsSync(path)) return 'missing';
  let routed: RoutedRevision;
  try {
    routed = JSON.parse(readFileSync(path, 'utf8')) as RoutedRevision;
  } catch {
    return 'stale';
  }
  if (typeof routed.headCommit !== 'string' || routed.devCommit !== mergeBase(git)) return 'stale';
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

interface RoutedPlans {
  readonly rule?: { readonly passes?: readonly { readonly reviewer?: Reviewer }[] };
}

// route.json only recommends: the authorized effort stays (governance
// "Routed effort", policy version 7); pass 3 keeps pass 1's reviewer.
function recommendation(root: string, request: ReviewRequest): string[] {
  const path = routePath(root, request.change);
  if (!existsSync(path)) return [];
  let routed: RoutedPlans;
  try {
    routed = JSON.parse(readFileSync(path, 'utf8')) as RoutedPlans;
  } catch {
    return [];
  }
  const recommended = routed.rule?.passes?.[request.pass === 2 ? 1 : 0]?.reviewer;
  if (recommended === undefined) return [];
  const chosen = reviewerKey(request.reviewer.reviewer);
  const key = reviewerKey(recommended);
  if (key === chosen) return [`route: recommends ${chosen}`];
  return [`route: recommends ${key}; ${chosen} runs at its authorized effort, and another reviewer A goes to the coordinator`];
}

async function runReviewer(request: ReviewRequest, dependencies: ReviewDependencies): Promise<string[]> {
  const { reviewer } = request;
  const cliLog = `${request.log}${CLI_LOG_SUFFIX}`;
  const invocation = reviewer.invocation({
    worktree: dependencies.root,
    change: request.change,
    promptFile: request.promptFile,
    promptText: readFileSync(request.promptFile, 'utf8'),
    cliLog,
  });
  const environment = reviewerEnvironment(reviewer, dependencies.environment);
  const status = await launch(invocation, environment, request, dependencies.root);
  const key = reviewerKey(reviewer.reviewer);
  if (status !== 0) throw failed(`${key} exited with status ${status}`, request.log);
  const output = readFileSync(request.log, 'utf8');
  const cliText = reviewer.writesCliLog && existsSync(cliLog) ? readFileSync(cliLog, 'utf8') : undefined;
  const { session, model } = reviewer.confirm({ output, cliLog: cliText });
  if (session === undefined || !SESSION.test(session)) throw failed(`${key} reported no valid session ID`, request.log);
  const modelLine = confirmedModel(reviewer, model, key, request.log);
  const summary = appendSummary(dependencies.root, request, session);
  return [
    `review: ${invocation.command} ${shownArgs(invocation).join(' ')}`,
    `environment: ${Object.keys(environment).join(' ')}`,
    `log: ${request.log}`,
    `session: ${session}`,
    modelLine,
    `${PASSES_FILE}: ${JSON.stringify(summary)}`,
    'The counts are 0: set them when you record the findings in findings.jsonl.',
  ];
}

function confirmedModel(reviewer: ReviewerInvocation, model: string | undefined, key: string, log: string): string {
  const expected = reviewer.reviewer.model;
  if (model === expected) return `model: ${model} (reported)`;
  if (model === undefined && reviewer.modelNote !== undefined) return `model: not in the output; ${reviewer.modelNote}`;
  throw failed(`${key} reported model ${model ?? 'none'}, not ${expected}`, log);
}

function failed(reason: string, log: string): ReviewRefusal {
  return new ReviewRefusal(`${reason}; no pass line written, see ${log}. A failed attempt is no pass.`, EXIT_REVIEWER_FAILED);
}

// The prompt text is long and already in its file, so it is not echoed.
function shownArgs({ args }: Invocation): string[] {
  return args.map((arg) => (arg.length > 200 || arg.includes('\n') ? '<prompt>' : arg));
}

// An explicit env with no inherited variable has the effect of env -i.
function launch(invocation: Invocation, env: Record<string, string>, request: ReviewRequest, cwd: string): Promise<number> {
  const out = openSync(request.log, 'w');
  const stdin = invocation.stdin === 'prompt' ? openSync(request.promptFile, 'r') : 'ignore';
  return new Promise<number>((resolveStatus) => {
    const child = spawn(invocation.command, [...invocation.args], { cwd, env, stdio: [stdin, out, out] });
    child.on('error', () => resolveStatus(127));
    child.on('close', (code, signal) => resolveStatus(code ?? (signal === null ? 1 : 128)));
  }).finally(() => {
    closeSync(out);
    if (typeof stdin === 'number') closeSync(stdin);
  });
}

function appendSummary(root: string, request: ReviewRequest, session: string): PassSummary {
  const summary: PassSummary = {
    change: request.change,
    pass: request.pass,
    role: request.role,
    reviewer: request.reviewer.reviewer,
    session,
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
  };
  const path = passesPath(root, request.change);
  const existing = readFileSync(path, 'utf8');
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  appendFileSync(path, `${separator}${JSON.stringify(summary)}\n`);
  return summary;
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
