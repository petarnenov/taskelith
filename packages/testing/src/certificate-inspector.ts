import { createPrivateKey, X509Certificate } from 'node:crypto';

// What the CertificateIssuer conformance suite reads of a PEM certificate,
// through Node's own X.509 parser rather than the adapter's library.
export const NODE_CERTIFICATE_INSPECTOR = Object.freeze({
  inspect(certificatePem: string) {
    const certificate = new X509Certificate(certificatePem);
    return {
      ca: certificate.ca,
      subject: certificate.subject,
      serialNumber: certificate.serialNumber,
      notBefore: new Date(certificate.validFrom).toISOString(),
      notAfter: new Date(certificate.validTo).toISOString(),
      extendedKeyUsage: certificate.keyUsage ?? [],
    };
  },
  covers(certificatePem: string, host: { readonly kind: 'dns' | 'ip'; readonly name: string }): boolean {
    const certificate = new X509Certificate(certificatePem);
    return (host.kind === 'dns' ? certificate.checkHost(host.name) : certificate.checkIP(host.name)) !== undefined;
  },
  matchesKey(certificatePem: string, privateKeyPem: string): boolean {
    return new X509Certificate(certificatePem).checkPrivateKey(createPrivateKey(privateKeyPem));
  },
  isSignedBy(certificatePem: string, issuerPem: string): boolean {
    const certificate = new X509Certificate(certificatePem);
    const issuer = new X509Certificate(issuerPem);
    return certificate.checkIssued(issuer) && certificate.verify(issuer.publicKey);
  },
});
