import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { enterReclaimContainment, normalizeCheckout, parseReclaimArguments, receivedGo } from '@taskelith/git-workspace';

// Enters its containment as the fixed program does; then `hold PATH` waits
// while PATH exists and normalizes, and `fail -` fails.
const [mode, hold, ...rest] = process.argv.slice(2);
const parsed = parseReclaimArguments(rest);
if (!parsed.ok || parsed.value.containment === undefined) process.exit(2);
enterReclaimContainment(parsed.value.containment);
if (!(await receivedGo(process.stdin))) process.exit(3);
if (mode === 'fail') process.exit(1);
while (existsSync(hold!)) await delay(50);
await normalizeCheckout(parsed.value.checkout, process.getuid!());
