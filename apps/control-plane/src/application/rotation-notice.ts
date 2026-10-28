import { randomUUID } from 'node:crypto';
import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import type { WorkerId } from '@taskelith/execution';
import type { RotationRequest } from '@taskelith/fleet';
import { parseEventMetadata, type Result } from '@taskelith/kernel';
import type { ControlPlaneTransaction } from './control-plane-store.js';

const NOTICE = 'worker.credentials.rotation-requested';

// Appended in the request's transaction, so the outbox sends it over
// JetStream once the request commits (installation contract section 6).
export async function appendRotationNotice(tx: ControlPlaneTransaction, workerId: WorkerId, request: RotationRequest): Promise<Result<void>> {
  const at = await tx.now();
  const noticeId = randomUUID();
  const metadata = parseEventMetadata({ eventId: `r${noticeId}`, eventType: NOTICE, schemaVersion: 1, occurredAt: at, correlationId: noticeId });
  if (!metadata.ok) return metadata;
  const protocolVersion = (await tx.workers.get(workerId))?.protocolVersion ?? EXECUTION_PROTOCOL_VERSION;
  const payload: MessageSchemas['CredentialRotationRequested'] = {
    messageType: NOTICE, schemaVersion: 1, protocolVersion, issuedAt: at, workerId,
    credentialGeneration: request.generation, deadline: request.deadline,
  };
  return tx.outbox.append({ metadata: metadata.value, subject: `workers.${workerId}.commands`, payload: { ...payload } });
}
