import assert from 'node:assert/strict';
import test from 'node:test';
import { err, ok } from '@taskelith/kernel';
import type { RunCredential } from '@taskelith/integrations';
import { defective, findings, headings, issued, patched } from './conformance-findings.ts';
import { InMemoryScm } from './in-memory-source-control.ts';

// Plugin results replaced one operation at a time: the suite checks every
// result at run time, as plugin output is untrusted.

function cases(lines: readonly string[]): string[] {
  return [...new Set(headings(lines))];
}

test('a throwing operation is reported and the suite continues', async () => {
  const lines = await patched(() => ({ readChangeRequest: async () => { throw new Error('service down'); } }));
  assert.ok(lines.length > 1 && lines.every((line) => line.includes(' threw: ')));
  assert.match(lines[0]!, /^change request threw: readChangeRequest threw instead of returning a Result: Error: service down/);
});

test('an unknown state string is a shape finding', async () => {
  const lines = await patched((provider) => ({
    openChangeRequest: async (request) => {
      const opened = await provider.openChangeRequest(request);
      return opened.ok ? ok({ ...opened.value, state: 'draft' }) : opened;
    },
  }));
  assert.equal(lines.length, 7);
  assert.ok(lines.every((line) => line.includes('shape: openChangeRequest: changeRequest.state must be one of')));
});

test('a value that is not a Result is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => issued(provider, request) as never,
  }));
  assert.deepEqual(headings(lines), [
    'read-only credential result',
    'write credential result',
    'change request and status credentials result',
    'refreshed credential result',
    'revoked credential result',
    'credential isolation result',
  ]);
  assert.match(lines[0]!, /result.ok must be a boolean/);
});

test('a failure with an unknown code or malformed details is reported', async () => {
  const unknownCode = await patched(() => ({ revokeRunCredential: async () => err({ code: 'gone', message: 'no', details: {} }) as never }));
  assert.deepEqual(headings(unknownCode), ['revoked credential result', 'credential isolation result']);
  assert.equal(unknownCode[0], 'revoked credential result: revokeRunCredential: result.error.code gone is not a kernel failure code');
  const badDetails = await patched(() => ({ revokeRunCredential: async () => err({ code: 'internal', message: 'no', details: 123 }) as never }));
  assert.equal(badDetails[0], 'revoked credential result: revokeRunCredential: result.error.details must be a record of strings');
  const throwingDetails = await patched(() => ({
    revokeRunCredential: async () => err({ code: 'internal', message: 'no', details: { get reason() { throw new Error('no getter'); } } }) as never,
  }));
  assert.match(throwingDetails[0]!, /result.error.details could not be read: Error: no getter/);
});

test('a revocation that returns a value is a shape finding', async () => {
  const lines = await patched(() => ({ revokeRunCredential: async () => ok({ revoked: true }) as never }));
  assert.deepEqual(lines, [
    'revoked credential shape: revokeRunCredential: value must be undefined',
    'credential isolation shape: revokeRunCredential: value must be undefined',
  ]);
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
  assert.equal(grant.length, 5);
  assert.ok(lines.includes('read-only credential outcome: issueRunCredential granted write-code to a request without it'));
  assert.ok(lines.includes('refreshed credential outcome: refreshRunCredential failed with not-found, expected success'));
});

test('an effective grant beyond the request is allowed, but not write-code', async () => {
  assert.deepEqual(await defective({}, { alsoGrants: 'write-statuses' }), []);
  const escalated = await defective({}, { alsoGrants: 'write-code' });
  assert.deepEqual(cases(escalated), [
    'read-only credential outcome',
    'change request and status credentials outcome',
    'credential isolation outcome',
  ]);
  const escalations = escalated.filter((line) => line.endsWith('issueRunCredential granted write-code to a request without it'));
  assert.equal(escalations.length, 5);
  assert.match(escalated[4]!, /^credential isolation outcome: write-code .* after another run got write-code must fail with forbidden$/);
});

test('a reported permission that the service does not grant is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => {
      const credential = await issued(provider, request);
      return ok({ ...credential, permissions: [...new Set([...credential.permissions, 'write-statuses'])] });
    },
  }));
  assert.deepEqual(cases(lines), [
    'read-only credential outcome',
    'write credential outcome',
    'change request and status credentials outcome',
  ]);
  assert.ok(lines.every((line) => /: write-statuses with credential cred-\d+ to acme\/project must succeed$/.test(line)));
});

test('a read-only credential whose secret does not work is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => {
      const credential = await issued(provider, request);
      return ok(request.permissions.includes('write-code') ? credential : { ...credential, secret: 'not-a-token' });
    },
  }));
  assert.deepEqual(cases(lines), [
    'read-only credential outcome',
    'change request and status credentials outcome',
    'credential isolation outcome',
  ]);
  assert.match(lines[0]!, /^read-only credential outcome: read-code with credential cred-\d+ to acme\/project must succeed$/);
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
    'refreshRunCredential granted',
    'refreshRunCredential changed',
    'refreshRunCredential must',
    'write-change-requests with',
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
  assert.deepEqual(headings(lines), [
    'capabilities threw',
    'required statuses threw',
    'stale head threw',
    'merge methods threw',
    'undeclared merge methods threw',
  ]);
  const malformed = await patched(() => ({ capabilities: { mergeMethods: 'squash' } as never }));
  assert.deepEqual(headings(malformed), [
    'capabilities shape',
    'required statuses shape',
    'stale head shape',
    'merge methods shape',
    'undeclared merge methods shape',
  ]);
});

test('a declared merge method that the provider cannot perform is reported', async () => {
  const declared = { mergeMethods: ['merge-commit', 'squash', 'rebase'], reviewEvidence: ['required-status'] };
  const lines = await patched(() => ({ capabilities: declared }));
  assert.deepEqual(cases(lines), ['required statuses outcome', 'stale head outcome', 'merge methods outcome']);
  assert.ok(lines.includes('merge methods outcome: mergeChangeRequest with rebase failed with unavailable, expected success'));
  assert.ok(lines.every((line) => line.includes('with rebase')));
});

test('a protection of another branch is reported', async () => {
  const lines = await patched(() => ({
    ensureMergeProtection: async (request) => ok({ ...request, branch: 'other', bindsProvider: true }),
  }));
  assert.ok(lines.includes('merge protection outcome: ensureMergeProtection protected acme/project other, not the base branch'));
});

test('change requests that do not echo the request are reported', async () => {
  const lines = await patched((provider) => ({
    openChangeRequest: async (request) => {
      const opened = await provider.openChangeRequest(request);
      return opened.ok ? ok({ ...opened.value, headBranch: 'elsewhere' }) : opened;
    },
    readChangeRequest: async (request) => {
      const read = await provider.readChangeRequest(request);
      return read.ok ? ok({ ...read.value, repository: 'acme/other', baseBranch: 'develop' }) : read;
    },
  }));
  assert.ok(lines.some((line) => /^change request outcome: openChangeRequest returned headBranch elsewhere, not topic-\d+$/.test(line)));
  assert.ok(lines.includes('change request outcome: readChangeRequest returned repository acme/other, not acme/project'));
  assert.ok(lines.includes('change request outcome: readChangeRequest returned baseBranch develop, not main'));
});

test('statuses that do not echo the request are reported', async () => {
  const lines = await patched((provider) => ({
    setCommitStatus: async (request) => {
      const status = await provider.setCommitStatus(request);
      const state = request.state === 'pending' ? 'success' : request.state;
      return status.ok ? ok({ ...status.value, repository: 'acme/other', state }) : status;
    },
  }));
  assert.ok(lines.includes('required statuses outcome: setCommitStatus returned repository acme/other, not acme/project'));
  assert.ok(lines.includes('required statuses outcome: setCommitStatus returned state success, not pending'));
});

test('a merge result that does not echo the request is reported', async () => {
  const lines = await patched((provider) => ({
    mergeChangeRequest: async (request) => {
      const merged = await provider.mergeChangeRequest(request);
      return merged.ok ? ok({ ...merged.value, changeRequest: 'x', method: 'rebase' }) : merged;
    },
  }));
  assert.deepEqual(headings(lines), ['merge methods outcome', 'merge methods outcome', 'merge methods outcome', 'merge methods outcome']);
});

test('a webhook event for another repository is reported', async () => {
  const lines = await patched((provider) => ({
    verifyWebhookDelivery: async (delivery) => {
      const verified = await provider.verifyWebhookDelivery(delivery);
      return verified.ok ? ok({ ...verified.value, repository: 'acme/other' }) : verified;
    },
  }));
  assert.deepEqual(headings(lines), ['webhook delivery outcome', 'webhook delivery outcome']);
});

test('a constant or changing delivery id is reported', async () => {
  const constant = await patched((provider) => ({
    verifyWebhookDelivery: async (delivery) => {
      const verified = await provider.verifyWebhookDelivery(delivery);
      return verified.ok ? ok({ ...verified.value, deliveryId: 'constant' }) : verified;
    },
  }));
  assert.deepEqual(constant, ['webhook delivery outcome: two deliveries must have distinct deliveryIds, not both constant']);
  let calls = 0;
  const changing = await patched((provider) => ({
    verifyWebhookDelivery: async (delivery) => {
      const verified = await provider.verifyWebhookDelivery(delivery);
      calls += 1;
      return verified.ok ? ok({ ...verified.value, deliveryId: `delivery-${calls}` }) : verified;
    },
  }));
  assert.deepEqual(headings(changing), ['webhook delivery outcome', 'webhook delivery outcome']);
  assert.match(changing[0]!, /a repeated delivery must keep its deliveryId/);
});

test('a fixture whose delivery lacks the named signature header is reported', async () => {
  const lines = await findings({ ...new InMemoryScm().fixture(), signatureHeader: 'x-other' });
  assert.deepEqual(lines, ['webhook delivery fixture: signDelivery returned no x-other header']);
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
  const empty = await findings({ ...new InMemoryScm().fixture(), signDelivery: async () => ({ headers: {}, rawBody: new Uint8Array() }) });
  assert.deepEqual(empty, ['webhook delivery fixture: signDelivery returned an empty body']);
});
