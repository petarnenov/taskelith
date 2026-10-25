import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { replaceFile, syncPath } from './durable-file.js';
import { rootFailure } from './journal-failure.js';

// After a flush failure the worker stays stopped until the host restarts
// or a new incarnation starts (contract section 7), across worker restarts.
const FAULT_FORMAT = 1;

// The identity of the current host boot; a container shares its host's.
export function hostBootId(): Result<string> {
  try {
    if (process.platform === 'linux') return ok(readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim());
    if (process.platform === 'darwin') {
      return ok(execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).trim());
    }
  } catch (error) {
    return err(failure('internal', `cannot read the host boot identity: ${(error as Error).message}`));
  }
  return err(failure('internal', `no host boot identity on ${process.platform}`));
}

export function recordJournalFault(path: string, fault: Failure, bootId: string): Result<void> {
  const content = { format: FAULT_FORMAT, bootId, reason: fault.details.reason ?? fault.code, message: fault.message };
  return replaceFile(path, `${JSON.stringify(content)}\n`);
}

// Refuses to start in the boot that saw the fault; a later boot clears it.
export function checkJournalFault(path: string, bootId: string): Result<void> {
  if (!existsSync(path)) return ok(undefined);
  let stored: { bootId?: unknown; reason?: unknown; message?: unknown };
  try {
    stored = JSON.parse(readFileSync(path, 'utf8')) as typeof stored;
  } catch {
    return err(rootFailure('corrupt', `${path} is unreadable; an operator removes it after checking the journal`, { path }));
  }
  if (stored.bootId === bootId) {
    const reason = stored.reason === 'corrupt' ? 'corrupt' : 'flush-failure';
    return err(rootFailure(reason, `the journal stopped in this boot: ${String(stored.message)}`));
  }
  return clearJournalFault(path);
}

export function clearJournalFault(path: string): Result<void> {
  if (!existsSync(path)) return ok(undefined);
  rmSync(path);
  return syncPath(dirname(path));
}
