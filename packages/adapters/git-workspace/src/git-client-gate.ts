import type { Result } from '@taskelith/kernel';
import type { GitClientPin } from '@taskelith/workspace';
import type { GitRunner } from './git-runner.js';

export class VerifiedGitClient {
  private constructor(readonly runner: GitRunner) {}

  static create(_runner: GitRunner): VerifiedGitClient {
    throw new Error('not implemented');
  }
}

export function verifyGitClient(_pin: GitClientPin): Promise<Result<VerifiedGitClient>> {
  throw new Error('not implemented');
}
