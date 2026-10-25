// A process ID alone never names a process; the boot, the ID, and the start
// time together do (supervisor identity contract, section 2).
export interface ProcessIdentity {
  readonly bootId: string;
  readonly pid: number;
  readonly startTime: number;
}

// One process as a single kernel listing shows it.
export interface ProcessEntry {
  readonly identity: ProcessIdentity;
  readonly parentPid: number;
  readonly processGroupId: number;
}

export function sameProcess(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return left.bootId === right.bootId && left.pid === right.pid && left.startTime === right.startTime;
}
