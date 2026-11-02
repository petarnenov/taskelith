import { failsWith, succeeds, type ConformanceCase } from './conformance-case.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readRepositoryRemote } from './source-control-readers.js';
import type { RepositoryRemote } from './source-control.js';

// The remote URL must be the one the fixture knows natively, two repositories
// must not share one, and a repository the plugin cannot see has none.
export async function checkRepositoryRemote(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const project = await resolve(run, fixture, fixture.projectRepository);
  run.expect(project.remoteUrl === fixture.projectRemoteUrl, 'resolveRemoteUrl returned another remoteUrl than the fixture names');
  const foreign = await resolve(run, fixture, fixture.foreignRepository);
  run.expect(foreign.remoteUrl !== project.remoteUrl, 'resolveRemoteUrl returned the same remoteUrl for two repositories');
  await failsWith(
    run,
    'resolveRemoteUrl of a repository the plugin cannot see',
    () => fixture.provider.resolveRemoteUrl({ repository: fixture.hiddenRepository }),
    'not-found',
  );
}

async function resolve(run: ConformanceCase, fixture: SourceControlConformanceFixture, repository: string): Promise<RepositoryRemote> {
  const remote = await succeeds(
    run,
    'resolveRemoteUrl',
    () => fixture.provider.resolveRemoteUrl({ repository }),
    readRepositoryRemote,
  );
  run.expect(remote.repository === repository, 'resolveRemoteUrl returned another repository than requested');
  return remote;
}
