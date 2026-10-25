// Whether the installation is in restore quarantine, and its recovery epoch,
// which every assignment offer carries; item 13 writes the record.
export interface InstallationGuard {
  quarantined(): Promise<boolean>;
  // Undefined for an installation without its record.
  recoveryEpoch(): Promise<number | undefined>;
}
