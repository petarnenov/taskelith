import type { WorkerJournal } from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import { encodeJson, retryDelayMilliseconds, TRANSPORT_LIMITS, type Publication, type PublishOutcome, type TransportLimits } from '@taskelith/nats';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { inventoryParts } from './observation-messages.js';

export interface InventoryReportOptions {
  readonly journal: WorkerJournal;
  readonly publish: (publication: Publication) => Promise<Result<PublishOutcome>>;
  readonly observationSubject: string;
  readonly newReportId: () => string;
  readonly now: () => Instant;
}

// One snapshot in parts; a failed part fails the report, and a later
// snapshot replaces it. Only an answer names the request.
export async function publishInventory(options: InventoryReportOptions, requestId?: string): Promise<Result<void>> {
  const { journal, newReportId, now, observationSubject: subject, publish } = options;
  const inventory = journal.takeInventory();
  if (!inventory.ok) return inventory;
  const answer = { reportId: newReportId(), reportedAt: now(), ...(requestId === undefined ? {} : { requestId }) };
  for (const part of inventoryParts(journal.binding, inventory.value, answer)) {
    const sent = await publish({ subject, body: encodeJson(part), messageId: `${part.reportId}.${part.part}` });
    if (!sent.ok) return sent;
  }
  return ok(undefined);
}

export interface ConnectionReportOptions extends InventoryReportOptions {
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  readonly limits?: TransportLimits;
  readonly logger?: Logger;
}

// The unsolicited report of each connection (wire contracts section 6),
// tried again with backoff until published or the link is down.
export async function reportInventoryOnConnection(options: ConnectionReportOptions, signal: AbortSignal): Promise<void> {
  const logger = options.logger ?? SILENT_LOGGER;
  for (let attempt = 1; !signal.aborted; attempt += 1) {
    const reported = await publishInventory(options);
    if (reported.ok) return;
    logger.debug('worker.inventory.unreported', { attempt, reason: reported.error.message });
    await options.sleep(retryDelayMilliseconds(attempt, options.limits ?? TRANSPORT_LIMITS, options.draw), signal);
  }
}
