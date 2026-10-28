import { join } from 'node:path';
import { OperatorCredentialService, type AdministrativeInvocation } from '@taskelith/access';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';
import { ControlPlaneNamespace, FileInstallationRecord } from '@taskelith/control-plane-store';
import type { WorkerId } from '@taskelith/execution';
import {
  EnrollmentService,
  InstallationService,
  parseWorkerId,
  type HostConstraints,
  type InitializedInstallation,
  type InstallationIdentity,
  type IssuedCertificate,
  type RotatedCredentials,
  type WorkerCommandConsumers,
  type WorkerRevocation,
} from '@taskelith/fleet';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  connectSystemAccount,
  connectTransport,
  NatsBrokerCredentials,
  NatsCommandConsumers,
  TransportAddress,
  type BrokerAuthority,
  type TransportTls,
} from '@taskelith/nats';
import type { Logger, Metrics } from '@taskelith/observability';
import {
  CommittingInstallationTable,
  CommittingOperatorCredentials,
  migrate,
  PostgresDatabase,
} from '@taskelith/postgres';
import { NodeSecrets, RandomIdentifiers } from '@taskelith/secrets';
import { LaunchRevokingFleetRegistry } from '../composition/launch-revoking-fleet-registry.js';
import { ensureBrokerTrust, readBrokerAuthority } from './broker-trust.js';
import {
  ensureInstallationAuthority,
  installationCaFingerprint,
  issueServerCertificates,
  readInstallationCa,
  readServerCertificate,
  storedInstallationAuthority,
  INSTALLATION_CA_FILE,
  type IssuedServerCertificates,
  type ServerHosts,
  type ServerName,
  type StoredServerCertificate,
} from './installation-authority.js';
import { LOCAL_SERVER_HOSTS } from './server-hosts.js';

// What the operator hands a new worker (installation contract section 5).
export interface EnrollmentBundle {
  readonly enrollmentToken: string;
  readonly installationCaSha256: string;
}

export interface AdministrationSettings {
  readonly dataRoot: string;
  readonly ownerUid: number;
  readonly postgres: URL;
  readonly nats: URL;
  readonly natsTls?: TransportTls;
  // The certificates' alternative names; the localhost names without them.
  readonly serverHosts?: ServerHosts;
  readonly now?: () => Instant;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
}

export interface Initialization extends InitializedInstallation {
  readonly brokerServerConfig: string;
  readonly installationCa: string;
}

// Commands run on the control-plane host: host access authorizes the init and
// the operator reset (trust model 2); the others need the operator secret.
export class Administration {
  readonly #settings: AdministrationSettings;
  readonly #namespace: ControlPlaneNamespace;
  readonly #database: PostgresDatabase;
  readonly #secrets = new NodeSecrets();
  readonly #issuer = new X509CertificateIssuer();
  readonly #operator: OperatorCredentialService;

  private constructor(settings: AdministrationSettings, namespace: ControlPlaneNamespace) {
    this.#settings = settings;
    this.#namespace = namespace;
    this.#database = new PostgresDatabase(settings.postgres, {
      ...(settings.logger === undefined ? {} : { logger: settings.logger }),
      ...(settings.metrics === undefined ? {} : { metrics: settings.metrics }),
    });
    this.#operator = new OperatorCredentialService({
      credentials: new CommittingOperatorCredentials(this.#database), secrets: this.#secrets, clock: this.#clock,
    });
  }

  static open(settings: AdministrationSettings): Result<Administration> {
    const namespace = ControlPlaneNamespace.open({ dataRoot: settings.dataRoot, ownerUid: settings.ownerUid });
    return namespace.ok ? ok(new Administration(settings, namespace.value)) : namespace;
  }

  close(): Promise<void> {
    return this.#database.close();
  }

  // Explicit initialization; it never runs implicitly at any start.
  async initialize(invocation: AdministrativeInvocation): Promise<Result<Initialization>> {
    const migrated = await migrate(this.#settings.postgres);
    if (!migrated.ok) return migrated;
    const record = await new FileInstallationRecord(this.#namespace).read();
    if (!record.ok) return record;
    const installed = record.value !== undefined;
    const trust = ensureBrokerTrust(this.#namespace, installed, this.#epochSeconds());
    if (!trust.ok) return trust;
    const authority = await ensureInstallationAuthority(this.#namespace, installed, this.#issuer, this.#clock.now());
    if (!authority.ok) return authority;
    // A rerun after success keeps the certificates and fails with conflict.
    const certificates = installed ? undefined : await this.#issue(authority.value);
    if (certificates !== undefined && !certificates.ok) return certificates;
    const initialized = await this.#installation().initialize(invocation);
    if (!initialized.ok) return initialized;
    const installationCa = join(this.#namespace.directory, INSTALLATION_CA_FILE);
    return ok({ ...initialized.value, brokerServerConfig: trust.value.serverConfigPath, installationCa });
  }

  // New server certificates from the stored authority (`make
  // installation-certificates`); the installation must exist.
  async issueInstallationCertificates(): Promise<Result<IssuedServerCertificates>> {
    const record = await new FileInstallationRecord(this.#namespace).read();
    if (!record.ok) return record;
    if (record.value === undefined) return err(failure('precondition-failed', 'the installation is not initialized; run init first'));
    const authority = storedInstallationAuthority(this.#namespace);
    return authority.ok ? this.#issue(authority.value) : authority;
  }

  // A server's certificate and key, for the control plane's listeners.
  serverCertificate(name: ServerName): Result<StoredServerCertificate> {
    return readServerCertificate(this.#namespace, name);
  }

  resetOperatorCredential(invocation: AdministrativeInvocation): Promise<Result<string>> {
    return this.#operator.reset(invocation);
  }

  // The public authority certificate, for `readInstallationCa`.
  installationCa(): Result<string> {
    return readInstallationCa(this.#namespace);
  }

  // The CA is read first, so a bundle without its fingerprint is never
  // issued and no token is spent on it.
  async issueEnrollmentToken(operatorSecret: string, constraints: HostConstraints): Promise<Result<EnrollmentBundle>> {
    return this.#asOperator(operatorSecret, async (enrollment) => {
      const installationCa = this.installationCa();
      if (!installationCa.ok) return installationCa;
      const token = await enrollment.issueToken(constraints);
      if (!token.ok) return token;
      return ok({ enrollmentToken: token.value, installationCaSha256: installationCaFingerprint(installationCa.value) });
    });
  }

  rotateWorker(operatorSecret: string, workerId: string): Promise<Result<RotatedCredentials>> {
    return this.#asOperator(operatorSecret, (enrollment) => withWorkerId(workerId, (id) => enrollment.rotate(id)));
  }

  revokeWorker(operatorSecret: string, workerId: string): Promise<Result<WorkerRevocation>> {
    return this.#asOperator(operatorSecret, (enrollment) => withWorkerId(workerId, (id) => enrollment.revoke(id)));
  }

  expireGraceWindows(operatorSecret: string): Promise<Result<number>> {
    return this.#asOperator(operatorSecret, (enrollment) => enrollment.expireGraceWindows());
  }

  // The service's database, operator credential, and verified installation,
  // which the control-plane composition root shares with these commands.
  get database(): PostgresDatabase {
    return this.#database;
  }

  get operator(): OperatorCredentialService {
    return this.#operator;
  }

  verifiedInstallation(): Promise<Result<InstallationIdentity>> {
    return this.#installation().verifyAtStart();
  }

  brokerAuthority(): Result<BrokerAuthority> {
    const authority = readBrokerAuthority(this.#namespace);
    if (!authority.ok) return authority;
    return authority.value === undefined ? err(failure('precondition-failed', 'the installation has no broker authority')) : ok(authority.value);
  }

  // The enrollment service as the HTTP layer (item 16) uses it, with a
  // system connection for revocations that the caller closes.
  async enrollmentService(
    commandConsumers: WorkerCommandConsumers,
  ): Promise<Result<{ service: EnrollmentService; close(): Promise<void> }>> {
    const identity = await this.verifiedInstallation();
    if (!identity.ok) return identity;
    const authority = this.brokerAuthority();
    if (!authority.ok) return authority;
    const system = await connectSystemAccount({
      server: this.#settings.nats, creds: authority.value.systemUser(this.#epochSeconds()).creds,
      ...(this.#settings.natsTls === undefined ? {} : { tls: this.#settings.natsTls }),
    });
    if (!system.ok) return system;
    const service = new EnrollmentService({
      installation: identity.value,
      serverProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      registry: new LaunchRevokingFleetRegistry(this.#database),
      secrets: this.#secrets,
      ids: new RandomIdentifiers(),
      broker: new NatsBrokerCredentials(authority.value, system.value.connection),
      commandConsumers,
      clock: this.#clock,
    });
    return ok({ service, close: () => system.value.close() });
  }

  async #asOperator<T>(operatorSecret: string, command: (enrollment: EnrollmentService) => Promise<Result<T>>): Promise<Result<T>> {
    const authenticated = await this.#operator.authenticate(operatorSecret);
    if (!authenticated.ok) return authenticated;
    const enrollment = await this.enrollmentService(this.#administrativeConsumers());
    if (!enrollment.ok) return enrollment;
    try {
      return await command(enrollment.value.service);
    } finally {
      await enrollment.value.close();
    }
  }

  // The tool never enrolls; a revocation connects as the control plane to
  // remove the worker's command consumer, after the revocation committed.
  #administrativeConsumers(): WorkerCommandConsumers {
    return {
      ensure: async () => err(failure('unavailable', 'the administration tool does not enroll workers')),
      remove: (workerId) => this.#withCommandConsumers((consumers) => consumers.remove(workerId)),
    };
  }

  async #withCommandConsumers(command: (consumers: WorkerCommandConsumers) => Promise<Result<void>>): Promise<Result<void>> {
    const identity = await this.verifiedInstallation();
    if (!identity.ok) return identity;
    const address = TransportAddress.of(identity.value.installationId);
    if (!address.ok) return address;
    const authority = this.brokerAuthority();
    if (!authority.ok) return authority;
    const transport = await connectTransport({
      server: this.#settings.nats, address: address.value, creds: authority.value.user('control-plane', this.#epochSeconds()).creds,
      ...(this.#settings.natsTls === undefined ? {} : { tls: this.#settings.natsTls }),
    });
    if (!transport.ok) return transport;
    try {
      return await command(new NatsCommandConsumers(transport.value.jsm, address.value));
    } finally {
      await transport.value.close();
    }
  }

  #issue(authority: IssuedCertificate): Promise<Result<IssuedServerCertificates>> {
    const hosts = this.#settings.serverHosts ?? LOCAL_SERVER_HOSTS;
    return issueServerCertificates(this.#namespace, authority, this.#issuer, hosts, this.#clock.now());
  }

  #installation(): InstallationService {
    return new InstallationService({
      record: new FileInstallationRecord(this.#namespace),
      table: new CommittingInstallationTable(this.#database),
      ids: new RandomIdentifiers(),
      operator: this.#operator,
    });
  }

  get #clock(): { now(): Instant } {
    return { now: () => this.#settings.now?.() ?? systemNow() };
  }

  #epochSeconds(): number {
    return Math.floor(Date.parse(this.#clock.now()) / 1000);
  }
}

function withWorkerId<T>(text: string, command: (workerId: WorkerId) => Promise<Result<T>>): Promise<Result<T>> {
  const workerId = parseWorkerId(text);
  return workerId.ok ? command(workerId.value) : Promise.resolve(workerId);
}

function systemNow(): Instant {
  const now = instantFromEpochMilliseconds(Date.now());
  if (!now.ok) throw new RangeError(now.error.message);
  return now.value;
}
