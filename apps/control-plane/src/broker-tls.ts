import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTROL_PLANE_DIRECTORY } from '@taskelith/control-plane-store';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { TransportTls } from '@taskelith/nats';
import { INSTALLATION_CA_FILE } from './admin/installation-authority.js';
import type { Environment } from './service-endpoints.js';

// The broker's CA: TASKELITH_NATS_CA, else the installation CA once `init`
// wrote it, so an installation with an authority never connects plain.
export function readBrokerTls(environment: Environment, dataRoot: string): Result<TransportTls | undefined> {
  const configured = environment.TASKELITH_NATS_CA;
  if (configured !== undefined && configured !== '') {
    return readCa(configured, failure('invalid', 'TASKELITH_NATS_CA must name a readable PEM file', { variable: 'TASKELITH_NATS_CA' }));
  }
  const path = join(dataRoot, CONTROL_PLANE_DIRECTORY, INSTALLATION_CA_FILE);
  if (!existsSync(path)) return ok(undefined);
  return readCa(path, failure('precondition-failed', `${path} is not readable`, { path }));
}

function readCa(path: string, unreadable: Failure): Result<TransportTls> {
  try {
    return ok({ ca: readFileSync(path, 'utf8') });
  } catch {
    return err(unreadable);
  }
}
