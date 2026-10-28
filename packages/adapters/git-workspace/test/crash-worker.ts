import type { AttemptId } from '@taskelith/execution';
import { crashPointsFromEnvironment, id, value } from '@taskelith/testing';
import { GitWorkspaces, LinuxReclaimHost, ProcessGroupReclaimHost, verifyGitClient, type ReclaimHost } from '@taskelith/git-workspace';
import { simulatedSeparateAccount, type CrashWorkerConfig, type CrashWorkerHost } from './git-fixture.ts';

// A worker process that runs one hand-off or reclaim until the crash point
// of its environment kills it by SIGKILL; usage: CONFIG_JSON.
const config = JSON.parse(process.argv[2]!) as CrashWorkerConfig;

function hostOf(host: CrashWorkerHost): ReclaimHost {
  if (host.kind === 'linux') {
    const { containmentParent, executionAccount, program } = host;
    return new LinuxReclaimHost({ containmentParent, executionAccount, program });
  }
  return simulatedSeparateAccount(new ProcessGroupReclaimHost(host.program));
}

const workspaces = new GitWorkspaces({
  dataRoot: config.dataRoot,
  client: value(await verifyGitClient(config.pin)),
  remoteTransport: 'https-or-loopback-http',
  crashPoints: crashPointsFromEnvironment(),
  reclaimHost: hostOf(config.host),
});
await workspaces[config.operation](id('AttemptId', config.attemptId) as AttemptId);
