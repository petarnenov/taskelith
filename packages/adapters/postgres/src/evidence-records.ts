import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AttemptId, EvidenceId, EvidenceRecord, EvidenceRecords, WorkerId } from '@taskelith/execution';
import type { Assignment } from '@taskelith/scheduling';
import type { ContentDigest, OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

export class PostgresEvidenceRecords implements EvidenceRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(id: EvidenceId): Promise<Result<EvidenceRecord | undefined>> {
    const { rows } = await this.#session.query<{ record: string }>('SELECT record FROM evidence WHERE evidence_id = $1', [id]);
    const row = rows[0];
    return ok(row === undefined ? undefined : decodeRecord<EvidenceRecord>(row.record));
  }

  async add(record: EvidenceRecord): Promise<Result<void>> {
    const inserted = await this.#session.query(
      'INSERT INTO evidence (evidence_id, task_id, content_digest, record) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [record.evidenceId, record.taskId, record.contentDigest, encodeRecord(record)],
    );
    if (inserted.rowCount === 1) return ok(undefined);
    return err(failure('conflict', `evidence ${record.evidenceId} already exists`, { evidence: record.evidenceId }));
  }

  async listByTask(taskId: TaskId): Promise<Result<readonly EvidenceRecord[]>> {
    const { rows } = await this.#session.query<{ record: string }>('SELECT record FROM evidence WHERE task_id = $1 ORDER BY position', [taskId]);
    return ok(rows.map((row) => decodeRecord<EvidenceRecord>(row.record)));
  }

  async countByDigest(digest: ContentDigest): Promise<Result<number>> {
    const { rows } = await this.#session.query<{ count: string }>('SELECT count(*) FROM evidence WHERE content_digest = $1', [digest]);
    return ok(Number(rows[0]?.count ?? 0));
  }

  async remove(id: EvidenceId): Promise<Result<void>> {
    const deleted = await this.#session.query('DELETE FROM evidence WHERE evidence_id = $1', [id]);
    if (deleted.rowCount === 1) return ok(undefined);
    return err(failure('not-found', `evidence ${id} does not exist`, { evidence: id }));
  }

  // A transaction-scoped advisory lock, released at commit or rollback.
  async lockDigest(digest: ContentDigest): Promise<Result<void>> {
    await this.#session.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [digest]);
    return ok(undefined);
  }
}

// The generations of a worker's assignments for an attempt, except refused
// ones and superseded ones, which end without a grant to launch under.
const NEVER_HELD: ReadonlySet<string> = new Set(['refused', 'superseded']);

export class PostgresEvidenceProducers {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async heldGenerations(workerId: WorkerId, attemptId: AttemptId): Promise<Result<readonly OwnershipGeneration[]>> {
    const { rows } = await this.#session.query<{ record: string }>(
      'SELECT record FROM assignments WHERE attempt_id = $1 AND worker_id = $2',
      [attemptId, workerId],
    );
    const held = rows.map((row) => decodeRecord<Assignment>(row.record)).filter((assignment) => !NEVER_HELD.has(assignment.end?.reason ?? ''));
    return ok(held.map((assignment) => assignment.ownershipGeneration));
  }
}
