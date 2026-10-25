import { err, failure, ok, type EventId, type Result } from '@taskelith/kernel';
import { unknownExecutionCount, type AssignmentId, type Inbox, type InboxOutcome, type Task, type TaskRepository } from '@taskelith/execution';
import type { Assignment, AssignmentRepository } from '@taskelith/scheduling';
import type {
  AdmissionId,
  AdmissionRepository,
  ArtifactId,
  Gate,
  GateId,
  GateRepository,
  Generation,
  Outbox,
  OutboxMessage,
  TaskAdmission,
  TaskId,
  WorkflowRun,
  WorkflowRunId,
  WorkflowRunRepository,
} from '@taskelith/sdlc';
import { isJsonObject } from '@taskelith/sdlc';
import { AggregateStore } from './aggregate-store.js';
import { decodeRecord, decodeTask, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

export class PostgresAdmissionRepository implements AdmissionRepository {
  readonly #store: AggregateStore<TaskAdmission>;

  constructor(session: Session) {
    this.#store = new AggregateStore(session, {
      table: 'admissions',
      entity: 'admission',
      idOf: (admission) => admission.id,
      generationOf: (admission) => admission.generation,
      columnsOf: (admission) => ({ state: admission.state, artifact_ids: admission.artifacts.map((revision) => revision.artifactId) }),
      decode: decodeRecord,
    });
  }

  get(id: AdmissionId): Promise<Result<TaskAdmission>> {
    return this.#store.get(id);
  }

  add(admission: TaskAdmission): Promise<Result<void>> {
    return this.#store.add(admission);
  }

  replace(admission: TaskAdmission, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#store.replace(admission, expectedGeneration);
  }

  listUnusedBoundTo(artifactId: ArtifactId): Promise<readonly TaskAdmission[]> {
    return this.#store.list(`state = 'admitted' AND artifact_ids @> ARRAY[$1::text]`, [artifactId]);
  }
}

export class PostgresWorkflowRunRepository implements WorkflowRunRepository {
  readonly #store: AggregateStore<WorkflowRun>;

  constructor(session: Session) {
    this.#store = new AggregateStore(session, {
      table: 'workflow_runs',
      entity: 'run',
      idOf: (run) => run.id,
      generationOf: (run) => run.progress.generation,
      columnsOf: () => ({}),
      decode: decodeRecord,
    });
  }

  get(id: WorkflowRunId): Promise<Result<WorkflowRun>> {
    return this.#store.get(id);
  }

  add(run: WorkflowRun): Promise<Result<void>> {
    return this.#store.add(run);
  }

  replace(run: WorkflowRun, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#store.replace(run, expectedGeneration);
  }
}

// The run of a gate is a column that `add` sets and `replace` leaves.
export class PostgresGateRepository implements GateRepository {
  readonly #store: AggregateStore<Gate>;

  constructor(session: Session) {
    this.#store = new AggregateStore(session, {
      table: 'gates',
      entity: 'gate',
      idOf: (gate) => gate.id,
      generationOf: (gate) => gate.generation,
      columnsOf: () => ({}),
      decode: decodeRecord,
    });
  }

  get(id: GateId): Promise<Result<Gate>> {
    return this.#store.get(id);
  }

  add(runId: WorkflowRunId, gate: Gate): Promise<Result<void>> {
    return this.#store.add(gate, { insertOnly: { run_id: runId } });
  }

  replace(gate: Gate, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#store.replace(gate, expectedGeneration);
  }

  listByRun(runId: WorkflowRunId): Promise<readonly Gate[]> {
    return this.#store.list('run_id = $1', [runId]);
  }
}

export class PostgresTaskRepository implements TaskRepository {
  readonly #store: AggregateStore<Task>;

  constructor(session: Session) {
    this.#store = new AggregateStore(session, {
      table: 'tasks',
      entity: 'task',
      idOf: (task) => task.id,
      generationOf: (task) => task.generation,
      columnsOf: (task) => ({ admission_id: task.admissionId, unknown_executions: unknownExecutionCount(task) }),
      decode: decodeTask,
    });
  }

  get(id: TaskId): Promise<Result<Task>> {
    return this.#store.get(id);
  }

  add(task: Task): Promise<Result<void>> {
    return this.#store.add(task);
  }

  replace(task: Task, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#store.replace(task, expectedGeneration);
  }
}

// One held reservation per attempt is checked before writing, so a transaction
// gets a `conflict` result; the partial unique index guards concurrent writers.
export class PostgresAssignmentRepository implements AssignmentRepository {
  readonly #session: Session;
  readonly #store: AggregateStore<Assignment>;

  constructor(session: Session) {
    this.#session = session;
    this.#store = new AggregateStore(session, {
      table: 'assignments',
      entity: 'assignment',
      idOf: (assignment) => assignment.id,
      generationOf: (assignment) => assignment.generation,
      columnsOf: ({ attemptId, workerId, state, changedAt, reservation }) => ({
        attempt_id: attemptId,
        worker_id: workerId,
        state,
        changed_at: changedAt,
        reservation_state: reservation.state,
        project_id: reservation.scope.projectId,
        run_id: reservation.scope.runId,
        task_id: reservation.scope.taskId,
        root_task_id: reservation.scope.rootTaskId,
        cpu_millicores: reservation.requested.cpuMillicores,
        memory_mebibytes: reservation.requested.memoryMebibytes,
        provider_credentials: [...reservation.providerCredentials],
      }),
      decode: decodeRecord,
    });
  }

  get(id: AssignmentId): Promise<Result<Assignment>> {
    return this.#store.get(id);
  }

  add(assignment: Assignment): Promise<Result<void>> {
    return this.#store.add(assignment, { uniqueConflict: () => this.#heldReservationConflict(assignment) });
  }

  replace(assignment: Assignment, expectedGeneration: Generation): Promise<Result<void>> {
    const held = assignment.reservation.state === 'held' ? () => this.#heldReservationConflict(assignment) : undefined;
    return this.#store.replace(assignment, expectedGeneration, held);
  }

  async #heldReservationConflict(assignment: Assignment): Promise<Result<void>> {
    const { rows } = await this.#session.query<{ id: string }>(
      `SELECT id FROM assignments WHERE attempt_id = $1 AND reservation_state = 'held' AND id <> $2`,
      [assignment.attemptId, assignment.id],
    );
    if (rows[0] === undefined) return ok(undefined);
    return err(failure('conflict', `attempt ${assignment.attemptId} already holds a reservation through ${rows[0].id}`, {
      attempt: assignment.attemptId, assignment: rows[0].id,
    }));
  }
}

// One table serves the outbox ports of every module; `appended` tells the
// transaction that its commit carries outbox messages.
export class PostgresOutbox implements Outbox {
  readonly #session: Session;
  #appended = false;

  constructor(session: Session) {
    this.#session = session;
  }

  get appended(): boolean {
    return this.#appended;
  }

  async append(message: OutboxMessage): Promise<Result<void>> {
    const { eventId, eventType } = message.metadata;
    if (!isJsonObject(message.payload)) return err(failure('invalid', `outbox message ${eventId} has a payload that is not JSON`, { event: eventId }));
    const inserted = await this.#session.query(
      'INSERT INTO outbox (event_id, event_type, message) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [eventId, eventType, encodeRecord(message)],
    );
    if (inserted.rowCount === 0) return err(failure('conflict', `outbox message ${eventId} already exists`, { event: eventId }));
    this.#appended = true;
    return ok(undefined);
  }

  // The oldest messages not yet published, in append order.
  async unpublished(limit: number): Promise<readonly OutboxMessage[]> {
    const { rows } = await this.#session.query<{ message: unknown }>(
      'SELECT message FROM outbox WHERE published_at IS NULL ORDER BY position LIMIT $1',
      [limit],
    );
    return rows.map((row) => decodeRecord<OutboxMessage>(row.message));
  }

  // Marking twice is harmless: a publisher may resend before it marks.
  async markPublished(eventId: EventId): Promise<Result<void>> {
    const updated = await this.#session.query(
      'UPDATE outbox SET published_at = coalesce(published_at, now()) WHERE event_id = $1',
      [eventId],
    );
    if (updated.rowCount === 0) return err(failure('not-found', `outbox message ${eventId} does not exist`, { event: eventId }));
    return ok(undefined);
  }
}

export class PostgresInbox implements Inbox {
  readonly #session: Session;
  #accepted = false;

  constructor(session: Session) {
    this.#session = session;
  }

  get accepted(): boolean {
    return this.#accepted;
  }

  // The consumer is stored as JSON text: UTF-8 cannot hold NUL or keep two
  // unpaired surrogates apart, and their escapes can.
  async accept(consumer: string, messageId: EventId): Promise<Result<InboxOutcome>> {
    const inserted = await this.#session.query(
      'INSERT INTO inbox (consumer, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [JSON.stringify(consumer), messageId],
    );
    if (inserted.rowCount === 0) return ok('duplicate');
    this.#accepted = true;
    return ok('accepted');
  }
}
