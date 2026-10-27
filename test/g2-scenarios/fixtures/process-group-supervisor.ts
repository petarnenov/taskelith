import { setTimeout as delay } from 'node:timers/promises';
import {
  adoptExecution,
  FileRecordStore,
  NodeSpawner,
  SqliteExecutionLock,
  superviseLaunch,
  type SupervisorDependencies,
} from '@taskelith/worker-supervisor';
import { processGroupPlatform } from '../process-group-supervision.ts';

// The scenarios' supervisor program: the real supervisor of
// worker-supervisor on the process-group platform. Usage: MODE DIRECTORY.
const [mode, directory] = process.argv.slice(2) as ['launch' | 'adopt', string];
const dependencies: SupervisorDependencies = {
  store: new FileRecordStore(directory),
  lock: new SqliteExecutionLock(directory),
  platform: processGroupPlatform(),
  spawner: new NodeSpawner(),
  selfPid: process.pid,
  timing: { pollMilliseconds: 100, graceMilliseconds: 1_000, retryMilliseconds: 200, unreadablePolls: 50 },
  sleep: (milliseconds) => delay(milliseconds),
  crashPoint: () => undefined,
};
await (mode === 'launch' ? superviseLaunch(dependencies) : adoptExecution(dependencies));
