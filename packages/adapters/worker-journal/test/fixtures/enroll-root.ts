import { enrollWorkerRoot } from '@taskelith/worker-journal';
import { ENROLLMENT, rootOptions } from '../fixtures.ts';

// Enrolls `argv[2]` with the execution group `argv[3]`, as the worker does
// under its entrypoint's setpriv, and exits 1 with the failure otherwise.
const [dataRoot, group] = process.argv.slice(2);
const enrolled = enrollWorkerRoot(rootOptions(dataRoot!, { executionGroup: Number(group) }), ENROLLMENT);
if (!enrolled.ok) {
  process.stderr.write(`${enrolled.error.code}: ${enrolled.error.message}\n`);
  process.exit(1);
}
enrolled.value.close();
