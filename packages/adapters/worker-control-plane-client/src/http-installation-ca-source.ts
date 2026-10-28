import { createHash, X509Certificate } from 'node:crypto';
import { checkHttpSchema } from '@taskelith/contracts';
import type { InstallationCa, InstallationCaSource } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { Agent } from 'undici';
import { getJson, statusFailure, type ControlPlaneAddress, type HttpTarget } from './control-plane-http.js';

// `readInstallationCa` before the worker trusts any CA: its TLS verifies no
// server, so the caller trusts the answer only by its fingerprint.
export class HttpInstallationCaSource implements InstallationCaSource {
  readonly #target: HttpTarget;

  constructor(address: ControlPlaneAddress) {
    this.#target = { ...address, dispatcher: new Agent({ connect: { rejectUnauthorized: false } }) };
  }

  async read(): Promise<Result<InstallationCa>> {
    const answered = await getJson(this.#target, 'installation/ca');
    if (!answered.ok) return answered;
    if (answered.value.status !== 200) return err(statusFailure('readInstallationCa', answered.value));
    const checked = checkHttpSchema('InstallationCa', answered.value.body);
    if (!checked.ok) return err(notOneCa());
    return parseCa(checked.value.certificate);
  }
}

function parseCa(certificatePem: string): Result<InstallationCa> {
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(certificatePem);
  } catch {
    return err(notOneCa());
  }
  if (!certificate.ca) return err(notOneCa());
  return ok(Object.freeze({ certificatePem, sha256: createHash('sha256').update(certificate.raw).digest('hex') }));
}

function notOneCa() {
  return failure('precondition-failed', 'readInstallationCa answered no single CA certificate', { reason: 'installation-ca-mismatch' });
}
