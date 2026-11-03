import type { ApiReply } from './github-conformance-client.ts';
import { CONFORMANCE_REPOSITORIES } from './github-conformance-settings.ts';

// Finds the App's installation on the disposable repositories and checks
// that its token sees project and foreign but not hidden. IDs and names only.

export type Requester = (method: string, path: string) => Promise<ApiReply>;

export interface RepositoryInstallation {
  readonly repository: string;
  readonly status: number;
  readonly installationId: string | undefined;
  readonly account: string | undefined;
}

export interface Discovery {
  readonly installations: readonly RepositoryInstallation[];
  readonly installationId: string | undefined;
  readonly visibleRepositories: readonly string[];
  readonly hiddenStatus: number | undefined;
  readonly problems: readonly string[];
}

const { project, foreign, hidden } = CONFORMANCE_REPOSITORIES;

export async function discoverInstallation(
  asApp: Requester,
  asInstallation: (installationId: string) => Requester,
): Promise<Discovery> {
  const installations: RepositoryInstallation[] = [];
  for (const repository of [project, foreign, hidden]) installations.push(await installationOf(asApp, repository));
  const problems = installationProblems(installations);
  const installationId = installations[0]!.installationId;
  if (installationId === undefined) return { installations, installationId, visibleRepositories: [], hiddenStatus: undefined, problems };
  const request = asInstallation(installationId);
  const visibleRepositories = await visibleTo(request);
  const hiddenStatus = (await request('GET', `/repos/${hidden}`)).status;
  problems.push(...visibilityProblems(visibleRepositories, hiddenStatus));
  return { installations, installationId, visibleRepositories, hiddenStatus, problems };
}

async function installationOf(asApp: Requester, repository: string): Promise<RepositoryInstallation> {
  const reply = await asApp('GET', `/repos/${repository}/installation`);
  const data = reply.status === 200 ? reply.data as { id?: unknown; account?: { login?: unknown } } | null : null;
  const id = data?.id;
  const login = data?.account?.login;
  return {
    repository,
    status: reply.status,
    installationId: typeof id === 'number' ? String(id) : undefined,
    account: typeof login === 'string' ? login : undefined,
  };
}

export function installationProblems(installations: readonly RepositoryInstallation[]): string[] {
  const [onProject, onForeign, onHidden] = installations;
  const problems: string[] = [];
  if (onProject?.installationId === undefined) problems.push(`the App is not installed on ${project}`);
  if (onForeign?.installationId === undefined) problems.push(`the App is not installed on ${foreign}`);
  else if (onForeign.installationId !== onProject?.installationId) problems.push(`${foreign} has another installation`);
  if (onHidden?.status !== 404) problems.push(`the App's view of ${hidden} answered ${onHidden?.status}, not 404`);
  return problems;
}

export function visibilityProblems(visible: readonly string[], hiddenStatus: number): string[] {
  const names = new Set(visible.map((name) => name.toLowerCase()));
  const problems = [project, foreign].filter((name) => !names.has(name)).map((name) => `the token does not see ${name}`);
  if (names.has(hidden)) problems.push(`the token sees ${hidden}`);
  if (hiddenStatus !== 404) problems.push(`the token's read of ${hidden} answered ${hiddenStatus}, not 404`);
  return problems;
}

async function visibleTo(request: Requester): Promise<string[]> {
  const reply = await request('GET', '/installation/repositories?per_page=100');
  const repositories = (reply.data as { repositories?: unknown } | null)?.repositories;
  if (reply.status !== 200 || !Array.isArray(repositories)) throw new Error(`listing the token's repositories returned ${reply.status}`);
  return repositories.map((repository) => (repository as { full_name?: unknown }).full_name).filter((name) => typeof name === 'string');
}
