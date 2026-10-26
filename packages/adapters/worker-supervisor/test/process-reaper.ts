import { setTimeout as delay } from 'node:timers/promises';
import type { ScenarioProcess } from '@taskelith/testing';
import {
  parseHandle,
  parseSupervisor,
  RECORD_FILES,
  sameProcess,
  type ProcessIdentity,
  type ProcessInspector,
  type RecordStore,
} from '@taskelith/worker-supervisor';

// The longest a real-process test may run before it fails as timed out.
export const REAL_PROCESS_TEST_TIMEOUT = 30_000;

const REAP_BOUND_MILLISECONDS = 5_000;

interface ProcessGroup {
  readonly leader: ProcessIdentity;
  readonly groupId: number;
}

// Kills what a real-process test started, so that a failed assertion fails
// the test instead of leaving a supervisor that holds the runner open.
export class ProcessReaper {
  readonly #inspector: ProcessInspector;
  readonly #scenarios = new Set<ScenarioProcess>();
  readonly #stores = new Set<RecordStore>();

  constructor(inspector: ProcessInspector) {
    this.#inspector = inspector;
  }

  track(scenario: ScenarioProcess): ScenarioProcess {
    this.#scenarios.add(scenario);
    return scenario;
  }

  // The supervisors and the child that an execution record names.
  watch(store: RecordStore): void {
    this.#stores.add(store);
  }

  async reap(): Promise<void> {
    for (const store of this.#stores) {
      for (const group of await recordedGroups(store)) this.#killIfAlive(group);
    }
    await Promise.all([...this.#scenarios].map(stop));
    this.#stores.clear();
    this.#scenarios.clear();
  }

  // A process ID alone could name a reused process; its identity cannot.
  #killIfAlive({ leader, groupId }: ProcessGroup): void {
    const current = this.#inspector.identity(leader.pid);
    if (current.ok && current.value !== undefined && sameProcess(current.value, leader)) killGroup(groupId);
  }
}

// Every supervisor leads its own session, so its group ID is its PID.
async function recordedGroups(store: RecordStore): Promise<ProcessGroup[]> {
  const names = await store.list();
  if (!names.ok) return [];
  const groups: ProcessGroup[] = [];
  for (const name of names.value) {
    const text = await store.read(name);
    if (!text.ok || text.value === undefined) continue;
    const group = recordedGroup(name, text.value);
    if (group) groups.push(group);
  }
  return groups;
}

function recordedGroup(name: string, text: string): ProcessGroup | undefined {
  if (name === RECORD_FILES.handle) {
    const handle = parseHandle(text);
    return handle.ok && handle.value.kind === 'spawned' ? { leader: handle.value.process, groupId: handle.value.processGroupId } : undefined;
  }
  if (!name.startsWith('supervisor.')) return undefined;
  const supervisor = parseSupervisor(name, text);
  return supervisor.ok ? { leader: supervisor.value.process, groupId: supervisor.value.process.pid } : undefined;
}

async function stop(scenario: ScenarioProcess): Promise<void> {
  killGroup(scenario.pid);
  await Promise.race([scenario.exited, delay(REAP_BOUND_MILLISECONDS, undefined, { ref: false })]);
}

// A gone group is reaped already; macOS answers EPERM for a group of zombies.
const REAPED_GROUP_ERRORS: readonly (string | undefined)[] = ['ESRCH', 'EPERM'];

function killGroup(groupId: number): void {
  try {
    process.kill(-groupId, 'SIGKILL');
  } catch (error) {
    if (!REAPED_GROUP_ERRORS.includes((error as NodeJS.ErrnoException).code)) throw error;
  }
}
