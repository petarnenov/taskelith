import { join } from 'node:path';
import {
  OperatorAuthentication,
  OperatorCredentialService,
  OwnerBootstrapService,
  PrincipalAdministration,
  type AccessStore,
  type AdministrativeInvocation,
  type PasswordHasher,
  type PrincipalId,
  type PrincipalSummary,
  type ProjectRoleChange,
} from '@taskelith/access';
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
  type WorkerAdmissionSnapshot,
  type WorkerCommandConsumers,
  type WorkerRevocation,
} from '@taskelith/fleet';
import { err, failure, instantFromEpochMilliseconds, ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
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
  CommittingWorkerAdmissions,
  migrate,
  PostgresAccessStore,
  PostgresDatabase,
} from '@taskelith/postgres';
import { Argon2idPasswordHasher, NodeSecrets, RandomIdentifiers } from '@taskelith/secrets';
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
  readonly ownerPrincipalId: PrincipalId;
}

// The Access adapters the control plane shares with these commands.
export interface AccessAdapters {
  readonly store: AccessStore;
  readonly hasher: PasswordHasher;
  readonly secrets: NodeSecrets;
}

// Who creates the owner at a start that finds none (design decision 7).
export const START_OWNER_INVOCATION: AdministrativeInvocation = Object.freeze({
  actor: 'control-plane', reason: 'bootstrap owner from the G2 operator credential',
});

// Commands run on the control-plane host: host access authorizes the init and
// the operator reset (trust model 2); the others need the operator secret.
export class Administration {
  readonly #settings: AdministrationSettings;
  readonly #namespace: ControlPlaneNamespace;
  readonly #database: PostgresDatabase;
  readonly #secrets = new NodeSecrets();
  readonly #issuer = new X509CertificateIssuer();
  readonly #operator: OperatorCredentialService;
  readonly #access: AccessStore;
  readonly #hasher: PasswordHasher;

  private constructor(settings: AdministrationSettings, namespace: ControlPlaneNamespace, hasher: PasswordHasher) {
    this.#settings = settings;
    this.#namespace = namespace;
    this.#hasher = hasher;
    this.#database = new PostgresDatabase(settings.postgres, {
      ...(settings.logger === undefined ? {} : { logger: settings.logger }),
      ...(settings.metrics === undefined ? {} : { metrics: settings.metrics }),
    });
    this.#operator = new OperatorCredentialService({
      credentials: new CommittingOperatorCredentials(this.#database), secrets: this.#secrets, clock: this.#clock,
    });
    this.#access = new PostgresAccessStore(this.#database);
  }

  // Fails closed without crypto.argon2, before anything else is opened.
  static open(settings: AdministrationSettings): Result<Administration> {
    const hasher = Argon2idPasswordHasher.create();
    if (!hasher.ok) return hasher;
    const namespace = ControlPlaneNamespace.open({ dataRoot: settings.dataRoot, ownerUid: settings.ownerUid });
    return namespace.ok ? ok(new Administration(settings, namespace.value, hasher.value)) : namespace;
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
    if (!initialized.ok) return this.#refusedInitialization(initialized.error, invocation);
    const owner = await this.#ownerBootstrap().ensureOwner(invocation);
    if (!owner.ok) return owner;
    const installationCa = join(this.#namespace.directory, INSTALLATION_CA_FILE);
    return ok({ ...initialized.value, brokerServerConfig: trust.value.serverConfigPath, installationCa, ownerPrincipalId: owner.value.principalId });
  }

  // A rerun of `init` is refused, and the owner bootstrap audits the refusal.
  async #refusedInitialization(refused: Failure, invocation: AdministrativeInvocation): Promise<Result<never>> {
    if (refused.code !== 'conflict') return err(refused);
    const audited = await this.#ownerBootstrap().recordRefusedBootstrap(invocation);
    return audited.ok ? err(refused) : audited;
  }

  // The owner of an installation from before item 10, created once at the
  // start that first finds a credential but no owner.
  async ensureOwner(invocation: AdministrativeInvocation): Promise<Result<PrincipalId | undefined>> {
    const credential = await new CommittingOperatorCredentials(this.#database).current();
    if (!credential.ok) return credential;
    if (credential.value === undefined) return ok(undefined);
    const owner = await this.#ownerBootstrap().ensureOwner(invocation);
    return owner.ok ? ok(owner.value.principalId) : owner;
  }

  // The bearer authenticates the owner principal (wire contracts 2).
  get operatorPrincipal(): OperatorAuthentication {
    return new OperatorAuthentication(this.#operator, this.#access);
  }

  get access(): AccessAdapters {
    return { store: this.#access, hasher: this.#hasher, secrets: this.#secrets };
  }

  createPrincipal(operatorSecret: string, loginName: string, invocation: AdministrativeInvocation): Promise<Result<PrincipalSummary>> {
    return this.#asOwner(operatorSecret, (owner) => this.#principals().createPrincipal(owner, loginName, invocation));
  }

  // The password comes from standard input, never from an argument.
  setPassword(operatorSecret: string, loginName: string, password: string, invocation: AdministrativeInvocation) {
    return this.#asOwner(operatorSecret, (owner) => this.#principals().setPassword(owner, loginName, password, invocation));
  }

  assignProjectRole(
    operatorSecret: string,
    target: { readonly projectId: string; readonly loginName: string; readonly role: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleChange>> {
    return this.#asOwner(operatorSecret, (owner) => this.#principals().assignProjectRole(owner, target, invocation));
  }

  removeProjectRole(
    operatorSecret: string,
    target: { readonly projectId: string; readonly loginName: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleChange>> {
    return this.#asOwner(operatorSecret, (owner) => this.#principals().removeProjectRole(owner, target, invocation));
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

  // The workers view; the operator credential stands for
  // installation-owner, as for the other operator commands.
  async workerAdmission(operatorSecret: string): Promise<Result<WorkerAdmissionSnapshot>> {
    const authenticated = await this.#operator.authenticate(operatorSecret);
    if (!authenticated.ok) return authenticated;
    return new CommittingWorkerAdmissions(this.#database).workers();
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

  async #asOwner<T>(operatorSecret: string, command: (owner: PrincipalId) => Promise<Result<T>>): Promise<Result<T>> {
    const owner = await this.operatorPrincipal.authenticate(operatorSecret);
    return owner.ok ? command(owner.value) : owner;
  }

  #ownerBootstrap(): OwnerBootstrapService {
    return new OwnerBootstrapService({ store: this.#access, random: this.#secrets, clock: this.#clock });
  }

  #principals(): PrincipalAdministration {
    return new PrincipalAdministration({ store: this.#access, hasher: this.#hasher, random: this.#secrets, clock: this.#clock });
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
