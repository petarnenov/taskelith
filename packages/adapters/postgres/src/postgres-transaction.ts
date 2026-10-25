import {
  PostgresAdmissionRepository,
  PostgresAssignmentRepository,
  PostgresGateRepository,
  PostgresInbox,
  PostgresOutbox,
  PostgresTaskRepository,
  PostgresWorkflowRunRepository,
} from './repositories.js';
import type { Session } from './session.js';

// One SERIALIZABLE transaction: every repository and the outbox and inbox
// read and write through it, and commit or roll back together.
export class PostgresTransaction {
  readonly admissions: PostgresAdmissionRepository;
  readonly runs: PostgresWorkflowRunRepository;
  readonly gates: PostgresGateRepository;
  readonly tasks: PostgresTaskRepository;
  readonly assignments: PostgresAssignmentRepository;
  readonly outbox: PostgresOutbox;
  readonly inbox: PostgresInbox;

  constructor(session: Session) {
    this.admissions = new PostgresAdmissionRepository(session);
    this.runs = new PostgresWorkflowRunRepository(session);
    this.gates = new PostgresGateRepository(session);
    this.tasks = new PostgresTaskRepository(session);
    this.assignments = new PostgresAssignmentRepository(session);
    this.outbox = new PostgresOutbox(session);
    this.inbox = new PostgresInbox(session);
  }
}
