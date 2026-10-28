import { LinuxReclaimHost, ProcessGroupReclaimHost, type ReclaimHost, type ReclaimProgram } from '@taskelith/git-workspace';

// Launches the program, prints its containment, and waits to be killed;
// usage: CHECKOUT [CONTAINMENT_NAME CONTAINMENT_PARENT UID [PROGRAM_JSON]]
const [checkout, name = 'reclaim-launched', parent, uid, programJson] = process.argv.slice(2);
const program = programJson === undefined ? undefined : JSON.parse(programJson) as ReclaimProgram;
const host: ReclaimHost = parent === undefined
  ? new ProcessGroupReclaimHost()
  : new LinuxReclaimHost({ containmentParent: parent, executionAccount: { uid: Number(uid), gid: Number(uid) }, program });
const launched = await host.launch(checkout!, name);
if (!launched.ok) process.exit(2);
process.stdout.write(`${JSON.stringify(launched.value.containment)}\n`);
setInterval(() => {}, 60_000);
