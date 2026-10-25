import { ok, type EventId, type Instant, type Result } from '@taskelith/kernel';
import type { AssignmentId, Inbox, InboxOutcome, Task, TaskRepository } from '@taskelith/execution';
import type { Assignment, AssignmentRepository } from '@taskelith/scheduling';
import type { AuditEvent, OperatorCredential, OperatorCredentials, SecretHash } from '@taskelith/access';
import type { WorkerId } from '@taskelith/execution';
import type {
  BrokerRevocation,
  CredentialGeneration,
  EnrolledWorker,
  EnrollmentToken,
  FleetRegistry,
  InstallationIdentity,
  InstallationTable,
} from '@taskelith/fleet';
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

export class CommittingFleetRegistry implements FleetRegistry {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  addToken(token: EnrollmentToken): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.fleet.addToken(token));
  }

  unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>> {
    return this.#database.transaction((tx) => tx.fleet.unusedToken(hash));
  }

  enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.fleet.enroll(tokenHash, worker));
  }

  worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>> {
    return this.#database.transaction((tx) => tx.fleet.worker(workerId));
  }

  rotate(workerId: WorkerId, expectedGeneration: number, next: CredentialGeneration, validUntil: Instant, at: Instant): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.fleet.rotate(workerId, expectedGeneration, next, validUntil, at));
  }

  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.fleet.revoke(workerId, at));
  }

  expirePredecessors(now: Instant): Promise<Result<number>> {
    return this.#database.transaction((tx) => tx.fleet.expirePredecessors(now));
  }

  publishRevocations(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>> {
    return this.#database.transaction((tx) => tx.fleet.publishRevocations(push), 'read-committed');
  }
}

export class CommittingInstallationTable implements InstallationTable {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  read(): Promise<Result<InstallationIdentity | undefined>> {
    return this.#database.transaction((tx) => tx.installationTable.read());
  }

  initialize(identity: InstallationIdentity): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.installationTable.initialize(identity));
  }
}

export class CommittingOperatorCredentials implements OperatorCredentials {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  current(): Promise<Result<OperatorCredential | undefined>> {
    return this.#database.transaction((tx) => tx.operatorCredentials.current());
  }

  install(next: OperatorCredential, event: AuditEvent): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.operatorCredentials.install(next, event));
  }

  auditTrail(): Promise<Result<readonly AuditEvent[]>> {
    return this.#database.transaction((tx) => tx.operatorCredentials.auditTrail());
  }
}
