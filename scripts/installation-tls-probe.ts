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

// The refusal that nats-server sends when a client must use TLS; 2.15.1
// itself only advertises tls_required and closes on the failed handshake.
const TLS_REQUIRED_ERROR = "-ERR 'Secure Connection - TLS Required'";

// Whether NATS refuses a plain client because it requires TLS; a login
// refusal, any other reply, a timeout, or a failed connection is not that.
export async function refusesPlainClient(endpoint: Endpoint): Promise<boolean> {
  const reply = await plainClientReply(endpoint).catch(() => undefined);
  return reply !== undefined && isTlsRefusal(reply);
}

function isTlsRefusal(reply: string): boolean {
  const [info = '', ...rest] = reply.split('\r\n');
  const after = rest.join('\r\n').trim();
  return advertisesTlsRequired(info) && (after === '' || after === TLS_REQUIRED_ERROR);
}

function advertisesTlsRequired(infoLine: string): boolean {
  if (!infoLine.startsWith('INFO ')) return false;
  try {
    return (JSON.parse(infoLine.slice('INFO '.length)) as { tls_required?: unknown }).tls_required === true;
  } catch {
    return false;
  }
}

// What the server sends to a plain CONNECT and PING without credentials,
// up to its close or its PONG.
function plainClientReply(endpoint: Endpoint): Promise<string> {
  const socket = connectTcp(endpoint.port, endpoint.host);
  return withTimeout(new Promise<string>((resolve, reject) => {
    let text = '';
    socket.on('data', (chunk: Buffer) => {
      const first = !text.includes('\n');
      text += chunk.toString('latin1');
      if (first && text.includes('\n')) socket.write('CONNECT {"verbose":false,"tls_required":false}\r\nPING\r\n');
      if (text.includes('PONG')) resolve(text);
    });
    socket.once('close', () => resolve(text));
    socket.once('error', reject);
  })).finally(() => socket.destroy());
}

// Problems: a server presenting another certificate than its file, and a
// NATS server that does not refuse a plain client as requiring TLS.
export async function reissueProblems(api: Endpoint, nats: Endpoint, directory: string): Promise<string[]> {
  const read = (name: string) => readFileSync(join(directory, name), 'utf8');
  const ca = read('installation-ca.pem');
  const checks = [['API', api, false, 'api-certificate.pem'], ['NATS', nats, true, 'nats-certificate.pem']] as const;
  const problems: string[] = [];
  for (const [name, endpoint, natsInfoFirst, file] of checks) {
    const presented = await presentedFingerprint(endpoint, ca, natsInfoFirst);
    if (presented !== fileFingerprint(read(file))) problems.push(`${name} presents another certificate than ${file}`);
  }
  if (!(await refusesPlainClient(nats))) problems.push('NATS does not refuse a plain client as requiring TLS');
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
