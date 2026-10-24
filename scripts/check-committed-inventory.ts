import { REGENERATE_REMEDY, uncommittedInventoryPaths } from './inventory-provenance.ts';

// Run by the pre-push hook before make verify, which reads the working tree.
const uncommitted = uncommittedInventoryPaths(process.cwd());
if (uncommitted.length > 0) {
  console.error(`pre-push: uncommitted dependency inventory changes: ${uncommitted.join(', ')}; ${REGENERATE_REMEDY}`);
  process.exit(1);
}
