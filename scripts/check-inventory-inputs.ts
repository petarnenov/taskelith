import { readFileSync } from 'node:fs';
import { checkInventoryInputs } from './dependency-inventory.ts';

// Run by the post-merge hook: reports an inventory that a merge left stale.
try {
  const retained = JSON.parse(readFileSync('docs/dependencies/licenses.json', 'utf8'));
  checkInventoryInputs(retained.provenance, path => readFileSync(path));
} catch (error) {
  console.error(`post-merge: ${(error as Error).message}`);
  process.exit(1);
}
