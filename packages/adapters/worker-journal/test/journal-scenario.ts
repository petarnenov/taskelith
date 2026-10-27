import { writeSync } from 'node:fs';
import { crashPointsFromEnvironment, id, value } from '@taskelith/testing';
import { openWorkerRoot } from '@taskelith/worker-journal';
import { PROCESS, assignment, exitWith, grantFor, launchRequest, rootOptions } from './fixtures.ts';

// A worker that runs one launch through its W commits; the crash point
// harness kills it where TASKELITH_CRASH_POINT says. Prints each step.
const [dataRoot, scenario] = process.argv.slice(2) as [string, 'exit' | 'seal'];
const points = crashPointsFromEnvironment();
const root = value(openWorkerRoot(rootOptions(dataRoot, { onCommitPoint: (point) => points.reach(point) })));
const { journal } = root;
const command = assignment();
const execution = id('ExecutionId', 'execution-1');
const request = launchRequest(execution, id('OperationId', 'operation-1'));

value(journal.recordCommand(command));
// A synchronous write, so the line is out before a kill at the next point.
writeSync(1, `acknowledged ${command.commandId}\n`);
value(journal.beginAuthorization(request));
value(journal.recordGrant(grantFor(request)));
if (scenario === 'seal') {
  value(journal.recordNotStarted(execution));
} else {
  value(journal.recordExecutionRecordWritten(execution));
  value(journal.recordStart(execution, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordExit(execution, exitWith({ kind: 'code', code: 0 })));
}
root.close();
console.log('done');
