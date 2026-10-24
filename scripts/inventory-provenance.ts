import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Node built-ins only: the git hooks run this before dependencies exist.

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

export const REGENERATE_REMEDY = 'regenerate with make dependency-inventory, review, and commit docs/dependencies';

export const INVENTORY_FILES = ['docs/dependencies/licenses.json', 'docs/dependencies/sbom.cdx.json'] as const;

export const INVENTORY_INPUTS = [
  'package.json', 'package-lock.json', '.nvmrc',
  'scripts/dependency-inventory.ts', 'scripts/inventory-dependencies.ts', 'scripts/inventory-provenance.ts',
] as const;

// The inputs whose content no longer matches the provenance hashes recorded
// in licenses.json; checked without npm, so it is fast enough for a hook.
export function staleInventoryInputs(provenance: unknown, readInput: (path: string) => Buffer): string[] {
  const recorded = typeof provenance === 'object' && provenance !== null ? provenance as Record<string, unknown> : {};
  return INVENTORY_INPUTS.filter(path => recorded[path] !== sha256(readInput(path)));
}

export function checkInventoryInputs(provenance: unknown, readInput: (path: string) => Buffer): void {
  const stale = staleInventoryInputs(provenance, readInput);
  if (stale.length > 0) {
    throw new Error(`Dependency inventory is stale; changed inputs: ${stale.join(', ')}; ${REGENERATE_REMEDY}`);
  }
}

// make verify reads the working tree, so a push must not leave the checked
// inventory or its inputs behind in uncommitted changes.
export function uncommittedInventoryPaths(root: string): string[] {
  const output = execFileSync('git', ['status', '--porcelain', '--', ...INVENTORY_FILES, ...INVENTORY_INPUTS], {
    cwd: root, encoding: 'utf8',
  });
  return output.split('\n').filter(line => line !== '').map(line => line.slice(3)).sort();
}
