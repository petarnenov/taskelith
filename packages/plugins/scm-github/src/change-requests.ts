import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import type { GithubApi } from './github-api.js';
import { malformed, recordOf, refusal, textOf, textsOf, type JsonRecord } from './github-data.js';
import { parseRepository, type RepositoryName } from './repository-name.js';

// Pull requests, commit statuses, protected branches, and merges, all as
// the plugin's own identity.

// GitHub's `merge_method` for each port merge method.
export const GITHUB_MERGE_METHODS: Readonly<Record<string, string>> = Object.freeze({
  'merge-commit': 'merge',
  squash: 'squash',
  rebase: 'rebase',
});

const STATUS_STATES: ReadonlySet<string> = new Set(['pending', 'success', 'failure', 'error']);
const PULL_NUMBER = /^[1-9]\d{0,9}$/;
// A merge GitHub refuses: 405 while protection blocks it, 409 for a head
// other than the expected one.
const MERGE_REFUSALS: ReadonlySet<number> = new Set([405, 409]);

export class GithubChangeRequests {
  constructor(
    private readonly api: GithubApi,
    private readonly mergeMethods: readonly string[],
  ) {}

  async resolveRemoteUrl({ repository }: draft.RepositoryRequest): Promise<Result<draft.RepositoryRemote>> {
    const name = parseRepository(repository);
    if (!name.ok) return name;
    const read = await this.api.asApp('GET /repos/{owner}/{repo}', { ...name.value });
    if (!read.ok) return err(refusal(read.error, 'read a repository'));
    const remoteUrl = textOf(recordOf(read.value.data)['clone_url']);
    if (remoteUrl === undefined || !isPlainHttpsUrl(remoteUrl)) return err(malformed('a repository read'));
    return ok({ repository, remoteUrl });
  }

  // Required statuses bind the App only with enforce_admins (GitHub
  // qualification); contexts GitHub already required are kept.
  async ensureMergeProtection(request: draft.MergeProtectionRequest): Promise<Result<draft.MergeProtectionData>> {
    const name = parseRepository(request.repository);
    if (!name.ok) return name;
    const branch = { ...name.value, branch: request.branch };
    const existing = await this.requiredContexts(branch);
    if (!existing.ok) return existing;
    const contexts = [...new Set([...existing.value, ...request.requiredStatuses])];
    const protectedBranch = await this.api.asApp('PUT /repos/{owner}/{repo}/branches/{branch}/protection', {
      ...branch,
      required_status_checks: { strict: false, contexts },
      enforce_admins: true,
      required_pull_request_reviews: null,
      restrictions: null,
    });
    if (!protectedBranch.ok) return err(refusal(protectedBranch.error, 'protect a branch'));
    const data = recordOf(protectedBranch.value.data);
    return ok({
      repository: request.repository,
      branch: request.branch,
      requiredStatuses: textsOf(recordOf(data['required_status_checks'])['contexts']),
      bindsProvider: recordOf(data['enforce_admins'])['enabled'] === true,
    });
  }

  async openChangeRequest(request: draft.OpenChangeRequest): Promise<Result<draft.ChangeRequestData>> {
    const name = parseRepository(request.repository);
    if (!name.ok) return name;
    const opened = await this.api.asApp('POST /repos/{owner}/{repo}/pulls', {
      ...name.value,
      title: request.title,
      body: request.description,
      head: request.headBranch,
      base: request.baseBranch,
    });
    if (!opened.ok) return err(refusal(opened.error, 'open a pull request'));
    return changeRequestData(request.repository, opened.value.data);
  }

  async readChangeRequest(request: draft.ChangeRequestReference): Promise<Result<draft.ChangeRequestData>> {
    const pull = pullOf(request);
    if (!pull.ok) return pull;
    const read = await this.api.asApp('GET /repos/{owner}/{repo}/pulls/{pull_number}', { ...pull.value });
    if (!read.ok) return err(refusal(read.error, 'read a pull request'));
    return changeRequestData(request.repository, read.value.data);
  }

  async setCommitStatus(request: draft.CommitStatusRequest): Promise<Result<draft.CommitStatusData>> {
    const name = parseRepository(request.repository);
    if (!name.ok) return name;
    if (!STATUS_STATES.has(request.state)) return err(failure('invalid', 'Unknown commit status state'));
    const posted = await this.api.asApp('POST /repos/{owner}/{repo}/statuses/{sha}', {
      ...name.value,
      sha: request.commit,
      state: request.state,
      context: request.context,
      description: request.description,
      ...(request.targetUrl === undefined ? {} : { target_url: request.targetUrl }),
    });
    if (!posted.ok) return err(refusal(posted.error, 'set a commit status'));
    const data = recordOf(posted.value.data);
    const state = textOf(data['state']);
    const context = textOf(data['context']);
    if (state === undefined || context === undefined) return err(malformed('a commit status'));
    return ok({ repository: request.repository, commit: request.commit, context, state });
  }

  async mergeChangeRequest(request: draft.ChangeRequestMerge): Promise<Result<draft.MergeResult>> {
    if (!this.mergeMethods.includes(request.method)) {
      return err(failure('unavailable', 'The merge method is not declared for this installation'));
    }
    const pull = pullOf(request);
    if (!pull.ok) return pull;
    const merged = await this.api.asApp('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
      ...pull.value,
      sha: request.expectedHead,
      merge_method: GITHUB_MERGE_METHODS[request.method],
    });
    if (!merged.ok && MERGE_REFUSALS.has(merged.error.status)) {
      return err(failure('precondition-failed', 'GitHub refused the merge', { status: String(merged.error.status) }));
    }
    if (!merged.ok) return err(refusal(merged.error, 'merge a pull request'));
    const data = recordOf(merged.value.data);
    const mergeCommit = textOf(data['sha']);
    if (data['merged'] !== true || mergeCommit === undefined) return err(malformed('a merge'));
    return ok({ changeRequest: request.changeRequest, mergeCommit, method: request.method });
  }

  private async requiredContexts(branch: RepositoryName & { branch: string }): Promise<Result<readonly string[]>> {
    const read = await this.api.asApp('GET /repos/{owner}/{repo}/branches/{branch}/protection', { ...branch });
    if (!read.ok && read.error.status === 404) return ok([]);
    if (!read.ok) return err(refusal(read.error, "read a branch's protection"));
    return ok(textsOf(recordOf(recordOf(read.value.data)['required_status_checks'])['contexts']));
  }
}

function pullOf(request: draft.ChangeRequestReference): Result<RepositoryName & { pull_number: string }> {
  const name = parseRepository(request.repository);
  if (!name.ok) return name;
  if (!PULL_NUMBER.test(request.changeRequest)) return err(failure('not-found', 'Unknown pull request'));
  return ok({ ...name.value, pull_number: request.changeRequest });
}

function changeRequestData(repository: string, data: unknown): Result<draft.ChangeRequestData> {
  const pull = recordOf(data);
  const head = recordOf(pull['head']);
  const fields = {
    number: typeof pull['number'] === 'number' && Number.isSafeInteger(pull['number']) ? String(pull['number']) : undefined,
    baseBranch: textOf(recordOf(pull['base'])['ref']),
    headBranch: textOf(head['ref']),
    headCommit: textOf(head['sha']),
    state: stateOf(pull),
    url: textOf(pull['html_url']),
  };
  const { number, baseBranch, headBranch, headCommit, state, url } = fields;
  if (number === undefined || baseBranch === undefined || headBranch === undefined || headCommit === undefined
    || state === undefined || url === undefined) {
    return err(malformed('a pull request'));
  }
  return ok({ id: number, repository, baseBranch, headBranch, headCommit, state, url });
}

function stateOf(pull: JsonRecord): string | undefined {
  if (textOf(pull['merged_at']) !== undefined) return 'merged';
  const state = textOf(pull['state']);
  return state === 'open' || state === 'closed' ? state : undefined;
}

function isPlainHttpsUrl(text: string): boolean {
  if (!URL.canParse(text)) return false;
  const url = new URL(text);
  return url.protocol === 'https:' && url.username === '' && url.password === '' && url.search === '' && url.hash === ''
    && !/\s/.test(text);
}
