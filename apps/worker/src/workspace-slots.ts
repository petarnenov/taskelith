import type { AttemptId } from '@taskelith/execution';
import type { HandedOffWorkspace, ReclaimContainment } from '@taskelith/git-workspace';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';
import type { WorkerWorkspace } from './workspace-composition.js';

export const RECLAIM_FAILED_EVENT = 'worker.workspace.reclaim-failed';

export interface WorkspaceSlotsOptions {
  readonly workspace: Pick<WorkerWorkspace, 'handOffRecords' | 'handOff' | 'reclaim'>;
  // Owes a capacity declaration durably, before a reclaim frees a slot.
  readonly oweCapacityDeclaration: () => Result<void>;
  // Journals the capacity when it changed or a declaration is owed.
  readonly declareCapacity: () => Result<void>;
  readonly logger: Logger;
}

// Handed-off attempts, each holding its slot until its reclaim removes the
// record (Git workspace contract sec. 3); only this process writes them.
export class WorkspaceSlots {
  readonly #options: WorkspaceSlotsOptions;
  readonly #held: Set<AttemptId>;
  readonly #recordedContainments: ReadonlySet<string>;

  private constructor(options: WorkspaceSlotsOptions, records: readonly HandedOffWorkspace[]) {
    this.#options = options;
    this.#held = new Set(records.map(({ attemptId }) => attemptId));
    this.#recordedContainments = new Set(records.flatMap(({ record }) => cgroupNames(record.containment)));
  }

  // Reads the records once; a read that fails fails the start, so a held
  // slot is never read as free. A failed reclaim found is logged.
  static async open(options: WorkspaceSlotsOptions): Promise<Result<WorkspaceSlots>> {
    const records = await readRecords(options.workspace);
    if (!records.ok) return records;
    for (const { attemptId, record } of records.value) {
      if (record.reclaimFailed) logReclaimFailed(options.logger, attemptId, { containment: describe(record.containment) });
    }
    return ok(new WorkspaceSlots(options, records.value));
  }

  // The handed-off attempts; admission counts each as one slot.
  get held(): ReadonlySet<AttemptId> {
    return this.#held;
  }

  // The cgroups that the records named at the start, which the scan for
  // unrecorded processes skips.
  get recordedContainments(): ReadonlySet<string> {
    return this.#recordedContainments;
  }

  // A failed hand-off may have written its record, so the record decides.
  async handOff(attemptId: AttemptId): Promise<Result<void>> {
    const handedOff = await this.#options.workspace.handOff(attemptId);
    if (handedOff.ok || (await this.#recordMayExist(attemptId))) this.#held.add(attemptId);
    return handedOff;
  }

  // Only a reclaim that removed the record frees the slot, and it never
  // reruns a failed program; the owed declaration outlives a fault.
  async reclaim(attemptId: AttemptId): Promise<Result<void>> {
    if (this.#held.has(attemptId)) {
      const owed = this.#options.oweCapacityDeclaration();
      if (!owed.ok) return owed;
    }
    const reclaimed = await this.#options.workspace.reclaim(attemptId);
    if (!reclaimed.ok) {
      if (isReclaimFailed(reclaimed.error)) logReclaimFailed(this.#options.logger, attemptId, {});
      return reclaimed;
    }
    this.#held.delete(attemptId);
    return this.#options.declareCapacity();
  }

  async #recordMayExist(attemptId: AttemptId): Promise<boolean> {
    const records = await readRecords(this.#options.workspace);
    return !records.ok || records.value.some((handedOff) => handedOff.attemptId === attemptId);
  }
}

async function readRecords(workspace: Pick<WorkerWorkspace, 'handOffRecords'>): Promise<Result<readonly HandedOffWorkspace[]>> {
  try {
    return ok(await workspace.handOffRecords());
  } catch (error) {
    return err(failure('unavailable', `the hand-off records cannot be read: ${(error as Error).message}`));
  }
}

function isReclaimFailed(error: Failure): boolean {
  return error.code === 'precondition-failed' && error.details.reason === 'reclaim-failed';
}

// For reconciliation (item 21): the attempt and the containment only,
// never a path, a credential, or checkout content.
function logReclaimFailed(logger: Logger, attemptId: AttemptId, fields: { containment?: string }): void {
  logger.warn(RECLAIM_FAILED_EVENT, { attemptId, ...fields });
}

function cgroupNames(containment: ReclaimContainment | null): string[] {
  return containment?.kind === 'cgroup' ? [containment.name] : [];
}

function describe(containment: ReclaimContainment | null): string {
  if (containment === null) return 'none';
  return containment.kind === 'cgroup' ? containment.name : `process group ${containment.id}`;
}
