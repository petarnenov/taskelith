import { LinuxReclaimHost, ProcessGroupReclaimHost, type ReclaimHost } from '@taskelith/git-workspace';

// Launches the fixed program, prints its containment, and waits to be
// killed; usage: CHECKOUT [CONTAINMENT_NAME CONTAINMENT_PARENT UID]
const [checkout, name = 'reclaim-launched', parent, uid] = process.argv.slice(2);
const host: ReclaimHost = parent === undefined
  ? new ProcessGroupReclaimHost()
  : new LinuxReclaimHost({ containmentParent: parent, executionAccount: { uid: Number(uid), gid: Number(uid) } });
const launched = await host.launch(checkout!, name);
if (!launched.ok) process.exit(2);
process.stdout.write(`${JSON.stringify(launched.value.containment)}\n`);
setInterval(() => {}, 60_000);
