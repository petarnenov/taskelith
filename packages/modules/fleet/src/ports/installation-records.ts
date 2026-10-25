import type { Result } from '@taskelith/kernel';
import type { InstallationIdentity } from '../domain/installation.js';

// The record outside the database, under `control-plane/` of the data root,
// which a database restore cannot roll back (trust model section 2).
// `create` fails with `conflict` when a record exists.
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
