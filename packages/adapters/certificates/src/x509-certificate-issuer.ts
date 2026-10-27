// tsyringe, which @peculiar/x509 loads, needs the Reflect metadata API first.
import 'reflect-metadata';
import { randomBytes, webcrypto } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import type {
  AuthorityRequest,
  CertificateIssuer,
  CertificateValidity,
  IssuedCertificate,
  ServerCertificateRequest,
  ServerHost,
} from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const SERIAL_BYTES = 16;

x509.cryptoProvider.set(webcrypto as Crypto);

// The certificate issuer on @peculiar/x509 and Node's WebCrypto: ECDSA P-256
// keys, SHA-256 signatures, and random 128-bit serial numbers.
export class X509CertificateIssuer implements CertificateIssuer {
  async createAuthority(request: AuthorityRequest): Promise<Result<IssuedCertificate>> {
    return issuing('the installation authority', async () => {
      const keys = await generateKeys();
      const certificate = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: serialNumber(), name: distinguishedName(request.commonName), ...dates(request.validity),
        keys, signingAlgorithm: ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(true, 0, true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
        ],
      });
      return { certificatePem: certificate.toString('pem'), privateKeyPem: await exportPrivateKey(keys.privateKey) };
    });
  }

  async issueServerCertificate(authority: IssuedCertificate, request: ServerCertificateRequest): Promise<Result<IssuedCertificate>> {
    const signer = await readAuthority(authority);
    if (!signer.ok) return signer;
    if (request.hosts.length === 0) return err(failure('invalid', 'a server certificate needs at least one host'));
    return issuing(`the ${request.commonName} certificate`, async () => {
      const keys = await generateKeys();
      const certificate = await x509.X509CertificateGenerator.create({
        serialNumber: serialNumber(), subject: distinguishedName(request.commonName), issuer: signer.value.certificate.subject,
        ...dates(request.validity), publicKey: keys.publicKey, signingKey: signer.value.key, signingAlgorithm: ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
          new x509.SubjectAlternativeNameExtension(request.hosts.map(generalName)),
          await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
          await x509.AuthorityKeyIdentifierExtension.create(signer.value.certificate),
        ],
      });
      return { certificatePem: certificate.toString('pem'), privateKeyPem: await exportPrivateKey(keys.privateKey) };
    });
  }
}

interface Signer {
  readonly certificate: x509.X509Certificate;
  readonly key: CryptoKey;
}

// The failure names the authority, never the key or the library's text,
// which could quote the input.
async function readAuthority(authority: IssuedCertificate): Promise<Result<Signer>> {
  try {
    const certificate = new x509.X509Certificate(authority.certificatePem);
    const der = x509.PemConverter.decodeFirst(authority.privateKeyPem);
    const key = await webcrypto.subtle.importKey('pkcs8', der, ALGORITHM, false, ['sign']);
    return ok({ certificate, key: key as CryptoKey });
  } catch {
    return err(failure('precondition-failed', 'the installation authority is not an ECDSA P-256 certificate and key'));
  }
}

async function issuing(subject: string, issue: () => Promise<IssuedCertificate>): Promise<Result<IssuedCertificate>> {
  try {
    return ok(await issue());
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'an unknown error';
    return err(failure('internal', `${subject} could not be issued (${reason})`));
  }
}

async function generateKeys(): Promise<CryptoKeyPair> {
  return (await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify'])) as CryptoKeyPair;
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return x509.PemConverter.encode(await webcrypto.subtle.exportKey('pkcs8', key), 'PRIVATE KEY');
}

// A positive serial number: the top bit of the first byte is cleared.
function serialNumber(): string {
  const bytes = randomBytes(SERIAL_BYTES);
  bytes[0] = bytes[0]! & 0x7f;
  return bytes.toString('hex');
}

function distinguishedName(commonName: string): string {
  return new x509.Name([{ CN: [commonName] }]).toString();
}

function dates(validity: CertificateValidity): { notBefore: Date; notAfter: Date } {
  return { notBefore: new Date(validity.notBefore), notAfter: new Date(validity.notAfter) };
}

function generalName(host: ServerHost): x509.JsonGeneralName {
  return { type: host.kind, value: host.name };
}
