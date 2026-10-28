import { getCACertificates, setDefaultCACertificates } from 'node:tls';

// Adds a test authority to this process's default trust, which `fetch` and
// every TLS client without its own CA use, as NODE_EXTRA_CA_CERTS would.
export function trustCertificateAuthority(certificatePem: string): void {
  setDefaultCACertificates([...getCACertificates('default'), certificatePem]);
}
