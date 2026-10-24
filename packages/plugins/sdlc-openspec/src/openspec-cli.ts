import { execFile, type ExecFileException } from 'node:child_process';
import { err, failure, ok, type Result } from '@taskelith/kernel';

export interface OpenSpecCliOptions {
  // The pinned `openspec` executable, supplied by the composition root.
  readonly executable: string;
  readonly environment?: Readonly<Record<string, string>>;
}

// The parsed `--json` output of one command and whether the command succeeded;
// some commands, such as `validate`, report a negative answer by failing.
export interface CliOutput {
  readonly succeeded: boolean;
  readonly json: unknown;
}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_STDERR_DETAIL = 2000;

// Set after the caller's environment, so that no option turns telemetry on.
const NO_TELEMETRY = Object.freeze({ OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1' });

export function runOpenSpec(options: OpenSpecCliOptions, directory: string, args: readonly string[]): Promise<Result<CliOutput>> {
  const command = ['openspec', ...args].join(' ');
  const environment = { ...process.env, ...options.environment, ...NO_TELEMETRY };
  return new Promise((resolve) => {
    execFile(
      options.executable,
      [...args, '--json'],
      { cwd: directory, env: environment, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => resolve(readOutput(command, error, stdout, stderr)),
    );
  });
}

function readOutput(command: string, error: ExecFileException | null, stdout: string, stderr: string): Result<CliOutput> {
  if (error !== null && typeof error.code !== 'number') {
    return err(failure('unavailable', `${command} could not run: ${error.message}`, { command }));
  }
  try {
    return ok({ succeeded: error === null, json: JSON.parse(stdout) });
  } catch {
    return err(failure('internal', `${command} printed no JSON`, { command, stderr: stderr.slice(0, MAX_STDERR_DETAIL) }));
  }
}
