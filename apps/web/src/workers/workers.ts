import type { ReadResult } from '../api/read-result';
import type { components } from '../generated/control-plane';

// The workers of the installation as the SPA reads them: the control
// plane's view types and the one read of the workers port, free of HTTP.

type Schemas = components['schemas'];

export type WorkersView = Schemas['WorkersView'];
export type WorkerAdmissionEntry = Schemas['WorkerAdmissionEntry'];
export type WorkerAdmissionState = Schemas['WorkerAdmissionState'];
export type WorkerHost = Schemas['WorkerHost'];
export type SelfCheckResult = Schemas['SelfCheckResult'];
export type SelfCheckOutcome = SelfCheckResult['outcome'];
export type NotApplicableReason = Schemas['NotApplicableReason'];
export type InstallationRole = Schemas['InstallationRole'];

// The role listWorkers requires (control-plane.openapi.json, listWorkers).
export const INSTALLATION_OWNER: InstallationRole = 'installation-owner';

export interface WorkersGateway {
  readonly listWorkers: () => Promise<ReadResult<WorkersView>>;
}
