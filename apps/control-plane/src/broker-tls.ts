import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTROL_PLANE_DIRECTORY, ControlPlaneNamespace, INSTALLATION_FILE } from '@taskelith/control-plane-store';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { TransportTls } from '@taskelith/nats';
import { INSTALLATION_CA_FILE } from './admin/installation-authority.js';
import type { Environment } from './service-endpoints.js';

// The broker's CA: TASKELITH_NATS_CA, else the installation CA, which an
// initialized installation must have, so that it never connects plain.
export function readBrokerTls(environment: Environment, dataRoot: string, ownerUid: number): Result<TransportTls | undefined> {
  const configured = environment.TASKELITH_NATS_CA;
  if (configured !== undefined && configured !== '') return readConfiguredCa(configured);
  if (!existsSync(join(dataRoot, CONTROL_PLANE_DIRECTORY))) return ok(undefined);
  const namespace = ControlPlaneNamespace.open({ dataRoot, ownerUid });
  if (!namespace.ok) return namespace;
  return brokerTlsOf(namespace.value);
}

function readConfiguredCa(path: string): Result<TransportTls> {
  try {
    return ok({ ca: readFileSync(path, 'utf8') });
  } catch {
    return err(failure('invalid', 'TASKELITH_NATS_CA must name a readable PEM file', { variable: 'TASKELITH_NATS_CA' }));
  }
}

// Read under the namespace's checks (installation contract section 3).
function brokerTlsOf(namespace: ControlPlaneNamespace): Result<TransportTls | undefined> {
  const ca = namespace.readText(INSTALLATION_CA_FILE);
  if (!ca.ok) return ca;
  if (ca.value !== undefined) return ok({ ca: ca.value });
  const installation = namespace.read(INSTALLATION_FILE);
  if (!installation.ok) return installation;
  if (installation.value === undefined) return ok(undefined);
  const path = join(namespace.directory, INSTALLATION_CA_FILE);
  return err(failure('precondition-failed', `${path} is missing; run issue-installation-certificates`, { path }));
}
