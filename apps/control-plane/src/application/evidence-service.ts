import type { HttpSchemas } from '@taskelith/contracts';
import {
  acceptEvidence,
  checkRetentionElapsed,
  isSamePublication,
  parseEvidencePublication,
  type EvidenceId,
  type EvidenceProducer,
  type EvidencePublication,
  type EvidenceRecord,
  type EvidenceStore,
  type WorkerId,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { ContentDigest } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';

export type EvidenceView = HttpSchemas['EvidenceRecord'];

// The outcome of a publication: the stored record, and whether this call
// stored it (201) or found it already stored (200).
export interface Publication {
  readonly record: EvidenceView;
  readonly created: boolean;
}

export interface EvidenceDownload {
  readonly record: EvidenceView;
  readonly content: Uint8Array;
}

// Architecture section 8: authenticated publication with producer
// authorization, and verified reads, over the records and the content.
export class EvidenceService {
  readonly #store: ControlPlaneStore;
  readonly #contents: EvidenceStore;

  constructor(store: ControlPlaneStore, contents: EvidenceStore) {
    this.#store = store;
    this.#contents = contents;
  }

  // The content is checked against its size here and its digest by the
  // content store; it is written only once the producer is authorized.
  async publish(workerId: WorkerId, input: HttpSchemas['EvidencePublication'], content: Uint8Array): Promise<Result<Publication>> {
    const publication = parseEvidencePublication(input);
    if (!publication.ok) return publication;
    if (content.length !== publication.value.sizeBytes) {
      return err(failure('invalid', `the content has ${content.length} bytes, not ${publication.value.sizeBytes}`, { field: 'sizeBytes' }));
    }
    const producer: EvidenceProducer = Object.freeze({ kind: 'worker', workerId });
    return this.#store.transaction(async (tx) => {
      const stored = await tx.evidence.get(publication.value.evidenceId);
      if (!stored.ok) return stored;
      if (stored.value !== undefined) return this.#repeat(tx, stored.value, publication.value, producer, content);
      const record = await this.#authorize(tx, publication.value, producer);
      if (!record.ok) return record;
      const written = await this.#writeContent(tx, record.value.contentDigest, content);
      if (!written.ok) return written;
      const added = await tx.evidence.add(record.value);
      return added.ok ? ok({ record: viewOf(record.value), created: true }) : added;
    });
  }

  read(evidenceIdText: string): Promise<Result<EvidenceView>> {
    return this.#store.transaction(async (tx) => {
      const record = await storedRecord(tx, evidenceIdText);
      return record.ok ? ok(viewOf(record.value)) : record;
    });
  }

  // Content that is missing or no longer matches its digest is never served.
  async download(evidenceIdText: string): Promise<Result<EvidenceDownload>> {
    const record = await this.#store.transaction((tx) => storedRecord(tx, evidenceIdText));
    if (!record.ok) return record;
    const content = await this.#contents.read(record.value.contentDigest);
    if (content.ok) return ok({ record: viewOf(record.value), content: content.value });
    if (content.error.code !== 'not-found') return content;
    return err(failure('internal', `the content of evidence ${record.value.evidenceId} is missing`, {
      evidence: record.value.evidenceId,
      reason: 'evidence-missing',
    }));
  }

  // Removes a record whose minimum retention has passed, then its content
  // once no record refers to it.
  async retire(evidenceIdText: string): Promise<Result<void>> {
    const removed = await this.#store.transaction(async (tx) => {
      const record = await storedRecord(tx, evidenceIdText);
      if (!record.ok) return record;
      const elapsed = checkRetentionElapsed(record.value, await tx.now());
      if (!elapsed.ok) return elapsed;
      const deleted = await tx.evidence.remove(record.value.evidenceId);
      return deleted.ok ? ok(record.value.contentDigest) : deleted;
    });
    if (!removed.ok) return removed;
    return this.#store.transaction(async (tx) => {
      const locked = await tx.evidence.lockDigest(removed.value);
      if (!locked.ok) return locked;
      const references = await tx.evidence.countByDigest(removed.value);
      if (!references.ok || references.value > 0) return references.ok ? ok(undefined) : references;
      return this.#contents.remove(removed.value);
    });
  }

  // A retry of the same publication returns the stored record and repairs
  // its content; another publication under the identity is a conflict.
  async #repeat(
    tx: ControlPlaneTransaction,
    record: EvidenceRecord,
    publication: EvidencePublication,
    producer: EvidenceProducer,
    content: Uint8Array,
  ): Promise<Result<Publication>> {
    if (!isSamePublication(record, publication, producer)) {
      return err(failure('conflict', `evidence ${record.evidenceId} was published with other values`, { evidence: record.evidenceId }));
    }
    const written = await this.#writeContent(tx, record.contentDigest, content);
    return written.ok ? ok({ record: viewOf(record), created: false }) : written;
  }

  async #authorize(tx: ControlPlaneTransaction, publication: EvidencePublication, producer: EvidenceProducer): Promise<Result<EvidenceRecord>> {
    const link = await tx.lineage.get(publication.taskId);
    if (link === undefined) return unknownTask(publication);
    const task = await tx.tasks.get(publication.taskId);
    if (!task.ok) return task.error.code === 'not-found' ? unknownTask(publication) : task;
    const heldGenerations = await tx.producers.heldGenerations(producer.workerId, publication.attemptId);
    if (!heldGenerations.ok) return heldGenerations;
    const context = { task: task.value, projectId: link.projectId, runId: link.runId, heldGenerations: heldGenerations.value };
    return acceptEvidence(publication, producer, context, await tx.now());
  }

  // Content is written before its record commits, under the digest's lock,
  // so a committed record always has content that retire cannot remove.
  async #writeContent(tx: ControlPlaneTransaction, digest: ContentDigest, content: Uint8Array): Promise<Result<void>> {
    const locked = await tx.evidence.lockDigest(digest);
    return locked.ok ? this.#contents.put(digest, content) : locked;
  }
}

async function storedRecord(tx: ControlPlaneTransaction, evidenceIdText: string): Promise<Result<EvidenceRecord>> {
  const evidenceId = parseIdentifier('EvidenceId', evidenceIdText);
  const record = evidenceId.ok ? await tx.evidence.get(evidenceId.value as EvidenceId) : ok(undefined);
  if (!record.ok) return record;
  if (record.value !== undefined) return ok(record.value);
  return err(failure('not-found', `no evidence ${evidenceIdText}`, { evidence: evidenceIdText }));
}

export function viewOf(record: EvidenceRecord): EvidenceView {
  return JSON.parse(JSON.stringify(record)) as EvidenceView;
}

function unknownTask(publication: EvidencePublication): Result<never> {
  return err(failure('forbidden', `evidence ${publication.evidenceId} is not authorized: no task ${publication.taskId}`, {
    evidence: publication.evidenceId,
    reason: 'producer-not-authorized',
  }));
}
