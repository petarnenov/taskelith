import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { AssignmentId, Inbox, InboxOutcome, Task, TaskRepository } from '@taskelith/execution';
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
import type { PostgresDatabase } from './postgres-database.js';

// The ports for callers outside a transaction: each call runs as its own
// SERIALIZABLE transaction, with the same retries.

async function listed<Value>(result: Promise<Result<readonly Value[]>>): Promise<readonly Value[]> {
  const outcome = await result;
  if (!outcome.ok) throw new Error(outcome.error.message);
  return outcome.value;
}

export class CommittingAdmissionRepository implements AdmissionRepository {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  get(id: AdmissionId): Promise<Result<TaskAdmission>> {
    return this.#database.transaction((tx) => tx.admissions.get(id));
  }

  add(admission: TaskAdmission): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.admissions.add(admission));
  }

  replace(admission: TaskAdmission, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.admissions.replace(admission, expectedGeneration));
  }

  listUnusedBoundTo(artifactId: ArtifactId): Promise<readonly TaskAdmission[]> {
    return listed(this.#database.transaction(async (tx) => ok(await tx.admissions.listUnusedBoundTo(artifactId))));
  }
}

export class CommittingWorkflowRunRepository implements WorkflowRunRepository {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  get(id: WorkflowRunId): Promise<Result<WorkflowRun>> {
    return this.#database.transaction((tx) => tx.runs.get(id));
  }

  add(run: WorkflowRun): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.runs.add(run));
  }

  replace(run: WorkflowRun, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.runs.replace(run, expectedGeneration));
  }
}

export class CommittingGateRepository implements GateRepository {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  get(id: GateId): Promise<Result<Gate>> {
    return this.#database.transaction((tx) => tx.gates.get(id));
  }

  add(runId: WorkflowRunId, gate: Gate): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.gates.add(runId, gate));
  }

  replace(gate: Gate, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.gates.replace(gate, expectedGeneration));
  }

  listByRun(runId: WorkflowRunId): Promise<readonly Gate[]> {
    return listed(this.#database.transaction(async (tx) => ok(await tx.gates.listByRun(runId))));
  }
}

export class CommittingTaskRepository implements TaskRepository {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  get(id: TaskId): Promise<Result<Task>> {
    return this.#database.transaction((tx) => tx.tasks.get(id));
  }

  add(task: Task): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.tasks.add(task));
  }

  replace(task: Task, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.tasks.replace(task, expectedGeneration));
  }
}

export class CommittingAssignmentRepository implements AssignmentRepository {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  get(id: AssignmentId): Promise<Result<Assignment>> {
    return this.#database.transaction((tx) => tx.assignments.get(id));
  }

  add(assignment: Assignment): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.assignments.add(assignment));
  }

  replace(assignment: Assignment, expectedGeneration: Generation): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.assignments.replace(assignment, expectedGeneration));
  }
}

export class CommittingOutbox implements Outbox {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  append(message: OutboxMessage): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.outbox.append(message));
  }
}

export class CommittingInbox implements Inbox {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  accept(consumer: string, messageId: EventId): Promise<Result<InboxOutcome>> {
    return this.#database.transaction((tx) => tx.inbox.accept(consumer, messageId));
  }
}
