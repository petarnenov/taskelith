import { ok, type Result } from '@taskelith/kernel';
import { GIT_NEUTRAL_DIRECTORY, checkGitClient, type GitClientPin } from '@taskelith/workspace';
import { GitRunner } from './git-runner.js';

// A Git client whose `git --version` printed exactly its pin's version;
// the adapter takes only such a client (contract section 7).
export class VerifiedGitClient {
  readonly runner: GitRunner;
  // A private field makes the type nominal: no other object is one.
  readonly #verified = true;

  private constructor(runner: GitRunner) {
    this.runner = runner;
  }

  static async verify(pin: GitClientPin): Promise<Result<VerifiedGitClient>> {
    const runner = new GitRunner(pin);
    const output = await runner.run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY });
    const reported = output.ok && output.value.exitCode === 0 ? new TextDecoder().decode(output.value.stdout) : '';
    const gate = checkGitClient(pin, reported);
    return gate.ok ? ok(new VerifiedGitClient(runner)) : gate;
  }
}

export function verifyGitClient(pin: GitClientPin): Promise<Result<VerifiedGitClient>> {
  return VerifiedGitClient.verify(pin);
}
