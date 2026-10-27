import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REGENERATE_REMEDY, uncommittedInventoryPaths } from './inventory-provenance.ts';
import { DELETE_ONLY_PUSH_STATUS, isDeleteOnlyPush, unverifiedPushRefs } from './pre-push-checks.ts';

// Run by the pre-push hook before make verify, which reads the working tree.
const updates = readFileSync(0, 'utf8');
if (isDeleteOnlyPush(updates)) {
  console.log('pre-push: the push only deletes remote refs; skipping make verify');
  process.exit(DELETE_ONLY_PUSH_STATUS);
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const unverified = unverifiedPushRefs(updates, head);
if (unverified.length > 0) {
  console.error(`pre-push: make verify checks only the checked-out commit; check out and push ${unverified.join(', ')} separately`);
  process.exit(1);
}
const uncommitted = uncommittedInventoryPaths(process.cwd());
if (uncommitted.length > 0) {
  console.error(`pre-push: uncommitted dependency inventory changes: ${uncommitted.join(', ')}; ${REGENERATE_REMEDY}`);
  process.exit(1);
}
