import { spawn } from 'node:child_process';
import { chmod, chown, link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIdentifier, type Result } from '@taskelith/kernel';
import { crashEnvironment } from '@taskelith/testing';
import type { AttemptId } from '@taskelith/execution';
import {
  GitWorkspaces,
  NO_CRASH_POINTS,
  ProcessGroupReclaimHost,
  sha256IdentifierDigest,
  verifyGitClient,
  type CrashPointHook,
  type ExecutionAccount,
  type GitTimer,
  type GitWorkspaceCrashPoint,
  type OperationChains,
  type ReclaimContainment,
  type ReclaimHost,
  type ReclaimProgram,
  type VerifiedGitClient,
} from '@taskelith/git-workspace';
import {
  REDACTED_VALUE,
  WORKSPACE_LAYOUT,
  holdsSensitive,
  redactedHeader,
  sensitiveValues,
  workspaceDirectoryName,
  type GitClientPin,
  type GitProcessObservation,
  type RepositoryBinding,
  type RepositoryId,
  type TreeEntry,
  type WorkspaceCredential,
  type WorkspaceFixture,
} from '@taskelith/workspace';

// A local bare repository served over smart HTTP on 127.0.0.1, a recording
// wrapper as the Git client pin, and native Git as an agent would run it.

export const SYSTEM_GIT = '/usr/bin/git';
const BASE_BRANCH = 'main';
const TRACKED = 'README.md';
const IGNORED = 'build.log';
const encode = (text: string) => new TextEncoder().encode(text);
const textFile = (text: string): TreeEntry => ({ type: 'file', mode: '100644', content: encode(text) });
const BASE_TREE: Readonly<Record<string, TreeEntry>> = { [TRACKED]: textFile('base\n'), '.gitignore': textFile(`${IGNORED}\n`) };

// Every record kind of the worker journal contract section 2.
const CONTROL_RECORDS: Readonly<Record<string, string>> = {
  'worker/identity': 'identity',
  'worker/lock': '',
  'worker/journal/journal.sqlite': 'journal',
  'worker/journal-fault': 'fault',
  'worker/credentials/control-plane.1': 'credential',
  'worker/executions/execution-1/intent': 'intent',
  'worker/logs/stream.log': 'log',
};

// Native Git of the agent or another party: no user or system settings.
const NATIVE_ENVIRONMENT = {
  PATH: '/usr/bin:/bin', HOME: '/nonexistent', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Agent', GIT_AUTHOR_EMAIL: 'agent@example.invalid', GIT_COMMITTER_NAME: 'Agent', GIT_COMMITTER_EMAIL: 'agent@example.invalid',
};

export interface ProcessRun {
  readonly code: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
}

export function runProcess(command: string, args: readonly string[], options: { cwd?: string; env?: Record<string, string>; input?: Uint8Array } = {}): Promise<ProcessRun> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? NATIVE_ENVIRONMENT, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString('utf8') }));
    // A process that exits before reading its input closes the pipe early.
    child.stdin.on('error', () => {});
    child.stdin.end(options.input ?? new Uint8Array());
  });
}

export async function nativeGit(cwd: string, args: readonly string[], options: { env?: Record<string, string>; input?: Uint8Array } = {}): Promise<Buffer> {
  const run = await runProcess(SYSTEM_GIT, args, { cwd, env: { ...NATIVE_ENVIRONMENT, ...options.env }, input: options.input });
  if (run.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout;
}

const nativeText = async (cwd: string, args: readonly string[]) => (await nativeGit(cwd, args)).toString('utf8').trim();

export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}

// What a request needs of the server's own credential check.
type Grant = 'read' | 'write';
export type GitService = 'git-upload-pack' | 'git-receive-pack';

// Serve, redirect to another origin, stall, repeat the Authorization
// header, or serve and lose the answer; every service unless one is named.
export type RemoteBehavior =
  | { readonly kind: 'serve' }
  | { readonly kind: 'redirect'; readonly origin: string; readonly service: GitService; readonly request: 'advertisement' | 'service' }
  | { readonly kind: 'stall'; readonly service?: GitService }
  | { readonly kind: 'echo-authorization'; readonly service?: GitService }
  | { readonly kind: 'lose-answer'; readonly service: GitService };

const SERVE: RemoteBehavior = Object.freeze({ kind: 'serve' });
const pktLine = (text: string) => `${(text.length + 4).toString(16).padStart(4, '0')}${text}`;

// Git's smart HTTP protocol from `git http-backend` on 127.0.0.1, behind
// its own credential check; it keeps every request it receives.
export class SmartHttpRemote {
  readonly received: ReceivedRequest[] = [];
  behavior: RemoteBehavior = SERVE;
  // Runs before the server answers a request, as another party could.
  beforeAnswer: (request: ReceivedRequest) => Promise<void> = async () => {};

  private readonly root: string;
  private readonly grants: ReadonlyMap<string, readonly Grant[]>;
  private readonly server: Server;
  readonly port: number;

  private constructor(root: string, grants: ReadonlyMap<string, readonly Grant[]>, server: Server, port: number) {
    this.root = root;
    this.grants = grants;
    this.server = server;
    this.port = port;
  }

  // `grants` maps an Authorization value to what it may do.
  static async start(root: string, grants: ReadonlyMap<string, readonly Grant[]>): Promise<SmartHttpRemote> {
    const holder: { remote?: SmartHttpRemote } = {};
    const server = createServer((request, response) => void holder.remote!.answer(request, response));
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('the remote has no port');
    holder.remote = new SmartHttpRemote(root, grants, server, address.port);
    return holder.remote;
  }

  get requests(): number {
    return this.received.length;
  }

  get authorizations(): (string | undefined)[] {
    return this.received.map(({ headers }) => headers.authorization);
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  url(path: string): string {
    return `${this.origin}/${path}`;
  }

  close(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((closed) => this.server.close(() => closed()));
  }

  private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = request.url ?? '/';
    const received = { method: request.method ?? '', url, headers: request.headers };
    this.received.push(received);
    await this.beforeAnswer(received);
    const behavior = this.behavior;
    const advertisement = url.includes('/info/refs');
    const affected = !('service' in behavior) || behavior.service === undefined || url.includes(behavior.service);
    if (behavior.kind === 'stall' && affected) return;
    if (behavior.kind === 'redirect' && url.includes(behavior.service) && advertisement === (behavior.request === 'advertisement')) {
      return void response.writeHead(302, { location: `${behavior.origin}${url}` }).end();
    }
    const grant: Grant = url.includes('git-receive-pack') ? 'write' : 'read';
    if (!(this.grants.get(request.headers.authorization ?? '') ?? []).includes(grant)) {
      return void response.writeHead(401, { 'www-authenticate': 'Basic realm="taskelith"' }).end();
    }
    if (behavior.kind === 'echo-authorization' && affected && advertisement) {
      const service = url.includes('git-receive-pack') ? 'git-receive-pack' : 'git-upload-pack';
      const body = `${pktLine(`# service=${service}\n`)}0000${pktLine(`ERR ${request.headers.authorization}\n`)}`;
      return void response.writeHead(200, { 'content-type': `application/x-${service}-advertisement` }).end(body);
    }
    this.backend(request, response, behavior.kind === 'lose-answer' && affected && !advertisement);
  }

  // `git http-backend` as CGI, with receive-pack enabled by REMOTE_USER.
  private backend(request: IncomingMessage, response: ServerResponse, loseAnswer: boolean): void {
    const url = new URL(request.url ?? '/', this.origin);
    const header = (name: string) => request.headers[name] as string | undefined;
    const env: Record<string, string> = {
      PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_PROJECT_ROOT: this.root, GIT_HTTP_EXPORT_ALL: '1', REMOTE_USER: 'taskelith', REMOTE_ADDR: '127.0.0.1',
      PATH_INFO: decodeURIComponent(url.pathname), QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method ?? 'GET',
      CONTENT_TYPE: header('content-type') ?? '',
      ...(header('git-protocol') === undefined ? {} : { GIT_PROTOCOL: header('git-protocol')! }),
      ...(header('content-encoding') === undefined ? {} : { HTTP_CONTENT_ENCODING: header('content-encoding')! }),
    };
    const child = spawn(SYSTEM_GIT, ['http-backend'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
    request.pipe(child.stdin);
    const output: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.on('close', () => {
      if (loseAnswer) return void response.destroy();
      const all = Buffer.concat(output);
      const split = all.indexOf('\r\n\r\n');
      const headers: Record<string, string> = {};
      let status = 200;
      for (const line of all.subarray(0, split).toString('latin1').split('\r\n')) {
        const colon = line.indexOf(':');
        const [name, value] = [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
        if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
        else headers[name] = value;
      }
      response.writeHead(status, headers).end(all.subarray(split + 4));
    });
  }
}

// A Perl wrapper that records each process at its start and then runs
// the system Git with the same arguments and environment.
function recordingWrapper(logDirectory: string): string {
  return `#!/usr/bin/perl
use strict;
use warnings;
use Cwd qw(getcwd);
use Time::HiRes qw(time);
my $cwd = getcwd();
my $config;
for (my $dir = $cwd; ; $dir =~ s{/[^/]*$}{}) {
  $dir = '/' if $dir eq '';
  if (-d "$dir/.git") { $config = "$dir/.git/config"; last; }
  last if $dir eq '/';
}
my $record = sprintf('${logDirectory}/%020.6f-%d', time, $$);
mkdir "$record.tmp" or die "cannot record: $!";
sub put { my ($name, $text) = @_; open(my $out, '>', "$record.tmp/$name") or die; binmode $out; print $out $text; close $out; }
put('argv', join("\\0", $0, @ARGV));
put('env', join("\\0", map { "$_=$ENV{$_}" } sort keys %ENV));
put('cwd', $cwd);
for my $file ('cgroup', 'status') {
  next unless -r "/proc/$$/$file";
  local $/; open(my $in, '<', "/proc/$$/$file") or die; put($file, <$in>); close $in;
}
if (defined $config && -f $config) { local $/; open(my $in, '<', $config) or die; binmode $in; put('config', <$in>); close $in; }
rename "$record.tmp", $record or die;
exec { '${SYSTEM_GIT}' } '${SYSTEM_GIT}', @ARGV;
`;
}

export async function systemGitVersion(): Promise<string> {
  return (await runProcess(SYSTEM_GIT, ['--version'])).stdout.toString('utf8').trim();
}

// The pin of a wrapper around the system Git, with that Git's version.
export async function recordingPin(directory: string): Promise<{ pin: GitClientPin; logDirectory: string }> {
  const logDirectory = join(directory, 'git-processes');
  await mkdir(logDirectory, { recursive: true });
  const path = join(directory, 'bin', 'git-observed');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, recordingWrapper(logDirectory));
  await chmod(path, 0o755);
  return { pin: { path, version: await systemGitVersion() }, logDirectory };
}

interface RawProcess {
  readonly argv: string[];
  readonly pid: number;
  readonly cwd: string;
  readonly environment: Record<string, string>;
  readonly repositoryConfig: string | null;
}

// Where a Git process ran, from its /proc entries at its start (Linux).
export interface GitProcessPlacement {
  readonly argv: readonly string[];
  readonly pid: number;
  // `/proc/<pid>/cgroup` and the real user of `/proc/<pid>/status`.
  readonly cgroup: string | null;
  readonly uid: number | null;
}

async function recordedPlacements(logDirectory: string): Promise<GitProcessPlacement[]> {
  const records = (await readdir(logDirectory)).filter((name) => !name.endsWith('.tmp')).sort();
  return Promise.all(records.map(async (name) => {
    const read = (file: string) => readFile(join(logDirectory, name, file), 'utf8').catch(() => null);
    const uid = /^Uid:\s+(\d+)/m.exec((await read('status')) ?? '')?.[1];
    return { argv: (await read('argv'))!.split('\0'), pid: Number(name.split('-').at(-1)), cgroup: await read('cgroup'), uid: uid === undefined ? null : Number(uid) };
  }));
}

async function recordedProcesses(logDirectory: string): Promise<RawProcess[]> {
  const records = (await readdir(logDirectory)).filter((name) => !name.endsWith('.tmp')).sort();
  return Promise.all(records.map(async (name) => {
    const read = (file: string) => readFile(join(logDirectory, name, file), 'utf8');
    const environment: Record<string, string> = {};
    for (const pair of (await read('env')).split('\0').filter(Boolean)) {
      const equals = pair.indexOf('=');
      environment[pair.slice(0, equals)] = pair.slice(equals + 1);
    }
    return {
      argv: (await read('argv')).split('\0'),
      pid: Number(name.split('-').at(-1)),
      cwd: await read('cwd'),
      environment,
      repositoryConfig: await read('config').catch(() => null),
    };
  }));
}

// A credential's exact header as its marker, any other form redacted.
function observed(process: RawProcess, credentials: readonly WorkspaceCredential[]): GitProcessObservation {
  const sensitive = sensitiveValues(credentials);
  const headers = new Map(credentials.map(({ credentialId, authorization }) => [`Authorization: ${authorization}`, redactedHeader(credentialId)]));
  const redact = (value: string) => headers.get(value) ?? (holdsSensitive(value, sensitive) ? REDACTED_VALUE : value);
  const environment = Object.fromEntries(Object.entries(process.environment).map(([key, value]) => [key, redact(value)]));
  return { ...process, environment };
}

// Rejects when the work outlives the bound, so a hang fails the test.
export async function within<T>(work: Promise<T>, boundMs: number): Promise<T> {
  let watchdog: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    watchdog = setTimeout(() => reject(new Error(`not done within ${boundMs} ms`)), boundMs);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(watchdog);
  }
}

// A Git timer that a test fires itself once its process is ready, so no
// test depends on how fast a loaded host starts a process.
export class ManualGitTimer {
  readonly limits: number[] = [];
  readonly #armed = new Set<() => void>();
  #onArm: () => void = () => {};

  readonly timer: GitTimer = (expire, timeLimitMs) => {
    this.limits.push(timeLimitMs);
    this.#armed.add(expire);
    this.#onArm();
    return () => this.#armed.delete(expire);
  };

  // Resolves once a time limit is armed, at once if one already is.
  armed(): Promise<void> {
    return this.#armed.size > 0 ? Promise.resolve() : new Promise((resolve) => (this.#onArm = resolve));
  }

  // Expires every armed time limit.
  expire(): void {
    for (const expire of [...this.#armed]) {
      this.#armed.delete(expire);
      expire();
    }
  }
}

// The GitHub plugin's form of the Authorization value (contract section 7).
export function credential(credentialId: string, repositories: string[], permissions: string[], secret = `secret-of-${credentialId}`): WorkspaceCredential {
  const authorization = `Basic ${Buffer.from(`x-access-token:${secret}`).toString('base64')}`;
  return { credentialId, secret, authorization, repositories, permissions };
}

const RECLAIM_LAUNCHER = fileURLToPath(new URL('./reclaim-launcher.ts', import.meta.url));
const CRASH_WORKER = fileURLToPath(new URL('./crash-worker.ts', import.meta.url));

// The reclaim host a crash worker composes, as JSON can carry it.
export type CrashWorkerHost =
  | { readonly kind: 'separate-account'; readonly program?: ReclaimProgram }
  | { readonly kind: 'linux'; readonly containmentParent: string; readonly executionAccount: ExecutionAccount; readonly program?: ReclaimProgram };

export interface CrashedOperation {
  readonly operation: 'handOff' | 'reclaim';
  readonly attemptId: AttemptId;
  readonly point: GitWorkspaceCrashPoint;
  readonly host: CrashWorkerHost;
}

export interface CrashWorkerConfig extends CrashedOperation {
  readonly dataRoot: string;
  readonly pin: GitClientPin;
}

// Runs the operation in a worker process of its own over the fixture's
// data root and waits until SIGKILL ends it at the point; nothing cleans up.
export async function killedWorker(git: GitFixture, operation: CrashedOperation): Promise<void> {
  const config: CrashWorkerConfig = { ...operation, dataRoot: git.dataRoot, pin: git.fixture.gitClient };
  const worker = spawn(process.execPath, ['--experimental-strip-types', CRASH_WORKER, JSON.stringify(config)], {
    env: { ...process.env, ...crashEnvironment(operation.point) }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  worker.stderr.on('data', (chunk: Buffer) => (stderr += String(chunk)));
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((done) => worker.once('close', (...ended) => done(ended)));
  if (signal !== 'SIGKILL') throw new Error(`the worker did not die at ${operation.point}: exit ${code}, ${stderr}`);
}

// Launches the fixed reclaim program from a process of its own, which then
// dies by SIGKILL before `go`; returns the program's containment.
export async function launchedByDeadWorker(args: readonly string[]): Promise<ReclaimContainment> {
  const launcher = spawn(process.execPath, ['--experimental-strip-types', RECLAIM_LAUNCHER, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  const closed = new Promise((done) => launcher.once('close', done));
  let printed = '';
  for await (const chunk of launcher.stdout) {
    printed += String(chunk);
    if (printed.includes('\n')) break;
  }
  launcher.kill('SIGKILL');
  await closed;
  if (!printed.includes('\n')) throw new Error('the launcher printed no containment');
  return JSON.parse(printed) as ReclaimContainment;
}

// Keeps the containments of the programs another host starts and frees.
export class CountingHost implements ReclaimHost {
  readonly launched: ReclaimContainment[] = [];
  readonly released: ReclaimContainment[] = [];
  readonly killedRecorded: ReclaimContainment[] = [];
  readonly #inner: ReclaimHost;

  constructor(inner: ReclaimHost) {
    this.#inner = inner;
  }

  get executionAccount() {
    return this.#inner.executionAccount;
  }

  async launch(checkout: string, containmentName: string) {
    const launched = await this.#inner.launch(checkout, containmentName);
    if (launched.ok) this.launched.push(launched.value.containment);
    return launched;
  }

  populated(containment: ReclaimContainment) {
    return this.#inner.populated(containment);
  }

  release(containment: ReclaimContainment) {
    this.released.push(containment);
    return this.#inner.release(containment);
  }

  killRecorded(containment: ReclaimContainment) {
    this.killedRecorded.push(containment);
    return this.#inner.killRecorded(containment);
  }
}

// The one-account host that declares the worker's own account as the
// execution account, so a test without root meets a separate account.
export function simulatedSeparateAccount(host: ReclaimHost = new ProcessGroupReclaimHost()): ReclaimHost {
  return {
    executionAccount: { uid: process.getuid!(), gid: process.getgid!() },
    launch: (checkout, containmentName) => host.launch(checkout, containmentName),
    populated: (containment) => host.populated(containment),
    release: (containment) => host.release(containment),
    killRecorded: (containment) => host.killRecorded(containment),
  };
}

async function allText(directory: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await allText(path));
    else if (entry.isFile()) parts.push(`${path}\n${await readFile(path, 'utf8')}`);
  }
  return parts.sort().join('\n');
}

async function recordText(path: string): Promise<string> {
  return (await lstat(path)).isDirectory() ? allText(path) : `${path}\n${await readFile(path, 'utf8')}`;
}

// The files and links under a directory, read without following a link.
async function treeOf(directory: string, prefix = ''): Promise<Record<string, TreeEntry>> {
  const tree: Record<string, TreeEntry> = Object.create(null);
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const full = join(directory, path);
    if (entry.isDirectory()) Object.assign(tree, await treeOf(directory, path));
    else if (entry.isSymbolicLink()) tree[path] = { type: 'link', target: await readlink(full) };
    else {
      const mode = ((await lstat(full)).mode & 0o111) === 0 ? '100644' : '100755';
      tree[path] = { type: 'file', mode, content: new Uint8Array(await readFile(full)) };
    }
  }
  return tree;
}

// Decodes a snapshot with the system `tar`, independent of the encoder.
export async function extractWithTar(scratch: string, content: Uint8Array): Promise<Record<string, TreeEntry>> {
  const target = await mkdtemp(join(scratch, 'snapshot-'));
  const run = await runProcess('tar', ['-xf', '-', '-C', target], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, input: content });
  if (run.code !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return treeOf(target);
}

function mustParse<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export interface GitFixtureOptions {
  readonly crashPoints?: CrashPointHook;
  readonly gitTimeLimitMs?: number;
  // The read credential's secret, such as a short one.
  readonly readSecret?: string;
  // The one-account process group host unless a test passes another.
  readonly reclaimHost?: ReclaimHost;
  readonly reclaimProofBoundMs?: number;
  readonly reclaimRunBoundMs?: number;
  readonly operationChains?: OperationChains;
  // The directory the scratch directory goes into; `tmpdir()` by default.
  readonly scratchParent?: string;
  // Gives the data root, `worker/`, and the workspace root this group and
  // the traverse-only mode of contract section 2, as enrollment does.
  readonly executionGroup?: number;
}

export interface GitFixture {
  readonly fixture: WorkspaceFixture;
  readonly local: GitWorkspaces;
  readonly dataRoot: string;
  // Every Git process the adapter started so far, with its placement.
  gitPlacements(): Promise<readonly GitProcessPlacement[]>;
  readonly remote: SmartHttpRemote;
  readonly client: VerifiedGitClient;
  readonly scratch: string;
  // A new adapter over the same data root.
  reopen(crashPoints?: CrashPointHook): GitWorkspaces;
  // A second origin that serves the same repositories, closed on dispose.
  startOtherRemote(): Promise<SmartHttpRemote>;
  checkout(attemptId: AttemptId): string;
  // Publishes the workspace's head natively, as another party could.
  publish(attemptId: AttemptId, branch: string): Promise<void>;
  dispose(): Promise<void>;
}

async function traverseOnly(directory: string, group: number): Promise<void> {
  await chown(directory, -1, group);
  await chmod(directory, 0o710);
}

async function seedRemote(scratch: string, bare: string): Promise<void> {
  await mkdir(bare, { recursive: true });
  await nativeGit(bare, ['init', '--quiet', '--bare', `--initial-branch=${BASE_BRANCH}`]);
  const seed = join(scratch, 'seed');
  await mkdir(seed);
  await nativeGit(seed, ['init', '--quiet', `--initial-branch=${BASE_BRANCH}`]);
  for (const [path, entry] of Object.entries(BASE_TREE)) if (entry.type === 'file') await writeFile(join(seed, path), entry.content);
  await nativeGit(seed, ['add', '-A']);
  await nativeGit(seed, ['commit', '--quiet', '-m', 'base']);
  await nativeGit(seed, ['push', '--quiet', bare, `HEAD:refs/heads/${BASE_BRANCH}`]);
}

export async function createGitFixture(options: GitFixtureOptions = {}): Promise<GitFixture> {
  const scratch = await realpath(await mkdtemp(join(options.scratchParent ?? tmpdir(), 'taskelith-git-workspace-')));
  const dataRoot = join(scratch, 'data');
  for (const [path, text] of Object.entries(CONTROL_RECORDS)) {
    await mkdir(dirname(join(dataRoot, path)), { recursive: true });
    await writeFile(join(dataRoot, path), text);
  }
  const root = join(dataRoot, WORKSPACE_LAYOUT.root);
  await mkdir(root, { recursive: true });
  if (options.executionGroup !== undefined) {
    for (const directory of [scratch, dataRoot, join(dataRoot, 'worker'), root]) await traverseOnly(directory, options.executionGroup);
  }
  const served = join(scratch, 'served');
  const bare = join(served, 'acme', 'project.git');
  await seedRemote(scratch, bare);
  const { pin, logDirectory } = await recordingPin(scratch);
  const client = mustParse(await verifyGitClient(pin));
  const repository = mustParse(parseIdentifier('RepositoryId', 'acme/project')) as RepositoryId;
  const credentials = {
    read: credential('read', [repository], ['read-code'], options.readSecret),
    write: credential('write', [repository], ['read-code', 'write-code']),
    foreign: credential('foreign', ['acme/other'], ['read-code', 'write-code', 'write-change-requests', 'write-statuses']),
  };
  // The service's own check; the foreign credential names another one.
  const grants = new Map<string, readonly Grant[]>([[credentials.read.authorization, ['read']], [credentials.write.authorization, ['read', 'write']]]);
  const remote = await SmartHttpRemote.start(served, grants);
  const others: SmartHttpRemote[] = [];
  const { gitTimeLimitMs, reclaimProofBoundMs, reclaimRunBoundMs, operationChains, reclaimHost = new ProcessGroupReclaimHost() } = options;
  const reopen = (crashPoints: CrashPointHook = NO_CRASH_POINTS) => new GitWorkspaces({
    dataRoot, client, remoteTransport: 'https-or-loopback-http', crashPoints, gitTimeLimitMs, reclaimHost, reclaimProofBoundMs, reclaimRunBoundMs, operationChains,
  });
  const local = reopen(options.crashPoints);
  const binding: RepositoryBinding = { repository, remote: remote.url('acme/project.git'), baseBranch: BASE_BRANCH };
  const nameOf = (attemptId: AttemptId) => workspaceDirectoryName(attemptId, sha256IdentifierDigest);
  const checkout = (attemptId: AttemptId) => join(root, nameOf(attemptId), WORKSPACE_LAYOUT.checkout);
  const git = (attemptId: AttemptId, args: readonly string[]) => nativeGit(checkout(attemptId), args);
  const write = async (attemptId: AttemptId, path: string, write: (target: string) => Promise<void>) => {
    const target = join(checkout(attemptId), path);
    await mkdir(dirname(target), { recursive: true });
    await rm(target, { force: true });
    await write(target);
  };
  const remoteHead = async (branch: string) => {
    const run = await runProcess(SYSTEM_GIT, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: bare });
    return run.code === 0 ? run.stdout.toString('utf8').trim() : undefined;
  };
  let remoteCommits = 0;
  const fixture: WorkspaceFixture = {
    provider: local,
    dataRoot,
    identifierDigest: sha256IdentifierDigest,
    binding,
    credentials,
    baseTree: BASE_TREE,
    trackedPath: TRACKED,
    ignoredPath: IGNORED,
    separateExecutionIdentity: reclaimHost.executionAccount !== null,
    gitClient: pin,
    reopen: () => reopen(),
    writeFile: (attemptId, path, text) => write(attemptId, path, (target) => writeFile(target, text)),
    writeBytes: (attemptId, path, content) => write(attemptId, path, (target) => writeFile(target, content)),
    writeExecutable: (attemptId, path, text) => write(attemptId, path, async (target) => {
      await writeFile(target, text);
      await chmod(target, 0o755);
    }),
    writeLink: (attemptId, path, target) => write(attemptId, path, (at) => symlink(target, at)),
    linkToControlRecord: async (attemptId, path) => symlink(join(dataRoot, 'worker/identity'), join(checkout(attemptId), path)),
    stage: async (attemptId, path) => void (await git(attemptId, ['add', '-A', '--', path])),
    commitAll: async (attemptId, message) => {
      await git(attemptId, ['add', '-A']);
      await git(attemptId, ['commit', '--quiet', '--allow-empty', '--no-verify', '-m', message]);
    },
    // A bisect is an unfinished operation that changes no file.
    beginOperation: async (attemptId) => void (await git(attemptId, ['bisect', 'start'])),
    switchBranch: async (attemptId, branch) => void (await git(attemptId, ['checkout', '--quiet', '-B', branch])),
    remoteHead,
    advanceRemote: async (branch) => {
      remoteCommits += 1;
      const parent = (await remoteHead(branch)) ?? (await remoteHead(BASE_BRANCH))!;
      const env = { GIT_INDEX_FILE: join(scratch, `index-${remoteCommits}`) };
      const blob = (await nativeGit(bare, ['hash-object', '-w', '--stdin'], { input: encode('remote\n') })).toString('utf8').trim();
      await nativeGit(bare, ['read-tree', parent], { env });
      await nativeGit(bare, ['update-index', '--add', '--cacheinfo', `100644,${blob},remote-${remoteCommits}.txt`], { env });
      const tree = (await nativeGit(bare, ['write-tree'], { env })).toString('utf8').trim();
      const commit = (await nativeGit(bare, ['commit-tree', tree, '-p', parent, '-m', 'remote'])).toString('utf8').trim();
      await nativeGit(bare, ['update-ref', `refs/heads/${branch}`, commit]);
    },
    remoteCalls: async () => remote.requests,
    nativeHead: async (attemptId) => ({
      commit: await nativeText(checkout(attemptId), ['rev-parse', 'HEAD']),
      tree: await nativeText(checkout(attemptId), ['rev-parse', 'HEAD^{tree}']),
    }),
    workspaceText: async (attemptId) => allText(dirname(checkout(attemptId))),
    controlRecords: async () => {
      const worker = join(dataRoot, 'worker');
      const records = (await readdir(worker)).filter((entry) => entry !== 'workspaces').map((entry) => recordText(join(worker, entry)));
      return (await Promise.all(records)).join('\n');
    },
    readSnapshot: (content) => extractWithTar(scratch, content),
    hardLinkOutside: async (attemptId, path) => {
      const outside = join(dataRoot, `outside-${nameOf(attemptId)}`);
      await link(join(checkout(attemptId), path), outside);
      return (text) => writeFile(outside, text);
    },
    linkInGitDirectory: async (attemptId) => symlink(join(dataRoot, 'worker/journal'), join(checkout(attemptId), '.git', 'linked-journal')),
    removeGitDirectory: async (attemptId) => rm(join(checkout(attemptId), '.git'), { recursive: true, force: true }),
    nestGitFile: async (attemptId, gitDirectory) => {
      const nested = join(checkout(attemptId), 'nested');
      await mkdir(nested);
      await writeFile(join(nested, '.git'), `gitdir: ${gitDirectory}\n`);
    },
    commitGitlink: async (attemptId, path) => {
      const head = await nativeText(checkout(attemptId), ['rev-parse', 'HEAD']);
      await git(attemptId, ['update-index', '--add', '--cacheinfo', `160000,${head},${path}`]);
      await git(attemptId, ['commit', '--quiet', '--no-verify', '-m', 'gitlink']);
      await mkdir(join(checkout(attemptId), path), { recursive: true });
    },
    gitProcesses: async () => (await recordedProcesses(logDirectory)).map((process) => observed(process, Object.values(credentials))),
    plantGitSetting: async (attemptId, key, value) => void (await git(attemptId, ['config', '--file', join(checkout(attemptId), '.git', 'config'), '--add', key, value])),
    gitConfig: async (attemptId) => readFile(join(checkout(attemptId), '.git', 'config'), 'utf8').catch(() => ''),
    interruptPrepare: async (attemptId) => {
      const staging = join(root, `${WORKSPACE_LAYOUT.stagingPrefix}${nameOf(attemptId)}`, WORKSPACE_LAYOUT.checkout);
      await mkdir(staging, { recursive: true });
      await symlink(join(dataRoot, 'worker/journal'), join(staging, 'journal-link'));
    },
    interruptRemove: async (attemptId) => {
      const name = nameOf(attemptId);
      await rename(join(root, name), join(root, `${WORKSPACE_LAYOUT.removingPrefix}${name}`));
    },
    leaveLinkedLeftover: async (attemptId) => {
      await symlink(join(dataRoot, 'worker/executions'), join(root, `${WORKSPACE_LAYOUT.stagingPrefix}${nameOf(attemptId)}`));
    },
    leftovers: async () => (await readdir(root)).filter((entry) => entry.startsWith('.')).sort(),
  };
  return {
    fixture,
    local,
    dataRoot,
    gitPlacements: () => recordedPlacements(logDirectory),
    remote,
    client,
    scratch,
    reopen,
    startOtherRemote: async () => {
      const other = await SmartHttpRemote.start(served, grants);
      others.push(other);
      return other;
    },
    checkout,
    publish: async (attemptId, branch) => {
      await git(attemptId, ['push', '--quiet', bare, `HEAD:refs/heads/${branch}`]);
    },
    dispose: async () => {
      await Promise.all([remote, ...others].map((server) => server.close()));
      await rm(scratch, { recursive: true, force: true });
    },
  };
}
