import type { ExitRecord, HandleRecord, IntentRecord, LaunchRecord, RecordProblem, TerminationEvidence } from './record.js';

// What the worker found of one execution when its service starts: its
// journal, the execution record, the supervisor lock, and native evidence.
export interface RecoveryEvidence {
  readonly journaled: 'intent' | 'record';
  readonly record: RecordSnapshot | 'missing';
  readonly supervisor: SupervisorLiveness;
  readonly native: NativeEvidence;
}

export interface RecordSnapshot {
  readonly problems: readonly RecordProblem[];
  readonly intent?: IntentRecord;
  readonly launch?: LaunchRecord;
  readonly handle?: HandleRecord;
  readonly exit?: ExitRecord;
}

// `lock-held-by-dead`: the lock is held, but the highest supervisor record
// names a dead process, as between taking the lock and writing the record.
export type SupervisorLiveness = 'live' | 'none' | 'lock-held-by-dead' | 'lock-held-by-dead-after-retries';

export type NativeEvidence =
  | {
      readonly platform: 'linux';
      readonly bootChanged: boolean;
      readonly namespaceCurrent: boolean;
      readonly oldNamespaceEndProven: boolean;
      readonly containment: 'populated' | 'empty' | 'unreadable';
    }
  | { readonly platform: 'darwin'; readonly bootChanged: boolean; readonly childAlive: boolean };

export type RecoveryDecision =
  | { readonly action: 'complete-and-seal' }
  | { readonly action: 'seal' }
  | { readonly action: 'report-not-started' }
  | { readonly action: 'adopt-supervisor' }
  | { readonly action: 'report-exit'; readonly exit: ExitRecord }
  | { readonly action: 'complete-spawn-failure'; readonly failure: string }
  | { readonly action: 'retry-liveness' }
  | { readonly action: 'adopt-containment' }
  | { readonly action: 'adopt-child' }
  | { readonly action: 'write-unknown-exit'; readonly startProven: boolean; readonly termination: TerminationEvidence }
  | { readonly action: 'uncertain'; readonly reason: string };

// The recovery table of the supervisor identity contract, section 6. No
// decision spawns; a seal that loses its race is decided again by the caller.
export function decideRecovery(evidence: RecoveryEvidence): RecoveryDecision {
  const { record } = evidence;
  if (evidence.journaled === 'intent') return { action: 'complete-and-seal' };
  if (record === 'missing' || record.intent === undefined) return uncertain('the journaled record is missing or damaged');
  const problem = recordProblem(record);
  if (problem !== undefined) return uncertain(problem);
  if (record.launch === undefined) return { action: 'seal' };
  if (record.launch.kind === 'seal') return { action: 'report-not-started' };
  if (evidence.supervisor === 'live') return { action: 'adopt-supervisor' };
  if (record.exit !== undefined) return { action: 'report-exit', exit: record.exit };
  if (record.handle?.kind === 'spawn-failed') return { action: 'complete-spawn-failure', failure: record.handle.failure };
  if (evidence.supervisor === 'lock-held-by-dead') return { action: 'retry-liveness' };
  if (evidence.supervisor === 'lock-held-by-dead-after-retries') return uncertain('the lock is held by no live supervisor');
  const startProven = record.handle !== undefined;
  return evidence.native.platform === 'linux'
    ? decideLinux(evidence.native, startProven)
    : decideDarwin(evidence.native, startProven);
}

function decideLinux(native: Extract<NativeEvidence, { platform: 'linux' }>, startProven: boolean): RecoveryDecision {
  if (native.bootChanged) return unknownExit(startProven, 'boot-changed');
  if (!native.namespaceCurrent) {
    return native.oldNamespaceEndProven ? unknownExit(startProven, 'namespace-ended') : uncertain('the old namespace may still run');
  }
  if (native.containment === 'unreadable') return uncertain('the containment cannot be read');
  return native.containment === 'populated' ? { action: 'adopt-containment' } : unknownExit(startProven, 'containment-empty');
}

function decideDarwin(native: Extract<NativeEvidence, { platform: 'darwin' }>, startProven: boolean): RecoveryDecision {
  if (native.bootChanged) return unknownExit(startProven, 'boot-changed');
  if (!startProven) return uncertain('no handle proves which process started');
  return native.childAlive ? { action: 'adopt-child' } : uncertain('descendants may live without a containment');
}

// A file that cannot be trusted, or a combination the launch sequence cannot
// produce, is never guessed around (section 3).
function recordProblem(record: RecordSnapshot): string | undefined {
  const [first] = record.problems;
  if (first !== undefined) return `${first.file} ${first.detail}`;
  const claimed = record.launch?.kind === 'claim';
  if (!claimed && (record.handle !== undefined || record.exit !== undefined)) return 'a handle or exit exists without a claim';
  return undefined;
}

function unknownExit(startProven: boolean, termination: TerminationEvidence): RecoveryDecision {
  return { action: 'write-unknown-exit', startProven, termination };
}

function uncertain(reason: string): RecoveryDecision {
  return { action: 'uncertain', reason };
}
