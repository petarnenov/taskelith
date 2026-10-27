import type { Instant } from '@taskelith/kernel';
import {
  PostgresCapacityLedger,
  PostgresInstallationGuard,
  PostgresPlacementQueue,
  PostgresPlacementRotation,
  PostgresPlacementWorkers,
  PostgresQuotaSettings,
  PostgresTaskLineage,
  databaseNow,
} from './capacity-repositories.js';
import { PostgresSignalReadings } from './control-plane-signals.js';
import { PostgresEvidenceProducers, PostgresEvidenceRecords } from './evidence-records.js';
import {
  PostgresAdmissionRepository,
  PostgresAssignmentRepository,
  PostgresDelegationRequests,
  PostgresGateRepository,
  PostgresInbox,
  PostgresOutbox,
  PostgresTaskRepository,
  PostgresWorkflowRunRepository,
} from './repositories.js';
import { PostgresCurrentRevisions, PostgresLaunchRecords } from './launch-repositories.js';
import { PostgresInventoryReports, PostgresInventoryRequests } from './inventory-repositories.js';
import { PostgresFleetRegistry, PostgresInstallationTable, PostgresOperatorCredentials } from './fleet-repositories.js';
import { PostgresProducerCursors, PostgresWorkerReports } from './observation-repositories.js';
import { PostgresReconciliationQueue, PostgresUnrecordedProcesses } from './reconciliation-repositories.js';
import { PostgresPlacementOutcomeRecords } from './placement-outcome-records.js';
import { PostgresRunCatalog } from './run-catalog.js';
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
  readonly workers: PostgresPlacementWorkers;
  readonly installation: PostgresInstallationGuard;
  readonly quotas: PostgresQuotaSettings;
  readonly lineage: PostgresTaskLineage;
  readonly ledger: PostgresCapacityLedger;
  readonly placements: PostgresPlacementQueue;
  readonly rotation: PostgresPlacementRotation;
  readonly placementOutcomes: PostgresPlacementOutcomeRecords;
  readonly delegations: PostgresDelegationRequests;
  readonly fleet: PostgresFleetRegistry;
  readonly catalog: PostgresRunCatalog;
  readonly installationTable: PostgresInstallationTable;
  readonly operatorCredentials: PostgresOperatorCredentials;
  readonly signals: PostgresSignalReadings;
  readonly evidence: PostgresEvidenceRecords;
  readonly producers: PostgresEvidenceProducers;
  readonly launches: PostgresLaunchRecords;
  readonly revisions: PostgresCurrentRevisions;
  readonly cursors: PostgresProducerCursors;
  readonly reports: PostgresWorkerReports;
  readonly inventoryRequests: PostgresInventoryRequests;
  readonly inventoryReports: PostgresInventoryReports;
  readonly unrecordedProcesses: PostgresUnrecordedProcesses;
  readonly reconciliation: PostgresReconciliationQueue;
  // The outbox reads its stored messages back, such as an offer sent again.
  readonly outboxLookup: PostgresOutbox;
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
    this.admissions = new PostgresAdmissionRepository(session);
    this.runs = new PostgresWorkflowRunRepository(session);
    this.gates = new PostgresGateRepository(session);
    this.tasks = new PostgresTaskRepository(session);
    this.assignments = new PostgresAssignmentRepository(session);
    this.outbox = new PostgresOutbox(session);
    this.inbox = new PostgresInbox(session);
    this.workers = new PostgresPlacementWorkers(session);
    this.installation = new PostgresInstallationGuard(session);
    this.quotas = new PostgresQuotaSettings(session);
    this.lineage = new PostgresTaskLineage(session);
    this.ledger = new PostgresCapacityLedger(session);
    this.placements = new PostgresPlacementQueue(session);
    this.rotation = new PostgresPlacementRotation(session);
    this.placementOutcomes = new PostgresPlacementOutcomeRecords(session);
    this.delegations = new PostgresDelegationRequests(session);
    this.fleet = new PostgresFleetRegistry(session);
    this.catalog = new PostgresRunCatalog(session);
    this.installationTable = new PostgresInstallationTable(session);
    this.operatorCredentials = new PostgresOperatorCredentials(session);
    this.signals = new PostgresSignalReadings(session);
    this.evidence = new PostgresEvidenceRecords(session);
    this.producers = new PostgresEvidenceProducers(session);
    this.launches = new PostgresLaunchRecords(session);
    this.revisions = new PostgresCurrentRevisions(session);
    this.cursors = new PostgresProducerCursors(session);
    this.reports = new PostgresWorkerReports(session);
    this.inventoryRequests = new PostgresInventoryRequests(session);
    this.inventoryReports = new PostgresInventoryReports(session);
    this.unrecordedProcesses = new PostgresUnrecordedProcesses(session);
    this.reconciliation = new PostgresReconciliationQueue(session);
    this.outboxLookup = this.outbox;
  }

  now(): Promise<Instant> {
    return databaseNow(this.#session);
  }
}
