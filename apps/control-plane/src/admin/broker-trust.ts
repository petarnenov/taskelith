import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { BrokerAuthority, type ClaimTime } from '@taskelith/nats';

const AUTHORITY_FILE = 'broker-authority';
export const SERVER_CONFIG_FILE = 'nats-authority.conf';

export interface BrokerTrust {
  readonly authority: BrokerAuthority;
  // The fragment the operator includes in the nats-server configuration.
  readonly serverConfigPath: string;
}

// The broker authority, made once before the installation exists; one lost
// afterwards fails closed, as a new one would not match the running broker.
export function ensureBrokerTrust(namespace: ControlPlaneNamespace, installed: boolean, now: ClaimTime): Result<BrokerTrust> {
  const stored = readBrokerAuthority(namespace);
  if (!stored.ok) return stored;
  if (stored.value === undefined && installed) {
    return err(failure('precondition-failed', 'the installation has lost its broker authority; it stays closed'));
  }
  const authority = stored.value ?? BrokerAuthority.generate();
  if (stored.value === undefined) {
    const created = namespace.create(AUTHORITY_FILE, { ...authority.keys });
    if (!created.ok) return created;
  }
  const path = join(namespace.directory, SERVER_CONFIG_FILE);
  if (installed && existsSync(path)) return ok({ authority, serverConfigPath: path });
  const written = namespace.writeText(SERVER_CONFIG_FILE, authority.serverConfig(now));
  return written.ok ? ok({ authority, serverConfigPath: written.value }) : written;
}

export function readBrokerAuthority(namespace: ControlPlaneNamespace): Result<BrokerAuthority | undefined> {
  const stored = namespace.read(AUTHORITY_FILE);
  if (!stored.ok) return stored;
  if (stored.value === undefined) return ok(undefined);
  const { operatorSeed, systemAccountSeed, accountSeed } = stored.value;
  if (typeof operatorSeed !== 'string' || typeof systemAccountSeed !== 'string' || typeof accountSeed !== 'string') {
    return err(failure('precondition-failed', 'the broker authority record has invalid fields'));
  }
  return BrokerAuthority.fromKeys({ operatorSeed, systemAccountSeed, accountSeed });
}
