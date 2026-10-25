import type { MessageSchemas } from '@taskelith/contracts';
import type { InventoryPart, JournalId, WorkerId } from '@taskelith/execution';
import { ok, type EventId, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { evaluateSnapshots, receivePart, requestInventory } from './inventory-reconciliation.js';
import { authenticateProducer, type ReconciliationContext } from './journal-reconciliation.js';
import { OBSERVATION_CONSUMER } from './observation-service.js';
import { isNotConsumed, type ObservationMessage } from './observation.js';
import { PendingLog } from './pending-log.js';

export type InventoryOutcome = 'applied' | 'duplicate';

export interface InventoryServiceOptions {
  // The `requestId` of each inventory request: random in production.
  readonly newRequestId: () => string;
  readonly logger?: Logger;
}

export interface InventoryRequestSummary {
  readonly sent: number;
  readonly failed: number;
}

type InventoryReported = MessageSchemas['InventoryReported'];

// Item 21c: each report part in one SERIALIZABLE transaction; an `Err` makes
// the consumer deliver it again, and one not consumed reaches quarantine.
export class InventoryService {
  readonly #store: ControlPlaneStore;
  readonly #newRequestId: () => string;
  readonly #logger: Logger;

  constructor(store: ControlPlaneStore, options: InventoryServiceOptions) {
    this.#store = store;
    this.#newRequestId = options.newRequestId;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  // Decision 11: authentication, the inbox by `reportId.part`, first
  // contact, the part, and the evaluation of its snapshot; no confirmation.
  apply(message: ObservationMessage): Promise<Result<InventoryOutcome>> {
    const part = inventoryPartOf(message.body as unknown as InventoryReported);
    return this.#transaction(async (tx, context) => {
      const producer = { subjectWorkerId: message.subjectWorkerId, workerId: part.workerId, journalId: part.journalId };
      const authentic = await authenticateProducer(tx, producer, context);
      if (!authentic.ok) return authentic;
      const inbox = await tx.inbox.accept(OBSERVATION_CONSUMER, `${part.reportId}.${part.part}` as EventId);
      if (!inbox.ok) return inbox;
      if (inbox.value === 'duplicate') return ok('duplicate');
      const contact = await tx.reports.recordContact(part.workerId, await tx.now());
      if (!contact.ok) return contact;
      const received = await receivePart(tx, part, context);
      if (!received.ok) return received;
      const evaluated = await evaluateSnapshots(tx, part.workerId, part.journalId, context);
      return evaluated.ok ? ok('applied') : evaluated;
    });
  }

  // Decision 4 (b): one pass at start, each worker in its own transaction;
  // a failure is logged and not retried.
  async requestAll(workerIds: readonly WorkerId[]): Promise<InventoryRequestSummary> {
    let failed = 0;
    for (const workerId of workerIds) {
      const requested = await this.#transaction((tx, context) => requestInventory(tx, workerId, context));
      if (requested.ok) continue;
      failed += 1;
      this.#logger.with({ workerId }).warn('execution.inventory-request.failed', { code: requested.error.code, message: requested.error.message });
    }
    const summary = { sent: workerIds.length - failed, failed };
    this.#logger.info('execution.inventory-requests.sent', summary);
    return summary;
  }

  // The warnings of the attempt that settled, if it committed or refused
  // the message; a failed one is delivered again.
  async #transaction<Value>(work: (tx: ControlPlaneTransaction, context: ReconciliationContext) => Promise<Result<Value>>): Promise<Result<Value>> {
    let log = new PendingLog();
    const result = await this.#store.transaction((tx) => {
      log = new PendingLog();
      return work(tx, { log, newRequestId: this.#newRequestId, requested: new Set() });
    });
    if (result.ok || isNotConsumed(result.error)) log.writeTo(this.#logger);
    return result;
  }
}

// The consumer checked the schema, whose identifiers the kernel shares.
function inventoryPartOf(report: InventoryReported): InventoryPart {
  return Object.freeze({
    reportId: report.reportId,
    part: report.part,
    parts: report.parts,
    workerId: report.workerId as WorkerId,
    journalId: report.journalId as JournalId,
    ...(report.requestId === undefined ? {} : { requestId: report.requestId }),
    snapshot: report.snapshot,
    throughSequence: report.throughSequence,
    assignments: report.assignments,
    executions: report.executions,
  });
}
