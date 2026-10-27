import { X509Certificate } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { connect as connectTcp, type Socket } from 'node:net';
import { join } from 'node:path';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import { fileURLToPath } from 'node:url';

// The check of make verify-installation after a re-issue: the API and NATS
// present the certificates in the given directory, trusted by its CA.

export const PROBE_TIMEOUT_MILLISECONDS = 10_000;

export interface Endpoint {
  readonly host: string;
  readonly port: number;
}

// `127.0.0.1:55012`, as `docker compose port` prints it.
export function parseEndpoint(address: string): Endpoint {
  const separator = address.lastIndexOf(':');
  const port = Number(address.slice(separator + 1));
  if (separator <= 0 || !Number.isInteger(port)) throw new Error(`not a host and port: ${address}`);
  return { host: address.slice(0, separator).replace(/^\[|\]$/g, ''), port };
}

// The SHA-256 fingerprint of the leaf a TLS server presents, verified by
// `ca` for localhost; NATS first sends its INFO line in plain text.
export async function presentedFingerprint(endpoint: Endpoint, ca: string, natsInfoFirst: boolean): Promise<string> {
  const socket = connectTcp(endpoint.port, endpoint.host);
  try {
    if (natsInfoFirst) await firstLine(socket);
    const secure = await handshake(socket, ca);
    const fingerprint = secure.getPeerX509Certificate()?.fingerprint256;
    secure.destroy();
    if (fingerprint === undefined) throw new Error('the server presented no certificate');
    return fingerprint;
  } finally {
    socket.destroy();
  }
}

export function fileFingerprint(certificatePem: string): string {
  return new X509Certificate(certificatePem).fingerprint256;
}

function firstLine(socket: Socket): Promise<void> {
  return withTimeout(new Promise((resolve, reject) => {
    let text = '';
    const onData = (chunk: Buffer) => {
      text += chunk.toString('latin1');
      if (!text.includes('\n')) return;
      socket.off('data', onData);
      socket.pause();
      resolve();
    };
    socket.on('data', onData);
    socket.once('error', reject);
  }));
}

function handshake(socket: Socket, ca: string): Promise<TLSSocket> {
  return withTimeout(new Promise((resolve, reject) => {
    const secure = connectTls({ socket, ca, servername: 'localhost' }, () => resolve(secure));
    secure.once('error', reject);
  }));
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('the TLS probe timed out')), PROBE_TIMEOUT_MILLISECONDS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Whether a NATS server answers a plain client's PING with a PONG; one that
// requires TLS sends an error or closes the connection instead.
export function acceptsPlainClient(endpoint: Endpoint): Promise<boolean> {
  const socket = connectTcp(endpoint.port, endpoint.host);
  return withTimeout(new Promise<boolean>((resolve) => {
    let text = '';
    let connected = false;
    socket.on('data', (chunk: Buffer) => {
      text += chunk.toString('latin1');
      if (!connected && text.includes('\n')) {
        connected = true;
        socket.write('CONNECT {"verbose":false,"tls_required":false}\r\nPING\r\n');
      }
      if (text.includes('PONG')) resolve(true);
      if (text.includes('-ERR')) resolve(false);
    });
    socket.once('close', () => resolve(false));
    socket.once('error', () => resolve(false));
  })).finally(() => socket.destroy());
}

// Problems: a server presenting another certificate than its file, and a
// NATS server that accepts a plain client.
export async function reissueProblems(api: Endpoint, nats: Endpoint, directory: string): Promise<string[]> {
  const read = (name: string) => readFileSync(join(directory, name), 'utf8');
  const ca = read('installation-ca.pem');
  const checks = [['API', api, false, 'api-certificate.pem'], ['NATS', nats, true, 'nats-certificate.pem']] as const;
  const problems: string[] = [];
  for (const [name, endpoint, natsInfoFirst, file] of checks) {
    const presented = await presentedFingerprint(endpoint, ca, natsInfoFirst);
    if (presented !== fileFingerprint(read(file))) problems.push(`${name} presents another certificate than ${file}`);
  }
  if (await acceptsPlainClient(nats)) problems.push('NATS accepts a plain client');
  return problems;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [api, nats, directory] = process.argv.slice(2);
  // A server still restarting refuses or drops the probe; the caller retries.
  const problems = await reissueProblems(parseEndpoint(api ?? ''), parseEndpoint(nats ?? ''), directory ?? '')
    .catch((error: unknown) => [error instanceof Error ? error.message : String(error)]);
  for (const problem of problems) console.error(`installation-tls-probe: ${problem}`);
  process.exit(problems.length === 0 ? 0 : 1);
}
