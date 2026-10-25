import type { ProjectId, RunId } from '../domain/capacity-reservation.js';

// Concurrency quotas, installation settings with the operational targets'
// defaults; a change is a SERIALIZABLE write that releases nothing.
export interface QuotaSettings {
  projectQuota(projectId: ProjectId): Promise<number>;
  runQuota(runId: RunId): Promise<number>;
}
