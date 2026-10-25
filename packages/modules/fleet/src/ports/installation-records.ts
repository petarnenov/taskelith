import type { Result } from '@taskelith/kernel';
import type { InstallationIdentity } from '../domain/installation.js';

// The record outside the database, under `control-plane/`, which a restore
// cannot roll back (trust model 2); `create` fails with `conflict` if present.
export interface InstallationRecord {
  read(): Promise<Result<InstallationIdentity | undefined>>;
  create(identity: InstallationIdentity): Promise<Result<void>>;
}

// The copy in the database, for reads inside transactions; written once at
// initialization, at SERIALIZABLE, with the installation not quarantined.
export interface InstallationTable {
  read(): Promise<Result<InstallationIdentity | undefined>>;
  initialize(identity: InstallationIdentity): Promise<Result<void>>;
}
