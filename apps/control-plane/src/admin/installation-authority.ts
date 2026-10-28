import { createHash, X509Certificate } from 'node:crypto';
import { join } from 'node:path';
import type { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  authorityValidity,
  serverCertificateValidity,
  type CertificateIssuer,
  type IssuedCertificate,
  type ServerHost,
} from '@taskelith/fleet';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';

const AUTHORITY_FILE = 'installation-authority';
const AUTHORITY_NAME = 'Taskelith installation authority';
export const INSTALLATION_CA_FILE = 'installation-ca.pem';

// The server certificates of installation contract section 3.
export const SERVER_CERTIFICATES = {
  api: { commonName: 'Taskelith API', certificate: 'api-certificate.pem', key: 'api-key.pem' },
  nats: { commonName: 'Taskelith NATS', certificate: 'nats-certificate.pem', key: 'nats-key.pem' },
} as const;
export type ServerName = keyof typeof SERVER_CERTIFICATES;

export type ServerHosts = Readonly<Record<ServerName, readonly ServerHost[]>>;

export interface IssuedServerCertificates {
  readonly installationCa: string;
  readonly apiCertificate: string;
  readonly natsCertificate: string;
  readonly notAfter: Instant;
}

// The authority, made once before the installation exists; one lost
// afterwards fails closed, as a new one would not match the workers' trust.
export async function ensureInstallationAuthority(
  namespace: ControlPlaneNamespace,
  installed: boolean,
  issuer: CertificateIssuer,
  now: Instant,
): Promise<Result<IssuedCertificate>> {
  const stored = readInstallationAuthority(namespace);
  if (!stored.ok) return stored;
  if (stored.value !== undefined) return ok(stored.value);
  if (installed) return err(lostAuthority());
  const validity = authorityValidity(now);
  if (!validity.ok) return validity;
  const created = await issuer.createAuthority({ commonName: AUTHORITY_NAME, validity: validity.value });
  if (!created.ok) return created;
  const saved = namespace.create(AUTHORITY_FILE, { certificate: created.value.certificatePem, privateKey: created.value.privateKeyPem });
  return saved.ok ? created : saved;
}

// The stored authority of an initialized installation, which must exist.
export function storedInstallationAuthority(namespace: ControlPlaneNamespace): Result<IssuedCertificate> {
  const stored = readInstallationAuthority(namespace);
  if (!stored.ok) return stored;
  return stored.value === undefined ? err(lostAuthority()) : ok(stored.value);
}

// Issues all certificates before writing any file, so a refusal changes none;
// a crash between a server's key and certificate fails the next start.
export async function issueServerCertificates(
  namespace: ControlPlaneNamespace,
  authority: IssuedCertificate,
  issuer: CertificateIssuer,
  hosts: ServerHosts,
  now: Instant,
): Promise<Result<IssuedServerCertificates>> {
  const validity = serverCertificateValidity(now);
  if (!validity.ok) return validity;
  const issued: [ServerName, IssuedCertificate][] = [];
  for (const name of Object.keys(SERVER_CERTIFICATES) as ServerName[]) {
    const request = { commonName: SERVER_CERTIFICATES[name].commonName, hosts: hosts[name], validity: validity.value };
    const certificate = await issuer.issueServerCertificate(authority, request);
    if (!certificate.ok) return certificate;
    issued.push([name, certificate.value]);
  }
  const installationCa = namespace.writeText(INSTALLATION_CA_FILE, authority.certificatePem);
  if (!installationCa.ok) return installationCa;
  for (const [name, certificate] of issued) {
    const written = writeServerCertificate(namespace, name, certificate);
    if (!written.ok) return written;
  }
  return ok({
    installationCa: installationCa.value,
    apiCertificate: join(namespace.directory, SERVER_CERTIFICATES.api.certificate),
    natsCertificate: join(namespace.directory, SERVER_CERTIFICATES.nats.certificate),
    notAfter: validity.value.notAfter,
  });
}

function writeServerCertificate(namespace: ControlPlaneNamespace, name: ServerName, issued: IssuedCertificate): Result<string> {
  const files = SERVER_CERTIFICATES[name];
  const key = namespace.writeText(files.key, issued.privateKeyPem);
  return key.ok ? namespace.writeText(files.certificate, issued.certificatePem) : key;
}

// A server certificate with the paths of its files, for failures to name.
export interface StoredServerCertificate extends IssuedCertificate {
  readonly path: string;
  readonly keyPath: string;
}

// A server's certificate and key as the namespace holds them; a missing
// file names itself and the command that writes it.
export function readServerCertificate(namespace: ControlPlaneNamespace, name: ServerName): Result<StoredServerCertificate> {
  const files = SERVER_CERTIFICATES[name];
  const certificatePem = readRequired(namespace, files.certificate);
  if (!certificatePem.ok) return certificatePem;
  const privateKeyPem = readRequired(namespace, files.key);
  if (!privateKeyPem.ok) return privateKeyPem;
  const path = join(namespace.directory, files.certificate);
  const keyPath = join(namespace.directory, files.key);
  return ok({ certificatePem: certificatePem.value, privateKeyPem: privateKeyPem.value, path, keyPath });
}

// One PEM certificate block and nothing else, as `InstallationCa` admits.
const SINGLE_CERTIFICATE = /^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]{1,76}\r?\n)+-----END CERTIFICATE-----\r?\n?$/;

// The public authority certificate that workers check and pin; a failure
// names the file and never quotes it, since it may hold a key.
export function readInstallationCa(namespace: ControlPlaneNamespace): Result<string> {
  const text = readRequired(namespace, INSTALLATION_CA_FILE);
  if (!text.ok) return text;
  const path = join(namespace.directory, INSTALLATION_CA_FILE);
  return isCaCertificate(text.value)
    ? ok(text.value)
    : err(failure('precondition-failed', `${path} must hold exactly one CA certificate; run issue-installation-certificates`, { path }));
}

function isCaCertificate(text: string): boolean {
  if (!SINGLE_CERTIFICATE.test(text)) return false;
  try {
    return new X509Certificate(text).ca;
  } catch {
    return false;
  }
}

// The enrollment bundle's fingerprint: SHA-256 of the DER, lowercase hex.
export function installationCaFingerprint(certificatePem: string): string {
  return createHash('sha256').update(new X509Certificate(certificatePem).raw).digest('hex');
}

function readRequired(namespace: ControlPlaneNamespace, name: string): Result<string> {
  const text = namespace.readText(name);
  if (!text.ok) return text;
  if (text.value !== undefined) return ok(text.value);
  const path = join(namespace.directory, name);
  return err(failure('precondition-failed', `${path} is missing; run issue-installation-certificates`, { path }));
}

function readInstallationAuthority(namespace: ControlPlaneNamespace): Result<IssuedCertificate | undefined> {
  const stored = namespace.read(AUTHORITY_FILE);
  if (!stored.ok) return stored;
  if (stored.value === undefined) return ok(undefined);
  const { certificate, privateKey } = stored.value;
  if (typeof certificate !== 'string' || typeof privateKey !== 'string') {
    return err(failure('precondition-failed', 'the installation authority record has invalid fields'));
  }
  return ok({ certificatePem: certificate, privateKeyPem: privateKey });
}

function lostAuthority() {
  return failure('precondition-failed', 'the installation has lost its certificate authority; it stays closed');
}
