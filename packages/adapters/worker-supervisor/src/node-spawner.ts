import { spawn } from 'node:child_process';
import type { ChildExit, Spawner, SpawnResult } from './ports.js';
import type { Command, ExecutionAccount } from './record.js';

// Detached children lead a new session and process group, so the group ID
// equals the child's process ID.
export class NodeSpawner implements Spawner {
  spawn(command: Command, account: ExecutionAccount | undefined): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const child = spawn(command.executable, [...command.arguments], {
        detached: true,
        stdio: 'ignore',
        ...(account === undefined ? {} : { uid: account.uid, gid: account.gid }),
      });
      const exited = new Promise<ChildExit>((settle) => child.once('exit', (code, signal) => settle({ code, signal })));
      child.once('spawn', () => resolve({ kind: 'spawned', pid: child.pid!, exited }));
      child.once('error', (error) => resolve({ kind: 'failed', failure: error.message }));
    });
  }

  signalGroup(processGroupId: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    try {
      process.kill(-processGroupId, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
}
