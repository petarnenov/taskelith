import { spawn } from 'node:child_process';
import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
import { REDACTED_VALUE, gitConfigEnvironment, type GitClientPin, type WorkspaceCredential } from '@taskelith/workspace';

export interface GitCommand {
  readonly args: readonly string[];
  // The directory the process starts in.
  readonly cwd: string;
  // Only a process that reaches the remote gets the credential's header.
  readonly credential?: WorkspaceCredential;
  readonly input?: Uint8Array;
}

export interface GitOutput {
  // Null when a signal ended the process.
  readonly exitCode: number | null;
  // Data that the adapter parses, scrubbed like standard error.
  readonly stdout: Uint8Array;
  // Scrubbed of every form of the command's credential.
  readonly stderr: string;
}

// Every non-empty form of the credential (contract section 7), however
// short; the conformance heuristic's minimum length does not apply here.
export function credentialForms({ secret, authorization }: WorkspaceCredential): string[] {
  const parts = [secret, authorization, ...authorization.split(' ').slice(1)];
  const forms = [...parts, ...parts.map((part) => Buffer.from(part, 'utf8').toString('base64'))];
  return [...new Set(forms)].filter((form) => form.length > 0);
}

export function scrubCredential(text: string, credential?: WorkspaceCredential): string {
  return credential === undefined ? text : redact(text, credentialForms(credential));
}

// Bytes as latin1 text, one character per byte, so that every other byte
// of the output survives.
function scrubOutput(output: Uint8Array, credential?: WorkspaceCredential): Uint8Array {
  if (credential === undefined) return output;
  const forms = credentialForms(credential).map((form) => Buffer.from(form, 'utf8').toString('latin1'));
  return new Uint8Array(Buffer.from(redact(Buffer.from(output).toString('latin1'), forms), 'latin1'));
}

// One pass, the longest form first, so no part of a longer form survives
// and no replacement is matched again.
function redact(text: string, forms: readonly string[]): string {
  const pattern = [...forms].sort((left, right) => right.length - left.length).map(escapePattern).join('|');
  return text.replace(new RegExp(pattern, 'g'), REDACTED_VALUE);
}

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Node copies its own NODE_V8_COVERAGE into a child's environment unless
// that environment names it; naming it as undefined leaves it out.
const RUNTIME_ADDITIONS = { NODE_V8_COVERAGE: undefined };

// A Git process that runs longer is killed with its whole process group
// (contract section 7); `GitWorkspacesOptions` can set another bound.
export const GIT_TIME_LIMIT_MS = 10 * 60 * 1000;

// Starts the pinned client with the built environment only: nothing of the
// worker's own environment reaches Git, and no credential is an argument.
export class GitRunner {
  readonly pin: GitClientPin;
  readonly timeLimitMs: number;

  constructor(pin: GitClientPin, timeLimitMs = GIT_TIME_LIMIT_MS) {
    if (!Number.isSafeInteger(timeLimitMs) || timeLimitMs <= 0) throw new RangeError(`invalid Git time limit ${timeLimitMs}`);
    this.pin = pin;
    this.timeLimitMs = timeLimitMs;
  }

  withTimeLimit(timeLimitMs: number): GitRunner {
    return new GitRunner(this.pin, timeLimitMs);
  }

  run(command: GitCommand): Promise<Result<GitOutput>> {
    return new Promise((done) => {
      // A process group of its own, so the time limit kills Git's helpers.
      const child = spawn(this.pin.path, command.args, {
        cwd: command.cwd,
        env: { ...gitConfigEnvironment(command.credential?.authorization), ...RUNTIME_ADDITIONS },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killGroup(child.pid);
      }, this.timeLimitMs);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        done(err(failure('unavailable', `cannot start ${this.pin.path}: ${scrubCredential(error.message, command.credential)}`)));
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (timedOut) return done(err(this.#timeLimitFailure(command)));
        const text = scrubCredential(Buffer.concat(stderr).toString('utf8'), command.credential);
        done(ok({ exitCode, stdout: scrubOutput(Buffer.concat(stdout), command.credential), stderr: text }));
      });
      // A Git that exits early closes its input; its exit code reports it.
      child.stdin.on('error', () => {});
      child.stdin.end(command.input ?? new Uint8Array());
    });
  }

  // Only a process that reaches the remote carries a credential, so a
  // stalled remote is `unavailable` and a stalled local Git `internal`.
  #timeLimitFailure(command: GitCommand) {
    const code: FailureCode = command.credential === undefined ? 'internal' : 'unavailable';
    return failure(code, `${this.pin.path} ran longer than ${this.timeLimitMs} ms and was killed`);
  }
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

// The output of a process that must succeed; otherwise a failure whose
// message holds only the scrubbed standard error.
export function succeeded(result: Result<GitOutput>, code: FailureCode, what: string): Result<Uint8Array> {
  if (!result.ok) return result;
  if (result.value.exitCode === 0) return ok(result.value.stdout);
  return err(failure(code, `${what} failed (exit ${result.value.exitCode}): ${result.value.stderr.trim()}`));
}
