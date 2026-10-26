import assert from 'node:assert/strict';
import test from 'node:test';
import { err, ok } from '@taskelith/kernel';
import {
  runSourceControlConformance,
  type RunCredential,
  type RunCredentialRequest,
  type SourceControlConformanceFixture,
  type SourceControlProvider,
} from '@taskelith/integrations';
import { InMemoryScm, type ScmDefects } from './in-memory-source-control.ts';

const CASE_COUNT = 12;

async function findings(fixture: SourceControlConformanceFixture): Promise<string[]> {
  const report = await runSourceControlConformance(fixture);
  assert.equal(report.cases, CASE_COUNT);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.findings));
  return report.findings.map((entry) => `${entry.caseName} ${entry.check}: ${entry.message}`);
}

function defective(defects: ScmDefects): Promise<string[]> {
  return findings(new InMemoryScm(defects).fixture());
}

// The fake's own provider with some operations replaced.
function patched(override: (provider: SourceControlProvider) => Partial<SourceControlProvider>): Promise<string[]> {
  const scm = new InMemoryScm();
  const provider = scm.provider();
  return findings(scm.fixture({ ...provider, ...override(provider) }));
}

async function issued(provider: SourceControlProvider, request: RunCredentialRequest): Promise<RunCredential> {
  const result = await provider.issueRunCredential(request);
  assert.ok(result.ok);
  return result.value;
}

function headings(lines: readonly string[]): string[] {
  return lines.map((line) => line.slice(0, line.indexOf(':')));
}

test('a conforming provider passes every case', async () => {
  assert.deepEqual(await findings(new InMemoryScm().fixture()), []);
});

test('a protection that the provider identity can bypass is reported', async () => {
  assert.deepEqual(headings(await defective({ bypassableProtection: true })), [
    'merge protection outcome',
    'pending required status bypass',
  ]);
});

test('a read-only credential that can write is reported', async () => {
  const lines = await defective({ readOnlyCanWrite: true });
  assert.deepEqual(headings(lines), ['read-only credential outcome']);
  assert.match(lines[0]!, /writing to acme\/project must fail with forbidden/);
});

test('a credential not limited to the project repositories is reported', async () => {
  const lines = await defective({ unscopedCredentials: true });
  assert.deepEqual(headings(lines), ['write credential outcome']);
  assert.match(lines[0]!, /writing to acme\/other must fail with forbidden/);
});

test('a webhook verifier that accepts tampered or re-serialized bodies is reported', async () => {
  const lines = await defective({ ignoresSignature: true });
  assert.deepEqual(headings(lines), ['webhook delivery outcome', 'webhook delivery outcome']);
  assert.match(lines[0]!, /with a tampered body/);
  assert.match(lines[1]!, /with a re-serialized body succeeded/);
});

test('a merge allowed while a required status is pending is reported', async () => {
  const lines = await defective({ ignoresRequiredStatuses: true });
  assert.deepEqual(headings(lines), ['pending required status outcome']);
  assert.match(lines[0]!, /pending required status succeeded, expected failure precondition-failed/);
});

test('a merge of a stale head is reported', async () => {
  const lines = await defective({ ignoresExpectedHead: true });
  assert.deepEqual(headings(lines), ['stale head outcome']);
});

test('a throwing operation is reported and the suite continues', async () => {
  const lines = await patched(() => ({ readChangeRequest: async () => { throw new Error('service down'); } }));
  assert.deepEqual(headings(lines), ['change request threw', 'merge threw']);
  assert.match(lines[0]!, /readChangeRequest threw instead of returning a Result: Error: service down/);
});

test('an unknown state string is a shape finding', async () => {
  const lines = await patched((provider) => ({
    openChangeRequest: async (request) => {
      const opened = await provider.openChangeRequest(request);
      return opened.ok ? ok({ ...opened.value, state: 'draft' }) : opened;
    },
  }));
  assert.equal(lines.length, 6);
  assert.ok(lines.every((line) => line.includes('shape: openChangeRequest: changeRequest.state must be one of')));
});

test('a value that is not a Result, or carries an unknown failure code, is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => issued(provider, request) as never,
    revokeRunCredential: async () => err({ code: 'gone', message: 'no', details: {} }) as never,
  }));
  assert.deepEqual(headings(lines), [
    'read-only credential result',
    'write credential result',
    'refreshed credential result',
    'revoked credential result',
  ]);
  assert.match(lines[0]!, /result.ok must be a boolean/);
});

test('a malformed credential grant is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => ok({
      ...(await issued(provider, request)),
      runId: 'other',
      repositories: ['acme/project', 'acme/other'],
      permissions: ['read-code', 'write-code', 'admin'],
      expiresAt: '2000-01-01T00:00:00Z',
    }),
    refreshRunCredential: async () => err({ code: 'not-found', message: 'gone', details: {} }),
  }));
  const grant = lines.filter((line) => line.startsWith('read-only credential outcome: issueRunCredential'));
  assert.equal(grant.length, 4);
  assert.ok(lines.includes('read-only credential outcome: a read-only credential must not grant write-code'));
  assert.ok(lines.includes('refreshed credential outcome: refreshRunCredential failed with not-found, expected success'));
});

test('a refresh that changes the permissions or moves the expiry back is reported', async () => {
  const lines = await patched((provider) => ({
    refreshRunCredential: async (request) => {
      const refreshed = await provider.refreshRunCredential(request);
      if (!refreshed.ok) return refreshed;
      return ok({ ...refreshed.value, permissions: ['read-code', 'write-code', 'write-statuses'], expiresAt: new Date(Date.now() + 1000).toISOString() });
    },
  }));
  assert.deepEqual(lines.map((line) => line.split(' ').slice(3, 5).join(' ')), [
    'refreshRunCredential changed',
    'refreshRunCredential moved',
  ]);
});

test('declared capabilities outside the port vocabulary are reported', async () => {
  const lines = await patched(() => ({ capabilities: { mergeMethods: ['fast-forward'], reviewEvidence: ['vote'] } }));
  assert.deepEqual(headings(lines).slice(0, 4), [
    'capabilities outcome',
    'capabilities outcome',
    'capabilities outcome',
    'capabilities outcome',
  ]);
});

test('capabilities that cannot be read are reported', async () => {
  const scm = new InMemoryScm();
  const provider = Object.defineProperty({ ...scm.provider() }, 'capabilities', {
    get: () => { throw new Error('no getter'); },
  });
  const lines = await findings(scm.fixture(provider));
  assert.deepEqual(headings(lines), ['capabilities threw', 'undeclared merge method threw']);
  const malformed = await patched(() => ({ capabilities: { mergeMethods: 'squash' } as never }));
  assert.deepEqual(headings(malformed), ['capabilities shape', 'undeclared merge method shape']);
});

test('a provider declaring every merge method skips the undeclared method case', async () => {
  const declared = { mergeMethods: ['merge-commit', 'squash', 'rebase'], reviewEvidence: ['required-status'] };
  assert.deepEqual(await patched(() => ({ capabilities: declared })), []);
});

test('mismatched change request and status values are reported', async () => {
  const lines = await patched((provider) => ({
    openChangeRequest: async (request) => {
      const opened = await provider.openChangeRequest(request);
      return opened.ok ? ok({ ...opened.value, headBranch: 'elsewhere', state: 'merged' }) : opened;
    },
    setCommitStatus: async (request) => ok({ ...request, state: 'success' }),
    ensureMergeProtection: async (request) => ok({ ...request, branch: 'other', requiredStatuses: [], bindsProvider: true }),
  }));
  assert.ok(lines.includes('merge protection outcome: ensureMergeProtection protected acme/project other, not the base branch'));
  assert.ok(lines.some((line) => line.startsWith('change request outcome: openChangeRequest returned acme/project main <- elsewhere')));
  assert.ok(lines.some((line) => line.startsWith('pending required status outcome: setCommitStatus returned taskelith/review success')));
});

test('a merge result or event that does not echo the request is reported', async () => {
  const lines = await patched((provider) => ({
    mergeChangeRequest: async (request) => {
      const merged = await provider.mergeChangeRequest(request);
      return merged.ok ? ok({ ...merged.value, changeRequest: 'x', method: 'rebase' }) : merged;
    },
    verifyWebhookDelivery: async (delivery) => {
      const verified = await provider.verifyWebhookDelivery(delivery);
      return verified.ok ? ok({ ...verified.value, repository: 'acme/other', deliveryId: `${Math.random()}` }) : verified;
    },
  }));
  assert.deepEqual(headings(lines), ['merge outcome', 'merge outcome', 'webhook delivery outcome', 'webhook delivery outcome']);
});

test('a throwing fixture step and an empty signed body are fixture findings', async () => {
  const scm = new InMemoryScm();
  const lines = await findings({
    ...scm.fixture(),
    prepareHeadBranch: async () => { throw new Error('no git'); },
    signDelivery: async () => ({ headers: {}, rawBody: new Uint8Array() }),
  });
  assert.ok(lines.every((line) => line.includes(' fixture: ')));
  assert.ok(lines.includes('change request fixture: prepareHeadBranch threw: Error: no git'));
});
