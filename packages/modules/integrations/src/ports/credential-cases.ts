import { parseInstant, type Result } from '@taskelith/kernel';
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
const CHANGE_REQUESTS = Object.freeze(['read-code', 'write-change-requests']);
const STATUSES = Object.freeze(['read-code', 'write-statuses']);

interface Probe {
  readonly permission: string;
  readonly credential: RunCredential;
  readonly repository: string;
  readonly when?: string;
}

export async function checkReadOnlyCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-read-only', READ_ONLY);
  await expectGrantedAccess(run, fixture, credential);
}

export async function checkWriteCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-write', READ_WRITE);
  await expectGrantedAccess(run, fixture, credential);
}

export async function checkChangeRequestAndStatusCredentials(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
): Promise<void> {
  const changeRequests = await issueCredential(run, fixture, 'conformance-change-requests', CHANGE_REQUESTS);
  await expectGrantedAccess(run, fixture, changeRequests);
  const statuses = await issueCredential(run, fixture, 'conformance-statuses', STATUSES);
  await expectGrantedAccess(run, fixture, statuses);
}

// A refresh keeps the grant, extends it, and replaces the secret; the old
// secret must stop working, and the new one gets the native probes again.
export async function checkRefreshedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  await expectRefreshed(run, fixture, 'conformance-refresh-read-only', READ_ONLY);
  await expectRefreshed(run, fixture, 'conformance-refresh', SCM_PERMISSIONS);
}

// The access before the revocation shows that the refusals after it come
// from the revocation.
export async function checkRevokedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-revoke', SCM_PERMISSIONS);
  await expectGrantedAccess(run, fixture, credential);
  await revoke(run, fixture, credential);
  await expectEnded(run, fixture, credential, 'after its revocation');
}

// Credentials of runs that overlap stay apart: a grant for one run never
// widens another, and revoking one leaves the other working.
export async function checkCredentialIsolation(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const project = fixture.projectRepository;
  const reader = await issueCredential(run, fixture, 'conformance-isolation-reader', READ_ONLY);
  const writer = await issueCredential(run, fixture, 'conformance-isolation-writer', READ_WRITE);
  run.expect(reader.secret !== writer.secret, 'credentials of two runs must have distinct secrets');
  const afterGrant = 'after another run got write-code';
  await expectRefused(run, fixture, { permission: 'write-code', credential: reader, repository: project, when: afterGrant });
  await revoke(run, fixture, writer);
  const afterRevocation = 'after another run was revoked';
  await expectAllowed(run, fixture, { permission: 'read-code', credential: reader, repository: project, when: afterRevocation });
  const laterReader = await issueCredential(run, fixture, 'conformance-isolation-later-reader', READ_ONLY);
  const laterWriter = await issueCredential(run, fixture, 'conformance-isolation-later-writer', READ_WRITE);
  await expectAllowed(run, fixture, { permission: 'read-code', credential: laterReader, repository: project });
  await revoke(run, fixture, laterReader);
  await expectEnded(run, fixture, laterReader, 'after its revocation');
  await expectAllowed(run, fixture, { permission: 'write-code', credential: laterWriter, repository: project, when: afterRevocation });
}

async function expectRefreshed(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  runId: string,
  permissions: readonly string[],
): Promise<void> {
  const original = await issueCredential(run, fixture, runId, permissions);
  const refreshed = await succeeds(
    run,
    'refreshRunCredential',
    () => fixture.provider.refreshRunCredential({ credentialId: original.credentialId }),
    readRunCredential,
  );
  checkGrant(run, 'refreshRunCredential', grantOf(original), refreshed);
  run.expect(isSameSet(refreshed.permissions, original.permissions), 'refreshRunCredential changed the permissions');
  run.expect(refreshed.secret !== original.secret, 'refreshRunCredential must return a new secret');
  run.expect(
    Date.parse(refreshed.expiresAt) > Date.parse(original.expiresAt),
    `refreshRunCredential must extend expiresAt beyond ${original.expiresAt}, not return ${refreshed.expiresAt}`,
  );
  await expectEnded(run, fixture, original, 'after its refresh');
  await expectGrantedAccess(run, fixture, refreshed);
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

function revoke(run: ConformanceCase, fixture: SourceControlConformanceFixture, credential: RunCredential): Promise<void> {
  return succeeds(
    run,
    'revokeRunCredential',
    () => fixture.provider.revokeRunCredential({ credentialId: credential.credentialId }),
    nothing,
  );
}

function grantOf(credential: RunCredential): RunCredentialRequest {
  return { runId: credential.runId, repositories: credential.repositories, permissions: credential.permissions };
}

// Effective permissions may exceed the request where the service has no
// narrower one, but never add write-code to a request without it.
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
    request.permissions.includes('write-code') || !credential.permissions.includes('write-code'),
    `${operation} granted write-code to a request without it`,
  );
  run.expect(
    parseInstant(credential.expiresAt).ok && Date.parse(credential.expiresAt) > Date.now(),
    `${operation} returned expiresAt ${credential.expiresAt}, not a canonical future instant`,
  );
}

// In the project, the credential does exactly what its effective
// permissions allow; outside it, nothing.
async function expectGrantedAccess(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
): Promise<void> {
  for (const permission of SCM_PERMISSIONS) {
    const inProject = { permission, credential, repository: fixture.projectRepository };
    if (credential.permissions.includes(permission)) await expectAllowed(run, fixture, inProject);
    else await expectRefused(run, fixture, inProject);
    await expectRefused(run, fixture, { permission, credential, repository: fixture.foreignRepository });
  }
}

async function expectEnded(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
  when: string,
): Promise<void> {
  for (const permission of SCM_PERMISSIONS) {
    await expectRefused(run, fixture, { permission, credential, repository: fixture.projectRepository, when });
  }
}

async function expectAllowed(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<void> {
  const result = await attempt(run, fixture, probe);
  run.expect(result.ok, `${describeProbe(probe)} must succeed`);
}

async function expectRefused(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<void> {
  const result = await attempt(run, fixture, probe);
  run.expect(!result.ok && result.error.code === 'forbidden', `${describeProbe(probe)} must fail with forbidden`);
}

function attempt(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<Result<void>> {
  return fixtureStep(run, 'attemptAction', () => fixture.attemptAction(probe.credential, probe.repository, probe.permission));
}

function describeProbe(probe: Probe): string {
  const when = probe.when === undefined ? '' : ` ${probe.when}`;
  return `${probe.permission} with credential ${probe.credential.credentialId} to ${probe.repository}${when}`;
}
