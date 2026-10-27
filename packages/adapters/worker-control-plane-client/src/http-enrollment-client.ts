import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import { parseRecoveryEpoch } from '@taskelith/execution';
import { parseInstallationId, parseWorkerId, type Enrollment, type EnrollmentClient, type EnrollmentRequest } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { postJson, statusFailure, type ControlPlaneEndpoint } from './control-plane-http.js';
import { sanitizeFailureText } from './failure-cause.js';

// `enrollWorker` over HTTP. An `unavailable` answer may still have used the
// token, so a retry can fail with `token-invalid`.
export class HttpEnrollmentClient implements EnrollmentClient {
  readonly #endpoint: ControlPlaneEndpoint;

  constructor(endpoint: ControlPlaneEndpoint) {
    this.#endpoint = endpoint;
  }

  async enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>> {
    const answered = await postJson(this.#endpoint, 'workers/enrollments', tokenSecret, wireRequest(request));
    if (!answered.ok) return answered;
    if (answered.value.status !== 201) return err(statusFailure('enrollWorker', answered.value));
    const { body } = answered.value;
    const checked = checkHttpSchema('Enrollment', body);
    if (!checked.ok) return err(failure('internal', 'the enrollment violates its schema', { violation: sanitizeFailureText(checked.error[0] ?? '') }));
    return parseEnrollment(body as HttpSchemas['Enrollment']);
  }
}

function wireRequest(request: EnrollmentRequest): HttpSchemas['EnrollmentRequest'] {
  const { slots, cpuMillicores, memoryMebibytes, controls } = request.capacity;
  return {
    journalId: request.journalId,
    host: { ...request.host },
    protocolVersions: { ...request.protocolVersions },
    capacity: { slots, cpuMillicores, memoryMebibytes, enforceableControls: [...controls] },
  };
}

function parseEnrollment(body: HttpSchemas['Enrollment']): Result<Enrollment> {
  const installationId = parseInstallationId(body.installationId);
  const workerId = parseWorkerId(body.workerId);
  const recoveryEpoch = parseRecoveryEpoch(body.recoveryEpoch);
  if (!installationId.ok || !workerId.ok || !recoveryEpoch.ok) {
    return err(failure('internal', 'the enrollment holds identifiers that are not valid'));
  }
  const { minimum, maximum } = body.protocolVersions;
  const { controlPlane, broker } = body.credentials;
  return ok(Object.freeze({
    installationId: installationId.value,
    workerId: workerId.value,
    credentialGeneration: body.credentialGeneration,
    recoveryEpoch: recoveryEpoch.value,
    protocolVersions: Object.freeze({ minimum, maximum }),
    credentials: Object.freeze({ controlPlane, broker }),
  }));
}
