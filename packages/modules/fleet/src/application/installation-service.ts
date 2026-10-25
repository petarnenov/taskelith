import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AdministrativeInvocation, OperatorCredentialService } from '@taskelith/access';
import { FIRST_RECOVERY_EPOCH, installationIdentity, isSameInstallation, type InstallationIdentity } from '../domain/installation.js';
import type { IdentifierSource } from '../ports/identifier-source.js';
import type { InstallationRecord, InstallationTable } from '../ports/installation-records.js';

export interface InitializedInstallation {
  readonly identity: InstallationIdentity;
  // The one-time operator bootstrap credential, shown once.
  readonly operatorSecret: string;
}

export interface InstallationServiceDependencies {
  readonly record: InstallationRecord;
  readonly table: InstallationTable;
  readonly ids: IdentifierSource;
  readonly operator: OperatorCredentialService;
}

// Explicit initialization and the start check of trust model section 2.
// Only an administrative invocation initializes; nothing else ever does.
export class InstallationService {
  readonly #deps: InstallationServiceDependencies;

  constructor(dependencies: InstallationServiceDependencies) {
    this.#deps = dependencies;
  }

  // Writes the record outside the database first, then its copy, then the
  // bootstrap credential; a rerun after a crash completes the same identity.
  async initialize(invocation: AdministrativeInvocation): Promise<Result<InitializedInstallation>> {
    const stored = await this.#stored();
    if (!stored.ok) return stored;
    const { record, table } = stored.value;
    if (record === undefined && table !== undefined) {
      return err(failure('precondition-failed', 'the database holds an installation whose record outside it is missing'));
    }
    const identity = record === undefined ? await this.#createRecord() : ok(record);
    if (!identity.ok) return identity;
    const copied = await this.#ensureCopy(table, identity.value);
    if (!copied.ok) return copied;
    const operatorSecret = await this.#deps.operator.bootstrap(invocation);
    if (operatorSecret.ok) return ok({ identity: identity.value, operatorSecret: operatorSecret.value });
    if (operatorSecret.error.code !== 'conflict') return operatorSecret;
    return err(failure('conflict', 'the installation is already initialized'));
  }

  // The control plane starts only with both records present and equal; a
  // mismatch, as after a database restore, fails closed until G6's procedure.
  async verifyAtStart(): Promise<Result<InstallationIdentity>> {
    const stored = await this.#stored();
    if (!stored.ok) return stored;
    const { record, table } = stored.value;
    if (record === undefined || table === undefined) {
      return err(failure('not-found', 'the installation is not initialized; run its explicit initialization'));
    }
    return isSameInstallation(record, table) ? ok(record) : mismatch();
  }

  async #stored(): Promise<Result<{ record?: InstallationIdentity; table?: InstallationIdentity }>> {
    const record = await this.#deps.record.read();
    if (!record.ok) return record;
    const table = await this.#deps.table.read();
    if (!table.ok) return table;
    return ok({ record: record.value, table: table.value });
  }

  async #createRecord(): Promise<Result<InstallationIdentity>> {
    const identity = installationIdentity(this.#deps.ids.newInstallationId(), FIRST_RECOVERY_EPOCH);
    if (!identity.ok) return identity;
    const created = await this.#deps.record.create(identity.value);
    return created.ok ? identity : created;
  }

  async #ensureCopy(table: InstallationIdentity | undefined, identity: InstallationIdentity): Promise<Result<void>> {
    if (table === undefined) return this.#deps.table.initialize(identity);
    return isSameInstallation(table, identity) ? ok(undefined) : mismatch();
  }
}

function mismatch(): Result<never> {
  return err(failure('precondition-failed', 'the installation record and its database copy differ; the installation stays closed'));
}
