import { spawnSync } from 'node:child_process';
import { checkEnvironment, collectFacts, formatReport, readPins, type CommandRunner } from './environment-checks.ts';

// `make doctor`: reports whether this clone can build and verify, without changing anything.

const run: CommandRunner = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return { status: result.status, stdout: result.stdout ?? '' };
};

const results = checkEnvironment(collectFacts(run, process.version), readPins(process.env));
console.log(formatReport(results));
if (results.some((result) => !result.ok)) process.exit(1);
