import { parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectRead, expectSame, expectSuccess, parseContentDigest, type ConformanceCase, type ContentDigest } from '@taskelith/sdlc';
import { parseEvidencePublication, type EvidenceRecord } from '../domain/evidence.js';
import type { WorkerId } from '../domain/identifiers.js';
import type { EvidenceRecords } from './evidence-records.js';
import type { EvidenceStore } from './evidence-store.js';

// Shared suites for the evidence ports; each case expects an empty port.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${JSON.stringify(result.error)}`);
  return result.value;
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));

// Content with its SHA-256 digest, computed once outside the suite.
interface Sample {
  readonly bytes: Uint8Array;
  readonly digest: ContentDigest;
}

function sample(bytes: readonly number[], hex: string): Sample {
  return { bytes: Uint8Array.from(bytes), digest: must(parseContentDigest(`sha256:${hex}`)) };
}

const WITH_NUL = sample([101, 118, 105, 100, 101, 110, 99, 101, 32, 0, 32, 98, 121, 116, 101, 115],
  '467805b67fefb784648ae0bdae054e31b36cad880287f0d7376f95e75183d377');
const EMPTY = sample([], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const REAL = sample([114, 101, 97, 108], 'aa33996d60e89311b4d1a920dae03c6d7fa3ae1956c52662e273aad4683e577f');
const SAME = sample([115, 97, 109, 101], '0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5');
const OTHER = sample([111, 116, 104, 101, 114], 'd9298a10d1b0735837dc4bd85dac641b0f3cef27a47e5d53a54f2f3f5b2fcffa');

function record(evidenceId: string, taskId: string, content: Sample): EvidenceRecord {
  const publication = must(parseEvidencePublication({
    evidenceId, projectId: 'project-1', runId: 'run-1', taskId, attemptId: 'attempt-1', ownershipGeneration: 2,
    kind: 'execution-log', inputArtifacts: [{ artifactId: 'spec', digest: `sha256:${'ab'.repeat(32)}`, nativeReference: 'spec.md' }],
    codeRevision: 'c0ffee', validator: { name: 'vitest', version: '4.0.0' }, outcome: 'passed',
    contentDigest: content.digest, contentType: 'text/plain', sizeBytes: content.bytes.length, capturedAt: AT,
  }));
  return Object.freeze({
    ...publication, producer: Object.freeze({ kind: 'worker' as const, workerId: 'worker-1' as WorkerId }), ownershipCurrent: true, publishedAt: AT,
  });
}

function bytesOf(result: Result<Uint8Array>): unknown {
  return result.ok ? Array.from(result.value) : result;
}

export const EVIDENCE_RECORDS_CONFORMANCE: readonly ConformanceCase<EvidenceRecords>[] = Object.freeze([
  {
    name: 'a record is written once and reads back as stored',
    async check(records: EvidenceRecords) {
      const problems: string[] = [];
      const stored = record('evidence-1', 'task-1', REAL);
      expectRead(problems, 'get absent', await records.get(stored.evidenceId), undefined);
      expectSuccess(problems, 'add', await records.add(stored));
      expectCode(problems, 'second add', await records.add({ ...stored, ownershipCurrent: false }), 'conflict');
      expectRead(problems, 'get', await records.get(stored.evidenceId), stored);
      return problems;
    },
  },
  {
    name: 'records list by task in publication order and count by digest',
    async check(records: EvidenceRecords) {
      const problems: string[] = [];
      const first = record('evidence-b', 'task-1', SAME);
      const second = record('evidence-a', 'task-1', SAME);
      const other = record('evidence-c', 'task-2', OTHER);
      for (const each of [first, second, other]) expectSuccess(problems, `add ${each.evidenceId}`, await records.add(each));
      expectRead(problems, 'list task-1', await records.listByTask(first.taskId), [first, second]);
      expectRead(problems, 'list absent task', await records.listByTask(record('evidence-x', 'task-x', EMPTY).taskId), []);
      expectRead(problems, 'count shared digest', await records.countByDigest(first.contentDigest), 2);
      expectSuccess(problems, 'lock digest', await records.lockDigest(first.contentDigest));
      expectSuccess(problems, 'remove', await records.remove(first.evidenceId));
      expectCode(problems, 'remove again', await records.remove(first.evidenceId), 'not-found');
      expectRead(problems, 'count after remove', await records.countByDigest(first.contentDigest), 1);
      expectRead(problems, 'list after remove', await records.listByTask(first.taskId), [second]);
      return problems;
    },
  },
]);

export const EVIDENCE_STORE_CONFORMANCE: readonly ConformanceCase<EvidenceStore>[] = Object.freeze([
  {
    name: 'content is stored under its digest and read back exactly',
    async check(store: EvidenceStore) {
      const problems: string[] = [];
      expectCode(problems, 'read absent', await store.read(WITH_NUL.digest), 'not-found');
      expectSuccess(problems, 'put', await store.put(WITH_NUL.digest, WITH_NUL.bytes));
      expectSuccess(problems, 'put again', await store.put(WITH_NUL.digest, WITH_NUL.bytes));
      expectSame(problems, 'read', bytesOf(await store.read(WITH_NUL.digest)), Array.from(WITH_NUL.bytes));
      expectSuccess(problems, 'put empty', await store.put(EMPTY.digest, EMPTY.bytes));
      expectSame(problems, 'read empty', bytesOf(await store.read(EMPTY.digest)), []);
      return problems;
    },
  },
  {
    name: 'content that does not match its digest is refused, and removal is idempotent',
    async check(store: EvidenceStore) {
      const problems: string[] = [];
      expectCode(problems, 'mismatched put', await store.put(REAL.digest, OTHER.bytes), 'invalid');
      expectCode(problems, 'read after refusal', await store.read(REAL.digest), 'not-found');
      expectSuccess(problems, 'put', await store.put(REAL.digest, REAL.bytes));
      expectSuccess(problems, 'remove', await store.remove(REAL.digest));
      expectSuccess(problems, 'remove absent', await store.remove(REAL.digest));
      expectCode(problems, 'read removed', await store.read(REAL.digest), 'not-found');
      return problems;
    },
  },
]);
