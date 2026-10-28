import { spawn } from 'node:child_process';
import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
import { REDACTED_VALUE, gitConfigEnvironment, sensitiveValues, type GitClientPin, type WorkspaceCredential } from '@taskelith/workspace';

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
  // Data that the adapter parses; it never reaches a message or a log.
  readonly stdout: Uint8Array;
  // Scrubbed of every form of the command's credential.
  readonly stderr: string;
}

// Every form of the credential (contract section 7) becomes REDACTED_VALUE,
// the longest first, so no part of a longer form survives.
export function scrubCredential(text: string, credential?: WorkspaceCredential): string {
  if (credential === undefined) return text;
  const forms = sensitiveValues([credential]).sort((left, right) => right.length - left.length);
  return forms.reduce((scrubbed, form) => scrubbed.split(form).join(REDACTED_VALUE), text);
}

// Starts the pinned client with the built environment only: nothing of the
// worker's own environment reaches Git, and no credential is an argument.
export class GitRunner {
  readonly pin: GitClientPin;

  constructor(pin: GitClientPin) {
    this.pin = pin;
  }

  run(command: GitCommand): Promise<Result<GitOutput>> {
    return new Promise((done) => {
      const child = spawn(this.pin.path, command.args, {
        cwd: command.cwd,
        env: gitConfigEnvironment(command.credential?.authorization),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error) => done(err(failure('unavailable', `cannot start ${this.pin.path}: ${scrubCredential(error.message, command.credential)}`))));
      child.on('close', (exitCode) => {
        const text = scrubCredential(Buffer.concat(stderr).toString('utf8'), command.credential);
        done(ok({ exitCode, stdout: new Uint8Array(Buffer.concat(stdout)), stderr: text }));
      });
      // A Git that exits early closes its input; its exit code reports it.
      child.stdin.on('error', () => {});
      child.stdin.end(command.input ?? new Uint8Array());
    });
  }
}

// The output of a process that must succeed; otherwise a failure whose
// message holds only the scrubbed standard error.
export function succeeded(result: Result<GitOutput>, code: FailureCode, what: string): Result<Uint8Array> {
  if (!result.ok) return result;
  if (result.value.exitCode === 0) return ok(result.value.stdout);
  return err(failure(code, `${what} failed (exit ${result.value.exitCode}): ${result.value.stderr.trim()}`));
}
