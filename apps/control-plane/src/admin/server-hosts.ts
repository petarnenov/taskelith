import { isIP } from 'node:net';
import type { ServerHost } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { Environment } from '../service-endpoints.js';
import type { ServerHosts } from './installation-authority.js';

const LOCAL_HOSTS: readonly ServerHost[] = [{ kind: 'dns', name: 'localhost' }, { kind: 'ip', name: '127.0.0.1' }, { kind: 'ip', name: '::1' }];
// The names of both certificates when their variable is not set.
export const LOCAL_SERVER_HOSTS: ServerHosts = { api: LOCAL_HOSTS, nats: LOCAL_HOSTS };
export const MAX_SERVER_HOSTS = 32;
const DNS_LABEL = '(?!-)[a-z0-9-]{1,63}(?<!-)';
const DNS_NAME = new RegExp(`^(?=.{1,253}$)${DNS_LABEL}(?:\\.${DNS_LABEL})*$`);

// The alternative names of the API and NATS certificates (installation
// contract section 7); a failure names the variable.
export function readServerHosts(environment: Environment): Result<ServerHosts> {
  const api = parseServerHosts(environment, 'TASKELITH_API_HOSTS');
  if (!api.ok) return api;
  const nats = parseServerHosts(environment, 'TASKELITH_NATS_HOSTS');
  return nats.ok ? ok({ api: api.value, nats: nats.value }) : nats;
}

function parseServerHosts(environment: Environment, variable: string): Result<readonly ServerHost[]> {
  const text = environment[variable];
  if (text === undefined || text === '') return ok(LOCAL_HOSTS);
  const names = [...new Set(text.split(',').map((name) => name.trim().toLowerCase()))];
  const hosts = names.map(serverHost);
  if (names.length > MAX_SERVER_HOSTS || hosts.some((host) => host === undefined)) {
    const rule = `at most ${MAX_SERVER_HOSTS} comma-separated DNS names or IP addresses, without wildcards`;
    return err(failure('invalid', `${variable} must list ${rule}`, { variable }));
  }
  return ok(hosts as ServerHost[]);
}

function serverHost(name: string): ServerHost | undefined {
  if (isIP(name) !== 0) return { kind: 'ip', name };
  return DNS_NAME.test(name) ? { kind: 'dns', name } : undefined;
}
