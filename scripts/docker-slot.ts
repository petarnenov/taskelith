import { execFileSync, spawn } from 'node:child_process';
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
export const HOLDER_FILE = 'holder.json';
export const LOG_FILE = 'docker-slot.log';
// A ticket directory gets its holder file right after mkdir; one without it
// for this long belongs to a process that died in between.
export const UNRECORDED_TICKET_MS = 60_000;
const TICKET_DIGITS = 12;

export function stateDirectory(environment: Environment): string {
  const state = environment.XDG_STATE_HOME || join(environment.HOME || homedir(), '.local', 'state');
  return join(state, 'taskelith');
}

export function lockDirectory(environment: Environment): string {
  return join(stateDirectory(environment), 'docker-slot.lock');
}

export interface Holder {
  readonly pid: number;
  readonly started: string;
  readonly worktree: string;
  readonly since: string;
}

export interface Ticket {
  readonly number: number;
  readonly path: string;
}

// The probes that tell a live holder from a dead one; tests replace them.
export interface Processes {
  readonly alive: (pid: number) => boolean;
  readonly started: (pid: number) => string;
}

export const systemProcesses: Processes = {
  alive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
  started(pid) {
    try {
      return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  },
};

function ticketNumbers(queue: string): number[] {
  return readdirSync(queue).filter((name) => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b);
}

function ticketName(number: number): string {
  return String(number).padStart(TICKET_DIGITS, '0');
}

// mkdir is atomic, so two runs never get one number; a later run always
// gets a higher number than every ticket it saw.
export function takeTicket(lock: string, holder: Holder): Ticket {
  const queue = join(lock, QUEUE);
  mkdirSync(queue, { recursive: true });
  let number = (ticketNumbers(queue).at(-1) ?? 0) + 1;
  for (;;) {
    const path = join(queue, ticketName(number));
    try {
      mkdirSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      number += 1;
      continue;
    }
    writeFileSync(join(path, HOLDER_FILE), `${JSON.stringify(holder)}\n`);
    return { number, path };
  }
}

export function releaseTicket(ticket: Ticket): void {
  rmSync(ticket.path, { recursive: true, force: true });
}

export function readHolder(ticketPath: string): Holder | undefined {
  try {
    return JSON.parse(readFileSync(join(ticketPath, HOLDER_FILE), 'utf8')) as Holder;
  } catch {
    return undefined;
  }
}

function ageMs(path: string, now: number): number {
  try {
    return now - statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// A process ID can be reused, so a holder also has to match its start time.
export function isStale(ticketPath: string, processes: Processes, now: number): boolean {
  const holder = readHolder(ticketPath);
  if (holder === undefined) return ageMs(ticketPath, now) > UNRECORDED_TICKET_MS;
  if (!processes.alive(holder.pid)) return true;
  const started = processes.started(holder.pid);
  return started !== '' && holder.started !== '' && started !== holder.started;
}

export interface QueueEntry {
  readonly ticket: Ticket;
  readonly holder: Holder | undefined;
}

// Removes stale tickets and returns the live queue, the holder first.
export function liveQueue(lock: string, processes: Processes, now: number, log: (line: string) => void): QueueEntry[] {
  const queue = join(lock, QUEUE);
  const live: QueueEntry[] = [];
  for (const number of ticketNumbers(queue)) {
    const ticket = { number, path: join(queue, ticketName(number)) };
    if (isStale(ticket.path, processes, now)) {
      const holder = readHolder(ticket.path);
      releaseTicket(ticket);
      log(`removed stale ticket=${number} pid=${holder?.pid ?? 'unknown'}`);
      continue;
    }
    live.push({ ticket, holder: readHolder(ticket.path) });
  }
  return live;
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
  readonly log: (line: string) => void;
}

// Waits until this ticket is the lowest live one and returns how many ms it
// waited; reports the holder whenever it changes.
export async function waitForTurn(options: WaitOptions): Promise<number> {
  const { lock, ticket, processes, pollMs, now, sleep, report, log } = options;
  const start = now();
  let reported = '';
  for (;;) {
    const queue = liveQueue(lock, processes, now(), log);
    const head = queue[0];
    if (head === undefined) throw new Error(`docker slot: ticket ${ticket.number} vanished from ${lock}`);
    if (head.ticket.number === ticket.number) return now() - start;
    const description = describeHolder(head);
    if (description !== reported) {
      const position = queue.findIndex((entry) => entry.ticket.number === ticket.number);
      report(`docker slot: waiting, ${position} ahead; held by ${description}`);
      reported = description;
    }
    await sleep(pollMs);
  }
}

export function logLine(lock: string, now: Date): (line: string) => void {
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

// Holds the slot for the command; signals reach the command, and the ticket
// goes when it exits, or at once when the wait is interrupted.
async function run(command: readonly string[], environment: Environment): Promise<number> {
  const lock = lockDirectory(environment);
  const log = (line: string): void => logLine(lock, new Date())(line);
  const ticket = takeTicket(lock, currentHolder(systemProcesses, process.cwd(), new Date()));
  const release = (): void => releaseTicket(ticket);
  process.on('exit', release);
  let child: ReturnType<typeof spawn> | undefined;
  for (const signal of Object.keys(SIGNAL_STATUS)) {
    process.on(signal, () => {
      if (child === undefined) {
        release();
        log(`interrupted ticket=${ticket.number} pid=${process.pid} signal=${signal}`);
        process.exit(SIGNAL_STATUS[signal]);
      }
      child.kill(signal as NodeJS.Signals);
    });
  }
  const pollMs = Number(environment.TASKELITH_DOCKER_SLOT_POLL_MS || 1000);
  const waited = await waitForTurn({
    lock, ticket, processes: systemProcesses, pollMs, now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    report: (line) => process.stderr.write(`${line}\n`), log,
  });
  log(`acquired ticket=${ticket.number} pid=${process.pid} worktree=${process.cwd()} waited=${seconds(waited)}s`);
  if (waited >= pollMs) process.stderr.write(`docker slot: acquired after ${seconds(waited)} s\n`);
  const acquiredAt = Date.now();
  const [file, ...args] = command;
  child = spawn(file, args, { stdio: 'inherit' });
  const status = await new Promise<number>((resolve) => {
    child?.on('error', (error) => {
      process.stderr.write(`docker slot: ${error.message}\n`);
      resolve(127);
    });
    child?.on('exit', (code, signal) => resolve(code ?? SIGNAL_STATUS[signal ?? ''] ?? 1));
  });
  release();
  log(`released ticket=${ticket.number} pid=${process.pid} held=${seconds(Date.now() - acquiredAt)}s status=${status}`);
  return status;
}

function status(environment: Environment): string {
  const lock = lockDirectory(environment);
  let queue: QueueEntry[] = [];
  try {
    queue = liveQueue(lock, systemProcesses, Date.now(), logLine(lock, new Date()));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (queue.length === 0) return 'docker slot: free\n';
  return queue.map((entry, index) => `${index === 0 ? 'holder' : `waiting ${index}`}: ${describeHolder(entry)}`).join('\n') + '\n';
}

export async function main(args: readonly string[], environment: Environment): Promise<number> {
  if (args[0] === 'status' && args.length === 1) {
    process.stdout.write(status(environment));
    return 0;
  }
  if (args[0] === 'run' && args[1] === '--' && args.length > 2) return run(args.slice(2), environment);
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
