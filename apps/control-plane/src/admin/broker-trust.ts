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

// The installation's broker authority, kept in the control-plane namespace:
// made once at initialization and read back by every later command.
export function ensureBrokerTrust(namespace: ControlPlaneNamespace, now: ClaimTime): Result<BrokerTrust> {
  const stored = readBrokerAuthority(namespace);
  if (!stored.ok) return stored;
  const authority = stored.value ?? BrokerAuthority.generate();
  if (stored.value === undefined) {
    const created = namespace.create(AUTHORITY_FILE, { ...authority.keys });
    if (!created.ok) return created;
  }
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
