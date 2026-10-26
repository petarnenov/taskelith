import { parseInstant } from '@taskelith/kernel';
import { fixtureStep, nothing, succeeds, type ConformanceCase } from './conformance-case.js';
import { isSameSet, isSubset } from './conformance-steps.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readRunCredential } from './source-control-readers.js';
import { SCM_PERMISSIONS, type RunCredential, type RunCredentialRequest } from './source-control.js';
import { describe } from './untrusted-shapes.js';

// Cases for run credentials: what each grant claims, and what the fixture
// can natively do with it.

const READ_ONLY = Object.freeze(['read-code']);
const READ_WRITE = Object.freeze(['read-code', 'write-code']);

export async function checkReadOnlyCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-read-only', READ_ONLY);
  run.expect(!credential.permissions.includes('write-code'), 'a read-only credential must not grant write-code');
  await expectWriteRefused(run, fixture, credential, fixture.projectRepository);
}

export async function checkWriteCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-write', READ_WRITE);
  await expectWriteAllowed(run, fixture, credential);
  await expectWriteRefused(run, fixture, credential, fixture.foreignRepository);
}

// A refresh keeps the grant and extends it; the native probes run again,
// as the service may have widened what the new token can do.
export async function checkRefreshedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const original = await issueCredential(run, fixture, 'conformance-refresh', READ_WRITE);
  const refreshed = await succeeds(
    run,
    'refreshRunCredential',
    () => fixture.provider.refreshRunCredential({ credentialId: original.credentialId }),
    readRunCredential,
  );
  checkGrant(run, 'refreshRunCredential', grantOf(original), refreshed);
  run.expect(isSameSet(refreshed.permissions, original.permissions), 'refreshRunCredential changed the permissions');
  run.expect(
    Date.parse(refreshed.expiresAt) > Date.parse(original.expiresAt),
    `refreshRunCredential must extend expiresAt beyond ${original.expiresAt}, not return ${refreshed.expiresAt}`,
  );
  await expectWriteAllowed(run, fixture, refreshed);
  await expectWriteRefused(run, fixture, refreshed, fixture.foreignRepository);
}

// The write before the revocation shows that the refusal after it comes
// from the revocation.
export async function checkRevokedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-revoke', READ_WRITE);
  await expectWriteAllowed(run, fixture, credential);
  await succeeds(
    run,
    'revokeRunCredential',
    () => fixture.provider.revokeRunCredential({ credentialId: credential.credentialId }),
    nothing,
  );
  await expectWriteRefused(run, fixture, credential, fixture.projectRepository);
}

async function issueCredential(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  runId: string,
  permissions: readonly string[],
): Promise<RunCredential> {
  const request = { runId, repositories: [fixture.projectRepository], permissions };
  const credential = await succeeds(
    run,
    'issueRunCredential',
    () => fixture.provider.issueRunCredential({ runId, repositories: [...request.repositories], permissions: [...permissions] }),
    readRunCredential,
  );
  checkGrant(run, 'issueRunCredential', request, credential);
  return credential;
}

function grantOf(credential: RunCredential): RunCredentialRequest {
  return { runId: credential.runId, repositories: credential.repositories, permissions: credential.permissions };
}

// A grant must cover the request in port terms, for the requested
// repositories only, and expire in the future.
function checkGrant(run: ConformanceCase, operation: string, request: RunCredentialRequest, credential: RunCredential): void {
  run.expect(credential.runId === request.runId, `${operation} returned run ${credential.runId}, not ${request.runId}`);
  run.expect(
    isSameSet(credential.repositories, request.repositories),
    `${operation} granted ${describe(credential.repositories)}, not exactly ${describe(request.repositories)}`,
  );
  run.expect(
    isSubset(request.permissions, credential.permissions) && isSubset(credential.permissions, SCM_PERMISSIONS),
    `${operation} granted ${describe(credential.permissions)} for ${describe(request.permissions)}`,
  );
  run.expect(
    parseInstant(credential.expiresAt).ok && Date.parse(credential.expiresAt) > Date.now(),
    `${operation} returned expiresAt ${credential.expiresAt}, not a canonical future instant`,
  );
}

async function expectWriteAllowed(run: ConformanceCase, fixture: SourceControlConformanceFixture, credential: RunCredential): Promise<void> {
  const write = await fixtureStep(run, 'attemptWrite', () => fixture.attemptWrite(credential, fixture.projectRepository));
  run.expect(write.ok, `credential ${credential.credentialId} could not write to ${fixture.projectRepository}`);
}

async function expectWriteRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
  repository: string,
): Promise<void> {
  const write = await fixtureStep(run, 'attemptWrite', () => fixture.attemptWrite(credential, repository));
  run.expect(
    !write.ok && write.error.code === 'forbidden',
    `credential ${credential.credentialId} writing to ${repository} must fail with forbidden`,
  );
}
