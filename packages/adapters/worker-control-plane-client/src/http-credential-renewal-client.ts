import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import type { CredentialRenewalClient, RenewalAnswer, RenewalMaterial } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { pinnedTarget, postJson, statusFailure, type ControlPlaneEndpoint, type HttpTarget } from './control-plane-http.js';
import { sanitizeFailureText } from './failure-cause.js';

// `renewWorkerCredentials` and `confirmWorkerCredentials` over pinned
// TLS; no answer, a 503, or a timeout is `unavailable`.
export class HttpCredentialRenewalClient implements CredentialRenewalClient {
  readonly #target: HttpTarget;

  constructor(endpoint: ControlPlaneEndpoint) {
    this.#target = pinnedTarget(endpoint);
  }

  async renew(bearer: string, material: RenewalMaterial): Promise<Result<RenewalAnswer>> {
    const request: HttpSchemas['CredentialRenewalRequest'] = {
      credentialGeneration: material.generation,
      brokerUserPublicKey: material.brokerUserKey,
      controlPlaneSecretSha256: material.controlPlaneSha256,
    };
    const answered = await postJson(this.#target, 'workers/credentials/renewals', bearer, request);
    if (!answered.ok) return answered;
    if (answered.value.status !== 200) return err(statusFailure('renewWorkerCredentials', answered.value));
    const checked = checkHttpSchema('CredentialRenewal', answered.value.body);
    if (!checked.ok) return err(schemaViolation('the renewal', checked.error));
    const { credentialGeneration, brokerUserJwt, deadline } = checked.value;
    const at = parseInstant(deadline);
    if (!at.ok) return err(failure('internal', 'the renewal deadline is not an instant'));
    if (credentialGeneration !== material.generation) return err(failure('internal', 'the control plane renewed another generation'));
    return ok(Object.freeze({ generation: credentialGeneration, brokerUserJwt, deadline: at.value }));
  }

  async confirm(bearer: string, generation: number): Promise<Result<void>> {
    const request: HttpSchemas['CredentialConfirmationRequest'] = { credentialGeneration: generation };
    const answered = await postJson(this.#target, 'workers/credentials/confirmations', bearer, request);
    if (!answered.ok) return answered;
    if (answered.value.status !== 200) return err(statusFailure('confirmWorkerCredentials', answered.value));
    const checked = checkHttpSchema('CredentialConfirmation', answered.value.body);
    if (!checked.ok) return err(schemaViolation('the confirmation', checked.error));
    if (checked.value.credentialGeneration !== generation) return err(failure('internal', 'the control plane confirmed another generation'));
    return ok(undefined);
  }
}

function schemaViolation(answer: string, violations: readonly string[]) {
  return failure('internal', `${answer} violates its schema`, { violation: sanitizeFailureText(violations[0] ?? '') });
}
