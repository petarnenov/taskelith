import type { Result } from '@taskelith/kernel';
import type { CertificateValidity } from '../domain/installation-certificates.js';

// A certificate and its PKCS#8 private key, both in PEM.
export interface IssuedCertificate {
  readonly certificatePem: string;
  readonly privateKeyPem: string;
}

// A DNS name or an IP address of a server certificate's alternative names.
export interface ServerHost {
  readonly kind: 'dns' | 'ip';
  readonly name: string;
}

export interface AuthorityRequest {
  readonly commonName: string;
  readonly validity: CertificateValidity;
}

export interface ServerCertificateRequest {
  readonly commonName: string;
  readonly hosts: readonly ServerHost[];
  readonly validity: CertificateValidity;
}

// Issues the installation authority and the server certificates it signs
// (installation contract section 7); keys never leave the result.
export interface CertificateIssuer {
  createAuthority(request: AuthorityRequest): Promise<Result<IssuedCertificate>>;
  issueServerCertificate(authority: IssuedCertificate, request: ServerCertificateRequest): Promise<Result<IssuedCertificate>>;
}
