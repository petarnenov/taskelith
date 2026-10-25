import { readFileSync } from 'node:fs';
import { checkInventoryInputs, INVENTORY_FILES } from './inventory-provenance.ts';

// Run by the post-merge hook: reports an inventory that a merge left stale.
try {
  const [licenses] = INVENTORY_FILES;
  checkInventoryInputs(JSON.parse(readFileSync(licenses, 'utf8')).provenance, path => readFileSync(path));
} catch (error) {
  console.error(`post-merge: ${(error as Error).message}`);
  process.exit(1);
}
