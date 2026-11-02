import { succeeds, type ConformanceCase } from './conformance-case.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readRepositoryRemote } from './source-control-readers.js';
import type { RepositoryRemote } from './source-control.js';

// The remote URL that the plugin derives must be the one the fixture knows
// natively, and two repositories must not share one.
export async function checkRepositoryRemote(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const project = await resolve(run, fixture, fixture.projectRepository);
  run.expect(project.remoteUrl === fixture.projectRemoteUrl, 'resolveRemoteUrl returned another remoteUrl than the fixture names');
  const foreign = await resolve(run, fixture, fixture.foreignRepository);
  run.expect(foreign.remoteUrl !== project.remoteUrl, 'resolveRemoteUrl returned the same remoteUrl for two repositories');
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
