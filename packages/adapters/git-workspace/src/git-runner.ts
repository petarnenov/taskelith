import type { Result } from '@taskelith/kernel';
import type { GitClientPin, WorkspaceCredential } from '@taskelith/workspace';

export interface GitCommand {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly credential?: WorkspaceCredential;
  readonly input?: Uint8Array;
}

export interface GitOutput {
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
  readonly stderr: string;
}

export function scrubCredential(_text: string, _credential?: WorkspaceCredential): string {
  throw new Error('not implemented');
}

export class GitRunner {
  constructor(readonly pin: GitClientPin) {}

  run(_command: GitCommand): Promise<Result<GitOutput>> {
    throw new Error('not implemented');
  }
}
