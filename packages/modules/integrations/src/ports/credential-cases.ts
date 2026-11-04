import { parseInstant, type Result } from '@taskelith/kernel';
import { failsWith, fixtureResult, nothing, succeeds, type ConformanceCase } from './conformance-case.js';
import { isSameSet, isSubset } from './conformance-steps.js';
import { awaitRefusals, type ObservedEnding } from './revocation-window.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readRunCredential } from './source-control-readers.js';
import {
  SCM_PERMISSIONS,
  type RunCredential,
  type RunCredentialAdoption,
  type RunCredentialRequest,
} from './source-control.js';

// Cases for run credentials: what each grant claims, and what the fixture
// can natively do with it.

const READ_ONLY = Object.freeze(['read-code']);
const READ_WRITE = Object.freeze(['read-code', 'write-code']);
// Without write-code: a grant that also writes code fails these requests
// (contract section 7, Forgejo admission gate).
const CHANGE_REQUESTS = Object.freeze(['read-code', 'write-change-requests']);
const STATUSES = Object.freeze(['read-code', 'write-statuses']);
const UNKNOWN_CREDENTIAL = 'conformance-unknown-credential';

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

// A refresh keeps the grant, extends it, and replaces the secret; both
// versions work until the run's adoption of the new one ends the old one.
export async function checkRefreshedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  await expectRefreshed(run, fixture, 'conformance-refresh-read-only', READ_ONLY);
  await expectRefreshed(run, fixture, 'conformance-refresh', SCM_PERMISSIONS);
}

// An adoption ends only earlier versions, a repeated or stale one nothing
// more; only issued versions are adopted, and adopted ones still refresh.
export async function checkAdoptedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const first = await issueCredential(run, fixture, 'conformance-adoption', READ_ONLY);
  const second = await refresh(run, fixture, first);
  const third = await refresh(run, fixture, second);
  const secondAdoptedAt = await confirmAdoption(run, fixture, second);
  await expectEnded(run, fixture, [{ credential: first, when: 'after the adoption of a later version' }], secondAdoptedAt);
  await expectReads(run, fixture, third, 'after the adoption of an earlier version');
  await confirmAdoption(run, fixture, second);
  await expectReads(run, fixture, second, 'after its adoption was repeated');
  await failsWith(
    run,
    'confirmRunCredentialAdoption of a version not yet issued',
    () => fixture.provider.confirmRunCredentialAdoption({ credentialId: third.credentialId, version: third.version + 1 }),
    'not-found',
  );
  const thirdAdoptedAt = await confirmAdoption(run, fixture, third);
  await expectEnded(run, fixture, [{ credential: second, when: 'after the adoption of a later version' }], thirdAdoptedAt);
  await confirmAdoption(run, fixture, second);
  await expectRefused(run, fixture, readProbe(fixture, second, 'after a stale adoption'));
  await expectReads(run, fixture, third, 'after its adoption');
  const fourth = await refresh(run, fixture, third);
  await expectReads(run, fixture, fourth, 'after a refresh that follows an adoption');
  await revoke(run, fixture, third);
  await expectUnknownAdoption(run, fixture, 'a revoked credential', { credentialId: third.credentialId, version: third.version });
  const unknown = { credentialId: UNKNOWN_CREDENTIAL, version: 1 };
  await expectUnknownAdoption(run, fixture, 'an unknown credential', unknown);
}

function expectUnknownAdoption(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  subject: string,
  adoption: RunCredentialAdoption,
): Promise<void> {
  const operation = `confirmRunCredentialAdoption of ${subject}`;
  return failsWith(run, operation, () => fixture.provider.confirmRunCredentialAdoption(adoption), 'not-found');
}

// The access before the revocation shows that the refusals after it come
// from the revocation, which ends every version of the credential.
export async function checkRevokedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-revoke', SCM_PERMISSIONS);
  await expectGrantedAccess(run, fixture, credential);
  const refreshed = await refresh(run, fixture, credential);
  const revokedAt = await revoke(run, fixture, refreshed);
  const versions = [
    { credential, when: 'after the revocation of its credential' },
    { credential: refreshed, when: 'after its revocation' },
  ];
  await expectEnded(run, fixture, versions, revokedAt);
  await expectMissing(run, fixture, 'a revoked credential', refreshed.credentialId);
  await expectMissing(run, fixture, 'an unknown credential', UNKNOWN_CREDENTIAL);
}

// Neither revives a credential nor hides that it is gone.
async function expectMissing(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  subject: string,
  credentialId: string,
): Promise<void> {
  const { provider } = fixture;
  await failsWith(run, `refreshRunCredential of ${subject}`, () => provider.refreshRunCredential({ credentialId }), 'not-found');
  await failsWith(run, `revokeRunCredential of ${subject}`, () => provider.revokeRunCredential({ credentialId }), 'not-found');
}

// Credentials of runs that overlap stay apart: a grant for one run never
// widens another, and revoking one leaves the other working.
export async function checkCredentialIsolation(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const project = fixture.projectRepository;
  const reader = await issueCredential(run, fixture, 'conformance-isolation-reader', READ_ONLY);
  const writer = await issueCredential(run, fixture, 'conformance-isolation-writer', READ_WRITE);
  run.expect(reader.secret !== writer.secret, 'credentials of two runs must have distinct secrets');
  run.expect(reader.authorization !== writer.authorization, 'credentials of two runs must have distinct authorizations');
  const afterGrant = 'after another run got write-code';
  await expectRefused(run, fixture, { permission: 'write-code', credential: reader, repository: project, when: afterGrant });
  await revoke(run, fixture, writer);
  const afterRevocation = 'after another run was revoked';
  await expectAllowed(run, fixture, { permission: 'read-code', credential: reader, repository: project, when: afterRevocation });
  const laterReader = await issueCredential(run, fixture, 'conformance-isolation-later-reader', READ_ONLY);
  const laterWriter = await issueCredential(run, fixture, 'conformance-isolation-later-writer', READ_WRITE);
  await expectAllowed(run, fixture, { permission: 'read-code', credential: laterReader, repository: project });
  const laterRevokedAt = await revoke(run, fixture, laterReader);
  await expectEnded(run, fixture, [{ credential: laterReader, when: 'after its revocation' }], laterRevokedAt);
  await expectAllowed(run, fixture, { permission: 'write-code', credential: laterWriter, repository: project, when: afterRevocation });
}

async function expectRefreshed(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  runId: string,
  permissions: readonly string[],
): Promise<void> {
  const original = await issueCredential(run, fixture, runId, permissions);
  const refreshed = await refresh(run, fixture, original);
  await expectGrantedAccess(run, fixture, original, 'before the adoption of its successor');
  await expectGrantedAccess(run, fixture, refreshed);
  const adoptedAt = await confirmAdoption(run, fixture, refreshed);
  await expectEnded(run, fixture, [{ credential: original, when: 'after the adoption of its successor' }], adoptedAt);
  await expectGrantedAccess(run, fixture, refreshed, 'after its adoption');
}

async function refresh(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  previous: RunCredential,
): Promise<RunCredential> {
  const refreshed = await succeeds(
    run,
    'refreshRunCredential',
    () => fixture.provider.refreshRunCredential({ credentialId: previous.credentialId }),
    readRunCredential,
  );
  checkGrant(run, 'refreshRunCredential', grantOf(previous), refreshed);
  run.expect(refreshed.credentialId === previous.credentialId, 'refreshRunCredential returned another credentialId');
  run.expect(refreshed.version === previous.version + 1, 'refreshRunCredential must return the next version');
  run.expect(isSameSet(refreshed.permissions, previous.permissions), 'refreshRunCredential changed the permissions');
  run.expect(refreshed.secret !== previous.secret, 'refreshRunCredential must return a new secret');
  run.expect(refreshed.authorization !== previous.authorization, 'refreshRunCredential must return a new authorization');
  run.expect(
    Date.parse(refreshed.expiresAt) > Date.parse(previous.expiresAt),
    'refreshRunCredential must extend expiresAt beyond the original expiry',
  );
  return refreshed;
}

// Returns when the earlier versions ended, on the fixture's clock.
async function confirmAdoption(run: ConformanceCase, fixture: SourceControlConformanceFixture, adopted: RunCredential): Promise<number> {
  await succeeds(
    run,
    'confirmRunCredentialAdoption',
    () => fixture.provider.confirmRunCredentialAdoption({ credentialId: adopted.credentialId, version: adopted.version }),
    nothing,
  );
  return fixture.clock.now();
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
  run.expect(credential.version === 1, 'issueRunCredential must return version 1');
  return credential;
}

// Returns when the credential ended, on the fixture's clock.
async function revoke(run: ConformanceCase, fixture: SourceControlConformanceFixture, credential: RunCredential): Promise<number> {
  await succeeds(
    run,
    'revokeRunCredential',
    () => fixture.provider.revokeRunCredential({ credentialId: credential.credentialId }),
    nothing,
  );
  return fixture.clock.now();
}

function grantOf(credential: RunCredential): RunCredentialRequest {
  return { runId: credential.runId, repositories: credential.repositories, permissions: credential.permissions };
}

// Effective permissions may exceed the request where the service has no
// narrower one, but never add write-code. Findings name no returned value.
function checkGrant(run: ConformanceCase, operation: string, request: RunCredentialRequest, credential: RunCredential): void {
  run.expect(credential.runId === request.runId, `${operation} returned another runId than requested`);
  run.expect(
    isSameSet(credential.repositories, request.repositories),
    `${operation} granted other repositories than exactly the requested ones`,
  );
  run.expect(
    isSubset(request.permissions, credential.permissions) && isSubset(credential.permissions, SCM_PERMISSIONS),
    `${operation} granted permissions that miss a requested one or are not port permissions`,
  );
  run.expect(
    request.permissions.includes('write-code') || !credential.permissions.includes('write-code'),
    `${operation} granted write-code to a request without it`,
  );
  run.expect(
    parseInstant(credential.expiresAt).ok && Date.parse(credential.expiresAt) > Date.now(),
    `${operation} returned an expiresAt that is not a canonical future instant`,
  );
}

// In the project, the credential does exactly what its effective
// permissions allow; outside it, nothing.
async function expectGrantedAccess(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
  when?: string,
): Promise<void> {
  for (const permission of SCM_PERMISSIONS) {
    const inProject = { permission, credential, repository: fixture.projectRepository, when };
    if (credential.permissions.includes(permission)) await expectAllowed(run, fixture, inProject);
    else await expectRefused(run, fixture, inProject);
    await expectRefused(run, fixture, { permission, credential, repository: fixture.foreignRepository, when });
  }
}

function expectReads(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
  when: string,
): Promise<void> {
  return expectAllowed(run, fixture, readProbe(fixture, credential, when));
}

function readProbe(fixture: SourceControlConformanceFixture, credential: RunCredential, when: string): Probe {
  return { permission: 'read-code', credential, repository: fixture.projectRepository, when };
}

interface EndedVersion {
  readonly credential: RunCredential;
  readonly when: string;
}

// Every permission of every version must be refused with forbidden within
// the propagation window of their shared ending; each slowest is recorded.
async function expectEnded(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  versions: readonly EndedVersion[],
  endedAt: number,
): Promise<void> {
  const probes = versions.flatMap(({ credential, when }) =>
    SCM_PERMISSIONS.map((permission) => ({ permission, credential, repository: fixture.projectRepository, when })));
  const endings = await awaitRefusals(probes.map((probe) => () => attempt(run, fixture, probe)), fixture.clock, endedAt);
  for (const [index, ending] of endings.entries()) expectEndedRefusal(run, fixture, probes[index]!, ending);
  for (const { when, credential } of versions) {
    const latencies = endings.filter((_, index) => probes[index]!.credential === credential).map((ending) => ending.latencyMs);
    run.recordEnding(when, Math.max(0, ...latencies));
  }
}

// Names what went wrong: no refusal, a late answer, or another code.
function expectEndedRefusal(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe, ending: ObservedEnding): void {
  if (ending.refusal !== undefined) return expectForbidden(run, fixture, probe, { ok: false, error: ending.refusal });
  const outcome = ending.answeredLate ? 'answered only after' : 'was not refused within';
  run.report('outcome', `${describeProbe(fixture, probe)} ${outcome} REVOCATION_PROPAGATION_SECONDS`);
}

async function expectAllowed(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<void> {
  const result = await attempt(run, fixture, probe);
  run.expect(result.ok, `${describeProbe(fixture, probe)} must succeed`);
}

async function expectRefused(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<void> {
  expectForbidden(run, fixture, probe, await attempt(run, fixture, probe));
}

function expectForbidden(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe, result: Result<unknown>): void {
  run.expect(!result.ok && result.error.code === 'forbidden', `${describeProbe(fixture, probe)} must fail with forbidden`);
}

function attempt(run: ConformanceCase, fixture: SourceControlConformanceFixture, probe: Probe): Promise<Result<unknown>> {
  return fixtureResult(run, 'attemptAction', () => fixture.attemptAction(probe.credential, probe.repository, probe.permission));
}

// Names the probe by suite terms only, not by the credential's identifier.
function describeProbe(fixture: SourceControlConformanceFixture, probe: Probe): string {
  const when = probe.when === undefined ? '' : ` ${probe.when}`;
  const place = probe.repository === fixture.projectRepository ? 'the project repository' : 'the foreign repository';
  return `${probe.permission} to ${place}${when}`;
}
