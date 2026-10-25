import { execFileSync } from 'node:child_process';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProcessEntry, ProcessIdentity } from './process-identity.js';
import type { DeadlineClock, DeadlineReading, Platform, ProcessInspector } from './ports.js';

// Reading mach_continuous_time and kinfo_proc needs a native mechanism that
// the owner has not chosen (decision D-A), so these reads fail closed.
const NO_NATIVE_READER = 'macOS native process and clock reads await an owner decision';

export class DarwinProcessInspector implements ProcessInspector {
  bootId(): Result<string> {
    try {
      return ok(execFileSync('sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).trim());
    } catch (error) {
      return err(failure('unavailable', `cannot read kern.bootsessionuuid: ${(error as Error).message}`));
    }
  }

  identity(_pid: number): Result<ProcessIdentity | undefined> {
    return err(failure('unavailable', NO_NATIVE_READER));
  }

  listing(): Result<readonly ProcessEntry[]> {
    return err(failure('unavailable', NO_NATIVE_READER));
  }
}

export class DarwinDeadlineClock implements DeadlineClock {
  read(): Result<DeadlineReading> {
    return err(failure('unavailable', NO_NATIVE_READER));
  }
}

export function darwinPlatform(): Platform {
  return {
    name: 'darwin',
    clock: new DarwinDeadlineClock(),
    inspector: new DarwinProcessInspector(),
    containment: () => undefined,
    namespaceIncarnation: () => undefined,
  };
}
