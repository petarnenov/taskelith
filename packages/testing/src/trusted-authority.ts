import { createHash, X509Certificate } from 'node:crypto';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

// Adds a test authority to this process's default trust, which `fetch` and
// every TLS client without its own CA use, as NODE_EXTRA_CA_CERTS would.
export function trustCertificateAuthority(certificatePem: string): void {
  setDefaultCACertificates([...getCACertificates('default'), certificatePem]);
}

// A certificate's enrollment fingerprint: SHA-256 of its DER, in hex.
export function certificateSha256(certificatePem: string): string {
  return createHash('sha256').update(new X509Certificate(certificatePem).raw).digest('hex');
}
