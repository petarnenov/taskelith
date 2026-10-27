import type { InstallationState, RecoveryEpoch } from './identifiers.js';

// Launch authorization section 7: an execution observation of another epoch,
// or received in quarantine, is only evidence and changes no current state.
export function isQuarantineEvidence(recoveryEpoch: RecoveryEpoch, installation: InstallationState): boolean {
  return installation.quarantined || recoveryEpoch !== installation.recoveryEpoch;
}
