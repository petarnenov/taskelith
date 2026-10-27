import { ConformanceCase, type SourceControlConformanceFinding } from './conformance-case.js';
import {
  checkChangeRequestAndStatusCredentials,
  checkCredentialIsolation,
  checkReadOnlyCredential,
  checkRefreshedCredential,
  checkRevokedCredential,
  checkWriteCredential,
} from './credential-cases.js';
import {
  checkCapabilities,
  checkChangeRequest,
  checkMergeMethods,
  checkMergeProtection,
  checkNativeMergeControl,
  checkRequiredStatuses,
  checkStaleHead,
  checkUndeclaredMergeMethods,
} from './merge-cases.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { checkWebhookDelivery } from './webhook-cases.js';

// An SCM-neutral suite, without a test runner, that a plugin's tests run on
// their own fixture against a real or emulated service.

export interface SourceControlConformanceReport {
  readonly cases: number;
  readonly findings: readonly SourceControlConformanceFinding[];
}

type CaseBody = (run: ConformanceCase, fixture: SourceControlConformanceFixture) => Promise<void>;

// Credential cases come first; each merge case opens its own change
// request on the protected base branch.
const CASES: readonly (readonly [string, CaseBody])[] = Object.freeze([
  ['capabilities', checkCapabilities],
  ['read-only credential', checkReadOnlyCredential],
  ['write credential', checkWriteCredential],
  ['change request and status credentials', checkChangeRequestAndStatusCredentials],
  ['refreshed credential', checkRefreshedCredential],
  ['revoked credential', checkRevokedCredential],
  ['credential isolation', checkCredentialIsolation],
  ['merge protection', checkMergeProtection],
  ['change request', checkChangeRequest],
  ['required statuses', checkRequiredStatuses],
  ['native merge control', checkNativeMergeControl],
  ['stale head', checkStaleHead],
  ['merge methods', checkMergeMethods],
  ['undeclared merge methods', checkUndeclaredMergeMethods],
  ['webhook delivery', checkWebhookDelivery],
]);

export async function runSourceControlConformance(
  fixture: SourceControlConformanceFixture,
): Promise<SourceControlConformanceReport> {
  const findings: SourceControlConformanceFinding[] = [];
  for (const [name, body] of CASES) {
    findings.push(...(await new ConformanceCase(name).run((run) => body(run, fixture))));
  }
  return Object.freeze({ cases: CASES.length, findings: Object.freeze(findings) });
}
