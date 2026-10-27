import assert from 'node:assert/strict';
import test from 'node:test';
import { ok } from '@taskelith/kernel';
import { issued, patched } from './conformance-findings.ts';

// Run identifiers are kernel identifiers; repositories, change requests,
// and commits are external identifiers: non-empty and bounded.

const KERNEL_IDENTIFIER = 'must be a kernel identifier';
const EXTERNAL_IDENTIFIER = 'must be a non-empty string of at most 1024 characters';
const EXTERNAL_IDENTIFIERS = 'must be an array of non-empty strings of at most 1024 characters';

function shapeFindings(lines: readonly string[], field: string, problem: string): string[] {
  return lines.filter((line) => line.includes(' shape: ') && line.endsWith(`${field} ${problem}`));
}

test('a run identifier that is not a kernel identifier is a shape finding', async () => {
  for (const runId of ['', 'run 1', 'r'.repeat(129)]) {
    const lines = await patched((provider) => ({
      issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), runId }),
    }));
    assert.equal(shapeFindings(lines, 'credential.runId', KERNEL_IDENTIFIER).length, 6, runId);
  }
});

test('an empty or unbounded credential repository is a shape finding', async () => {
  for (const repository of ['', 'r'.repeat(1025)]) {
    const lines = await patched((provider) => ({
      issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), repositories: [repository] }),
    }));
    assert.equal(shapeFindings(lines, 'credential.repositories', EXTERNAL_IDENTIFIERS).length, 6);
  }
});

test('an empty protection or change request repository is a shape finding', async () => {
  const lines = await patched((provider) => ({
    ensureMergeProtection: async (request) => {
      const protection = await provider.ensureMergeProtection(request);
      return protection.ok ? ok({ ...protection.value, repository: '' }) : protection;
    },
    readChangeRequest: async (request) => {
      const read = await provider.readChangeRequest(request);
      return read.ok ? ok({ ...read.value, repository: '' }) : read;
    },
  }));
  assert.ok(shapeFindings(lines, 'protection.repository', EXTERNAL_IDENTIFIER).length > 0);
  assert.ok(shapeFindings(lines, 'changeRequest.repository', EXTERNAL_IDENTIFIER).length > 0);
});

test('an empty status repository or commit is a shape finding', async () => {
  for (const field of ['repository', 'commit']) {
    const lines = await patched((provider) => ({
      setCommitStatus: async (request) => {
        const status = await provider.setCommitStatus(request);
        return status.ok ? ok({ ...status.value, [field]: '' }) : status;
      },
    }));
    assert.ok(shapeFindings(lines, `status.${field}`, EXTERNAL_IDENTIFIER).length > 0, field);
  }
});

test('an empty merged change request is a shape finding', async () => {
  const lines = await patched((provider) => ({
    mergeChangeRequest: async (request) => {
      const merged = await provider.mergeChangeRequest(request);
      return merged.ok ? ok({ ...merged.value, changeRequest: '' }) : merged;
    },
  }));
  assert.ok(shapeFindings(lines, 'merge.changeRequest', EXTERNAL_IDENTIFIER).length > 0);
});

test('an empty webhook repository, change request, or commit is a shape finding', async () => {
  for (const field of ['repository', 'changeRequest', 'commit']) {
    const lines = await patched((provider) => ({
      verifyWebhookDelivery: async (delivery) => {
        const verified = await provider.verifyWebhookDelivery(delivery);
        return verified.ok ? ok({ ...verified.value, [field]: '' }) : verified;
      },
    }));
    assert.ok(shapeFindings(lines, `event.${field}`, EXTERNAL_IDENTIFIER).length > 0, field);
  }
});
