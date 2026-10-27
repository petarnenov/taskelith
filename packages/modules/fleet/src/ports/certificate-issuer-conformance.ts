import { instantFromEpochMilliseconds, parseInstant, type Result } from '@taskelith/kernel';
import { expectCode, expectSame, type ConformanceCase } from '@taskelith/sdlc';
import { authorityValidity, serverCertificateValidity } from '../domain/installation-certificates.js';
import type { CertificateIssuer, IssuedCertificate, ServerHost } from './certificate-issuer.js';

// The shared suite of the CertificateIssuer port (installation contract
// section 7); each case gets a fresh issuer and makes its own keys.

// What the suite reads of a PEM certificate, through a parser of the test's
// own rather than the adapter's; times are ISO 8601 instants.
export interface CertificateInspector {
  inspect(certificatePem: string): {
    readonly ca: boolean;
    readonly subject: string;
    readonly serialNumber: string;
    readonly notBefore: string;
    readonly notAfter: string;
    readonly extendedKeyUsage: readonly string[];
  };
  covers(certificatePem: string, host: ServerHost): boolean;
  matchesKey(certificatePem: string, privateKeyPem: string): boolean;
  isSignedBy(certificatePem: string, issuerPem: string): boolean;
}

export interface CertificateIssuerConformanceTarget {
  readonly issuer: CertificateIssuer;
  readonly inspector: CertificateInspector;
}

const NOW = must(parseInstant('2026-10-28T12:00:00.000Z'));
const HOSTS: readonly ServerHost[] = [{ kind: 'dns', name: 'control-plane' }, { kind: 'ip', name: '127.0.0.1' }, { kind: 'ip', name: '::1' }];
const SERVER_AUTHENTICATION = '1.3.6.1.5.5.7.3.1';
const DAY_MILLISECONDS = 86_400_000;

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

async function authorityOf(issuer: CertificateIssuer, commonName = 'Conformance authority'): Promise<IssuedCertificate> {
  return must(await issuer.createAuthority({ commonName, validity: must(authorityValidity(NOW)) }));
}

async function serverOf(issuer: CertificateIssuer, authority: IssuedCertificate): Promise<Result<IssuedCertificate>> {
  const request = { commonName: 'Conformance server', hosts: HOSTS, validity: must(serverCertificateValidity(NOW)) };
  return issuer.issueServerCertificate(authority, request);
}

// A refusal must not quote its input; `marker` is text of that input.
function expectRefusal(problems: string[], label: string, result: Result<unknown>, marker: string): void {
  expectCode(problems, label, result, 'precondition-failed');
  if (!result.ok && result.error.message.includes(marker)) problems.push(`${label}: the failure quotes its input`);
}

export const CERTIFICATE_ISSUER_CONFORMANCE: readonly ConformanceCase<CertificateIssuerConformanceTarget>[] = Object.freeze([
  {
    name: 'the authority is a self-signed CA with its key, for the requested period',
    async check({ issuer, inspector }) {
      const problems: string[] = [];
      const authority = await authorityOf(issuer);
      const read = inspector.inspect(authority.certificatePem);
      const { notBefore, notAfter } = must(authorityValidity(NOW));
      expectSame(problems, 'ca and subject', [read.ca, read.subject], [true, 'CN=Conformance authority']);
      expectSame(problems, 'self-signed', inspector.isSignedBy(authority.certificatePem, authority.certificatePem), true);
      expectSame(problems, 'key', inspector.matchesKey(authority.certificatePem, authority.privateKeyPem), true);
      expectSame(problems, 'period', [read.notBefore, read.notAfter], [notBefore, notAfter]);
      return problems;
    },
  },
  {
    name: 'a server certificate is signed by the authority for its hosts and server use only',
    async check({ issuer, inspector }) {
      const problems: string[] = [];
      const authority = await authorityOf(issuer);
      const server = must(await serverOf(issuer, authority));
      const read = inspector.inspect(server.certificatePem);
      const { notBefore, notAfter } = must(serverCertificateValidity(NOW));
      expectSame(problems, 'ca', read.ca, false);
      expectSame(problems, 'signed', inspector.isSignedBy(server.certificatePem, authority.certificatePem), true);
      expectSame(problems, 'key', inspector.matchesKey(server.certificatePem, server.privateKeyPem), true);
      expectSame(problems, 'hosts', HOSTS.map((host) => inspector.covers(server.certificatePem, host)), HOSTS.map(() => true));
      expectSame(problems, 'other host', inspector.covers(server.certificatePem, { kind: 'dns', name: 'other.example' }), false);
      expectSame(problems, 'usage', read.extendedKeyUsage, [SERVER_AUTHENTICATION]);
      expectSame(problems, 'period', [read.notBefore, read.notAfter], [notBefore, notAfter]);
      expectSame(problems, 'own serial', read.serialNumber === inspector.inspect(authority.certificatePem).serialNumber, false);
      return problems;
    },
  },
  {
    name: 'a server certificate needs a host',
    async check({ issuer }) {
      const problems: string[] = [];
      const request = { commonName: 'Conformance server', hosts: [], validity: must(serverCertificateValidity(NOW)) };
      expectCode(problems, 'no host', await issuer.issueServerCertificate(await authorityOf(issuer), request), 'invalid');
      return problems;
    },
  },
  {
    name: 'an unreadable authority key is refused without quoting it',
    async check({ issuer }) {
      const problems: string[] = [];
      const authority = await authorityOf(issuer);
      expectRefusal(problems, 'unreadable', await serverOf(issuer, { ...authority, privateKeyPem: 'not a key' }), 'not a key');
      return problems;
    },
  },
  {
    name: 'an authority with another authority\'s key, or that is no CA, is refused',
    async check({ issuer }) {
      const problems: string[] = [];
      const authority = await authorityOf(issuer);
      const other = await authorityOf(issuer, 'Other authority');
      const mixed = { certificatePem: authority.certificatePem, privateKeyPem: other.privateKeyPem };
      expectRefusal(problems, 'another key', await serverOf(issuer, mixed), 'BEGIN');
      const leaf = must(await serverOf(issuer, authority));
      expectRefusal(problems, 'no CA', await serverOf(issuer, leaf), 'BEGIN');
      return problems;
    },
  },
  {
    name: 'an expired authority, or one that ends before the server certificate, is refused',
    async check({ issuer }) {
      const problems: string[] = [];
      const days = (count: number) => must(instantFromEpochMilliseconds(Date.parse(NOW) + count * DAY_MILLISECONDS));
      const ending = must(await issuer.createAuthority({ commonName: 'Ending authority', validity: { notBefore: NOW, notAfter: days(30) } }));
      expectRefusal(problems, 'ends first', await serverOf(issuer, ending), 'BEGIN');
      const expired = must(await issuer.createAuthority({ commonName: 'Expired authority', validity: { notBefore: days(-800), notAfter: days(-400) } }));
      expectRefusal(problems, 'expired', await serverOf(issuer, expired), 'BEGIN');
      return problems;
    },
  },
]);
