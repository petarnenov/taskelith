import type { WorkerAdmissionSnapshot } from '@taskelith/fleet';
import { redactSecrets } from '@taskelith/secrets';

// The workers view with each detail redacted again, since a worker wrote
// it (worker admission contract section 3); the CLI and the API share it.
export function printableWorkerAdmission(snapshot: WorkerAdmissionSnapshot): WorkerAdmissionSnapshot {
  return {
    ...snapshot,
    workers: snapshot.workers.map((worker) => ({
      ...worker,
      results: worker.results.map((result) => ({ ...result, details: result.details.map((detail) => redactSecrets(detail)) })),
    })),
  };
}
