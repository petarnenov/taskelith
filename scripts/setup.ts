import { spawnSync } from 'node:child_process';
import {
  checkEnvironment, collectFacts, formatReport, readPins, setupSteps, stepCommand, type CommandRunner
} from './environment-checks.ts';

// `make setup`: adds the missing parts that can be installed from this clone,
// then reports the result. scripts/with-pinned-node.sh runs it with the
// Node.js version in .nvmrc when nvm is available.

const run: CommandRunner = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return { status: result.status, stdout: result.stdout ?? '' };
};

const pins = readPins(process.env);
const check = () => checkEnvironment(collectFacts(run, process.version), pins);

for (const step of setupSteps(check())) {
  const { command, args } = stepCommand(step, pins);
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`make setup: '${command} ${args.join(' ')}' failed.`);
    process.exit(1);
  }
}

const results = check();
console.log(formatReport(results));
const invokingNode = process.env.INVOKING_NODE;
if (invokingNode !== process.version) {
  console.log(`These checks ran under Node.js ${process.version}, but your shell uses ${invokingNode || 'none'}; run 'nvm use' before make doctor or make verify.`);
}
if (results.some((result) => !result.ok)) process.exit(1);
