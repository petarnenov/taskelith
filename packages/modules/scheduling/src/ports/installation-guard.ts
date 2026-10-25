// Whether the installation is in restore quarantine; item 13 owns the record
// and writes it at SERIALIZABLE, and placement creates nothing while it is.
export interface InstallationGuard {
  quarantined(): Promise<boolean>;
}
