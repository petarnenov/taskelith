import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { RECLAIM_READY, enterReclaimContainment, normalizeCheckout, parseReclaimArguments, receivedGo } from '@taskelith/git-workspace';

// Starts as the fixed program does; after `go`, `hold PATH` normalizes once
// PATH is gone and `fail -` fails; `eager -` normalizes without `go`.
const [mode, hold, ...rest] = process.argv.slice(2);
const parsed = parseReclaimArguments(rest);
if (!parsed.ok || parsed.value.containment === undefined) process.exit(2);
enterReclaimContainment(parsed.value.containment);
process.stdout.write(RECLAIM_READY);
if (mode === 'eager') {
  await normalizeCheckout(parsed.value.checkout, process.getuid!());
  process.exit(0);
}
if (!(await receivedGo(process.stdin, parsed.value.goWithinMs))) process.exit(3);
if (mode === 'fail') process.exit(1);
while (existsSync(hold!)) await delay(50);
await normalizeCheckout(parsed.value.checkout, process.getuid!());
