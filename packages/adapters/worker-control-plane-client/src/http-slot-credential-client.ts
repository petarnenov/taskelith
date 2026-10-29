import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import {
  DeliveredSlotCredential,
  type SlotCredentialAnswer,
  type SlotCredentialClient,
  type SlotCredentialFetch,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { getJson, pinnedTarget, statusFailure, type HttpTarget } from './control-plane-http.js';
import { sanitizeFailureText } from './failure-cause.js';
import type { ControlPlaneClientSettings } from './http-launch-authority-client.js';

// `fetchSlotCredential` over pinned TLS (execution wire contracts section
// 8.6). No failure quotes the response body, which may hold the secret.
export class HttpSlotCredentialClient implements SlotCredentialClient {
  readonly #target: HttpTarget;
  readonly #bearer: () => string;

  constructor(settings: ControlPlaneClientSettings) {
    this.#target = pinnedTarget(settings);
    this.#bearer = settings.bearer;
  }

  async fetch(request: SlotCredentialFetch): Promise<Result<SlotCredentialAnswer>> {
    // Account pool contract section 7.2: the request is never sent in clear.
    if (this.#target.baseUrl.protocol !== 'https:') return err(failure('invalid', 'a slot credential is fetched only over HTTPS'));
    const answered = await getJson(this.#target, pathOf(request), this.#bearer());
    if (!answered.ok) return answered;
    const { status, body } = answered.value;
    if (status === 200) return delivered(request, body);
    if (status === 422 && checkHttpSchema('SlotCredentialRefusal', body).ok) return refused(body as HttpSchemas['SlotCredentialRefusal']);
    return err(statusFailure('fetchSlotCredential', answered.value));
  }
}

function pathOf({ executionId, slotId, attemptId, ownershipGeneration, recoveryEpoch }: SlotCredentialFetch): string {
  const query = new URLSearchParams({ attemptId, ownershipGeneration: String(ownershipGeneration), recoveryEpoch: String(recoveryEpoch) });
  return `executions/${encodeURIComponent(executionId)}/slot-credentials/${encodeURIComponent(slotId)}?${query.toString()}`;
}

// A delivery for another execution or slot is never used.
function delivered(request: SlotCredentialFetch, body: unknown): Result<SlotCredentialAnswer> {
  const checked = checkHttpSchema('SlotCredentialDelivery', body);
  if (!checked.ok) return err(failure('internal', 'the slot credential delivery violates its schema', { violations: String(checked.error.length) }));
  const { executionId, slotId, mechanismId, credentialVersion, credential } = checked.value;
  if (executionId !== request.executionId || slotId !== request.slotId) {
    return err(failure('internal', 'the slot credential delivery names another execution or slot'));
  }
  const held = DeliveredSlotCredential.of({ executionId: request.executionId, slotId: request.slotId, mechanismId, credentialVersion, secret: credential });
  return held.ok ? ok(Object.freeze({ kind: 'delivered', credential: held.value })) : held;
}

function refused({ message, details }: HttpSchemas['SlotCredentialRefusal']): Result<SlotCredentialAnswer> {
  return ok(Object.freeze({ kind: 'refused', refusal: Object.freeze({ reason: details.reason, message: sanitizeFailureText(message) }) }));
}
