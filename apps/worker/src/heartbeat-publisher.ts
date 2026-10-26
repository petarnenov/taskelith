import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import type { JournalBinding } from '@taskelith/execution';
import type { Instant, Result } from '@taskelith/kernel';
import { encodeJson } from '@taskelith/nats';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';

// The provisional heartbeat interval of the operational targets.
export const HEARTBEAT_MILLISECONDS = 10_000;

const SCHEMA_VERSION = 1;

type WorkerHeartbeat = MessageSchemas['WorkerHeartbeat'];

export interface HeartbeatOptions {
  readonly binding: Pick<JournalBinding, 'workerId' | 'journalId'>;
  readonly subject: string;
  // Core NATS, outside any stream: the next heartbeat replaces a lost one.
  readonly send: (subject: string, body: Uint8Array) => Result<void>;
  // False while the link is down or the journal stopped (its section 7).
  readonly canSend: () => boolean;
  readonly now: () => Instant;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly intervalMilliseconds?: number;
  readonly logger?: Logger;
}

export function heartbeatMessage(binding: HeartbeatOptions['binding'], sentAt: Instant): WorkerHeartbeat {
  return {
    messageType: 'worker.heartbeat', schemaVersion: SCHEMA_VERSION, protocolVersion: EXECUTION_PROTOCOL_VERSION,
    workerId: binding.workerId, journalId: binding.journalId, sentAt,
  };
}

// A heartbeat at once and then at each interval, until the signal aborts.
export async function runHeartbeats(options: HeartbeatOptions, signal: AbortSignal): Promise<void> {
  const logger = options.logger ?? SILENT_LOGGER;
  while (!signal.aborted) {
    if (options.canSend()) {
      const sent = options.send(options.subject, encodeJson(heartbeatMessage(options.binding, options.now())));
      if (!sent.ok) logger.debug('worker.heartbeat.unsent', { reason: sent.error.message });
    }
    await options.sleep(options.intervalMilliseconds ?? HEARTBEAT_MILLISECONDS, signal);
  }
}
