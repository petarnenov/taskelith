import { OperatorCredentialService, type AdministrativeInvocation } from '@taskelith/access';
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
  type RotatedCredentials,
} from '@taskelith/fleet';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import { connectSystemAccount, NatsBrokerCredentials, type BrokerAuthority, type TransportTls } from '@taskelith/nats';
import type { Logger, Metrics } from '@taskelith/observability';
import {
  CommittingFleetRegistry,
  CommittingInstallationTable,
  CommittingOperatorCredentials,
  migrate,
  PostgresDatabase,
} from '@taskelith/postgres';
import { NodeSecrets, RandomIdentifiers } from '@taskelith/secrets';
import { ensureBrokerTrust, readBrokerAuthority } from './broker-trust.js';

export interface AdministrationSettings {
  readonly dataRoot: string;
  readonly ownerUid: number;
  readonly postgres: URL;
  readonly nats: URL;
  readonly natsTls?: TransportTls;
  readonly now?: () => Instant;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
}

export interface Initialization extends InitializedInstallation {
  readonly brokerServerConfig: string;
}

// Commands run on the control-plane host: host access authorizes the init and
// the operator reset (trust model 2); the others need the operator secret.
export class Administration {
  readonly #settings: AdministrationSettings;
  readonly #namespace: ControlPlaneNamespace;
  readonly #database: PostgresDatabase;
  readonly #secrets = new NodeSecrets();
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
    const trust = ensureBrokerTrust(this.#namespace, record.value !== undefined, this.#epochSeconds());
    if (!trust.ok) return trust;
    const initialized = await this.#installation().initialize(invocation);
    return initialized.ok ? ok({ ...initialized.value, brokerServerConfig: trust.value.serverConfigPath }) : initialized;
  }

  resetOperatorCredential(invocation: AdministrativeInvocation): Promise<Result<string>> {
    return this.#operator.reset(invocation);
  }

  issueEnrollmentToken(operatorSecret: string, constraints: HostConstraints): Promise<Result<string>> {
    return this.#asOperator(operatorSecret, (enrollment) => enrollment.issueToken(constraints));
  }

  rotateWorker(operatorSecret: string, workerId: string): Promise<Result<RotatedCredentials>> {
    return this.#asOperator(operatorSecret, (enrollment) => withWorkerId(workerId, (id) => enrollment.rotate(id)));
  }

  revokeWorker(operatorSecret: string, workerId: string): Promise<Result<void>> {
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
  async enrollmentService(): Promise<Result<{ service: EnrollmentService; close(): Promise<void> }>> {
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
      registry: new CommittingFleetRegistry(this.#database),
      secrets: this.#secrets,
      ids: new RandomIdentifiers(),
      broker: new NatsBrokerCredentials(authority.value, system.value.connection),
      clock: this.#clock,
    });
    return ok({ service, close: () => system.value.close() });
  }

  async #asOperator<T>(operatorSecret: string, command: (enrollment: EnrollmentService) => Promise<Result<T>>): Promise<Result<T>> {
    const authenticated = await this.#operator.authenticate(operatorSecret);
    if (!authenticated.ok) return authenticated;
    const enrollment = await this.enrollmentService();
    if (!enrollment.ok) return enrollment;
    try {
      return await command(enrollment.value.service);
    } finally {
      await enrollment.value.close();
    }
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
