import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Host-wide, per-user first-in, first-out Docker slot (decision D3): mkdir
// tickets, so it needs no flock, which macOS lacks.

export type Environment = Readonly<Record<string, string | undefined>>;

export const QUEUE = 'queue';
export const CHOOSING = 'choosing';
export const HOLDER_FILE = 'holder.json';
export const LOG_FILE = 'docker-slot.log';
// A ticket directory gets its holder file right after mkdir; one without it
// for this long belongs to a process that died in between.
export const UNRECORDED_TICKET_MS = 60_000;
const TICKET_DIGITS = 12;
const TICKET_NAME = /^(\d{12})-(\d+-[0-9a-f]+)$/;
const CHOOSING_NAME = /^\d+-[0-9a-f]+\.json$/;

export function stateDirectory(environment: Environment): string {
  const state = environment.XDG_STATE_HOME || join(environment.HOME || homedir(), '.local', 'state');
  return join(state, 'taskelith');
}

export function lockDirectory(environment: Environment): string {
  return join(stateDirectory(environment), 'docker-slot.lock');
}

// The holder process leads the process group of the command it runs.
export interface Holder {
  readonly pid: number;
  readonly started: string;
  readonly worktree: string;
  readonly since: string;
}

// The name is the number and a unique run ID, so a path is never reused.
export interface Ticket {
  readonly number: number;
  readonly name: string;
  readonly path: string;
}

// The probes that tell a live holder from a dead one; tests replace them.
export interface Processes {
  readonly alive: (pid: number) => boolean;
  readonly started: (pid: number) => string;
  readonly groupAlive: (pgid: number) => boolean;
}

function signalReaches(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export const systemProcesses: Processes = {
  alive: (pid) => signalReaches(pid),
  started(pid) {
    try {
      return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  },
  groupAlive: (pgid) => signalReaches(-pgid),
};

export function newRunId(pid: number): string {
  return `${pid}-${randomBytes(6).toString('hex')}`;
}

function ticketName(number: number, id: string): string {
  return `${String(number).padStart(TICKET_DIGITS, '0')}-${id}`;
}

function ticketsIn(lock: string): Ticket[] {
  const queue = join(lock, QUEUE);
  return readdirSync(queue).flatMap((name) => {
    const match = TICKET_NAME.exec(name);
    return match === null ? [] : [{ number: Number(match[1]), name, path: join(queue, name) }];
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
}

// A run that is choosing its number, as in Lamport's bakery algorithm.
export interface Choosing {
  readonly lock: string;
  readonly id: string;
  readonly holder: Holder;
  readonly marker: string;
}

// A ticket takes three steps, which tests interleave: mark, choose, and
// publish; the marker stays until the ticket exists.
export function beginChoosing(lock: string, holder: Holder, id = newRunId(holder.pid)): Choosing {
  mkdirSync(join(lock, QUEUE), { recursive: true });
  mkdirSync(join(lock, CHOOSING), { recursive: true });
  const marker = join(lock, CHOOSING, `${id}.json`);
  writeFileSync(marker, `${JSON.stringify(holder)}\n`);
  return { lock, id, holder, marker };
}

export function chooseNumber(choosing: Choosing): number {
  return ticketsIn(choosing.lock).reduce((highest, ticket) => Math.max(highest, ticket.number), 0) + 1;
}

export function publishTicket(choosing: Choosing, number: number): Ticket {
  const name = ticketName(number, choosing.id);
  const path = join(choosing.lock, QUEUE, name);
  mkdirSync(path);
  writeFileSync(join(path, HOLDER_FILE), `${JSON.stringify(choosing.holder)}\n`);
  rmSync(choosing.marker, { force: true });
  return { number, name, path };
}

export function takeTicket(lock: string, holder: Holder): Ticket {
  const choosing = beginChoosing(lock, holder);
  return publishTicket(choosing, chooseNumber(choosing));
}

export function releaseTicket(ticket: Ticket): void {
  rmSync(ticket.path, { recursive: true, force: true });
}

function readRecord(path: string): Holder | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Holder;
  } catch {
    return undefined;
  }
}

export function readHolder(ticketPath: string): Holder | undefined {
  return readRecord(join(ticketPath, HOLDER_FILE));
}

function ageMs(path: string, now: number): number {
  try {
    return now - statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// A process ID can be reused, but never while its process group exists, so
// a holder is gone when its ID is free or reused and its group is empty.
export function holderGone(holder: Holder, processes: Processes): boolean {
  if (processes.alive(holder.pid)) {
    const started = processes.started(holder.pid);
    return started !== '' && holder.started !== '' && started !== holder.started;
  }
  return !processes.groupAlive(holder.pid);
}

function recordStale(record: Holder | undefined, path: string, processes: Processes, now: number): boolean {
  if (record === undefined) return ageMs(path, now) > UNRECORDED_TICKET_MS;
  return holderGone(record, processes);
}

export function isStale(ticketPath: string, processes: Processes, now: number): boolean {
  return recordStale(readHolder(ticketPath), ticketPath, processes, now);
}

export interface QueueEntry {
  readonly ticket: Ticket;
  readonly holder: Holder | undefined;
}

export interface QueueState {
  readonly entries: readonly QueueEntry[];
  readonly choosing: number;
}

type Log = (line: string) => void;

function liveChoosing(lock: string, processes: Processes, now: number, log: Log): number {
  let live = 0;
  for (const name of readdirSync(join(lock, CHOOSING))) {
    if (!CHOOSING_NAME.test(name)) continue;
    const marker = join(lock, CHOOSING, name);
    const record = readRecord(marker);
    if (recordStale(record, marker, processes, now)) {
      rmSync(marker, { force: true });
      log(`removed stale choosing marker=${name} pid=${record?.pid ?? 'unknown'}`);
      continue;
    }
    live += 1;
  }
  return live;
}

// Removes stale tickets and markers and returns the live queue, the holder
// first, with the number of runs still choosing a number.
export function liveQueue(lock: string, processes: Processes, now: number, log: Log): QueueState {
  mkdirSync(join(lock, QUEUE), { recursive: true });
  mkdirSync(join(lock, CHOOSING), { recursive: true });
  const entries: QueueEntry[] = [];
  for (const ticket of ticketsIn(lock)) {
    const holder = readHolder(ticket.path);
    if (recordStale(holder, ticket.path, processes, now)) {
      releaseTicket(ticket);
      log(`removed stale ticket=${ticket.name} pid=${holder?.pid ?? 'unknown'}`);
      continue;
    }
    entries.push({ ticket, holder });
  }
  return { entries, choosing: liveChoosing(lock, processes, now, log) };
}

// A ticket holds the slot when no run is choosing and it is the lowest.
export function holdsSlot(state: QueueState, ticket: Ticket): boolean {
  return state.choosing === 0 && state.entries[0]?.ticket.name === ticket.name;
}

export function describeHolder(entry: QueueEntry): string {
  const { holder, ticket } = entry;
  if (holder === undefined) return `ticket ${ticket.number}`;
  return `pid ${holder.pid} in ${holder.worktree} since ${holder.since}`;
}

export interface WaitOptions {
  readonly lock: string;
  readonly ticket: Ticket;
  readonly processes: Processes;
  readonly pollMs: number;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly report: (line: string) => void;
  readonly log: Log;
}

// Waits until this ticket holds the slot and returns how many ms it
// waited; reports the holder whenever it changes.
export async function waitForTurn(options: WaitOptions): Promise<number> {
  const { lock, ticket, processes, pollMs, now, sleep, report, log } = options;
  const start = now();
  let reported = '';
  for (;;) {
    const state = liveQueue(lock, processes, now(), log);
    const position = state.entries.findIndex((entry) => entry.ticket.name === ticket.name);
    if (position === -1) throw new Error(`docker slot: ticket ${ticket.number} vanished from ${lock}`);
    if (holdsSlot(state, ticket)) return now() - start;
    const head = state.entries[0];
    if (position > 0 && head !== undefined && describeHolder(head) !== reported) {
      reported = describeHolder(head);
      report(`docker slot: waiting, ${position} ahead; held by ${reported}`);
    }
    await sleep(pollMs);
  }
}

export function logLine(lock: string, now: Date): Log {
  return (line) => {
    try {
      appendFileSync(join(lock, '..', LOG_FILE), `${now.toISOString()} ${line}\n`);
    } catch {
      // The log is advisory; a full disk must not fail the tests.
    }
  };
}

export function currentHolder(processes: Processes, worktree: string, now: Date): Holder {
  return { pid: process.pid, started: processes.started(process.pid), worktree, since: now.toISOString() };
}

export const USAGE = 'usage: docker-slot.ts run -- <command> [args...] | status';

const SIGNAL_STATUS: Readonly<Record<string, number>> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function exitStatus(code: number | null, signal: NodeJS.Signals | null): number {
  return code ?? SIGNAL_STATUS[signal ?? ''] ?? 1;
}

// Starts the holder as the leader of a new process group and forwards
// signals to that group, which outlives this process if it is killed.
async function run(command: readonly string[]): Promise<number> {
  const script = fileURLToPath(import.meta.url);
  const holder = spawn(process.execPath, [...process.execArgv, script, 'hold', '--', ...command], { detached: true, stdio: 'inherit' });
  for (const signal of Object.keys(SIGNAL_STATUS)) {
    process.on(signal, () => {
      if (holder.pid !== undefined && systemProcesses.groupAlive(holder.pid)) process.kill(-holder.pid, signal as NodeJS.Signals);
    });
  }
  return new Promise<number>((resolve) => holder.on('exit', (code, signal) => resolve(exitStatus(code, signal))));
}

// Holds the slot for the command. Signals reach the whole group from run,
// so the holder only drops its ticket when one interrupts the wait.
async function hold(command: readonly string[], environment: Environment): Promise<number> {
  const lock = lockDirectory(environment);
  const log = (line: string): void => logLine(lock, new Date())(line);
  const ticket = takeTicket(lock, currentHolder(systemProcesses, process.cwd(), new Date()));
  const release = (): void => releaseTicket(ticket);
  process.on('exit', release);
  let running = false;
  for (const signal of Object.keys(SIGNAL_STATUS)) {
    process.on(signal, () => {
      if (running) return;
      release();
      log(`interrupted ticket=${ticket.name} pid=${process.pid} signal=${signal}`);
      process.exit(SIGNAL_STATUS[signal]);
    });
  }
  const pollMs = Number(environment.TASKELITH_DOCKER_SLOT_POLL_MS || 1000);
  const waited = await waitForTurn({
    lock, ticket, processes: systemProcesses, pollMs, now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    report: (line) => process.stderr.write(`${line}\n`), log,
  });
  log(`acquired ticket=${ticket.name} pid=${process.pid} worktree=${process.cwd()} waited=${seconds(waited)}s`);
  if (waited >= pollMs) process.stderr.write(`docker slot: acquired after ${seconds(waited)} s\n`);
  const acquiredAt = Date.now();
  const [file, ...args] = command;
  running = true;
  const child = spawn(file, args, { stdio: 'inherit' });
  const status = await new Promise<number>((resolve) => {
    child.on('error', (error) => {
      process.stderr.write(`docker slot: ${error.message}\n`);
      resolve(127);
    });
    child.on('exit', (code, signal) => resolve(exitStatus(code, signal)));
  });
  release();
  log(`released ticket=${ticket.name} pid=${process.pid} held=${seconds(Date.now() - acquiredAt)}s status=${status}`);
  return status;
}

function status(environment: Environment): string {
  const lock = lockDirectory(environment);
  const { entries } = liveQueue(lock, systemProcesses, Date.now(), logLine(lock, new Date()));
  if (entries.length === 0) return 'docker slot: free\n';
  return entries.map((entry, index) => `${index === 0 ? 'holder' : `waiting ${index}`}: ${describeHolder(entry)}`).join('\n') + '\n';
}

export async function main(args: readonly string[], environment: Environment): Promise<number> {
  if (args[0] === 'status' && args.length === 1) {
    process.stdout.write(status(environment));
    return 0;
  }
  const command = args.slice(2);
  if (args[1] === '--' && command.length > 0) {
    if (args[0] === 'run') return run(command);
    if (args[0] === 'hold') return hold(command, environment);
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
