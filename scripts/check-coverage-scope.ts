import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node's built-in coverage reports only modules that tests load, so this check
// fails when a product module under src/ is missing from the coverage report.

function sourceModules(root: string, dir = 'src'): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(join(root, path)).isDirectory()) return sourceModules(root, path);
    return path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });
}

function compiledPath(sourcePath: string): string {
  return sourcePath.replace(/^src/, 'dist').replace(/\.ts$/, '.js').split(sep).join('/');
}

function coveredFiles(root: string, lcov: string): Set<string> {
  return new Set(lcov.split('\n')
    .filter((line) => line.startsWith('SF:'))
    .map((line) => relative(root, resolve(root, line.slice(3))).split(sep).join('/')));
}

export function missingFromCoverage(root: string, lcov: string): string[] {
  const covered = coveredFiles(root, lcov);
  return sourceModules(root).filter((source) => !covered.has(compiledPath(source)));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = missingFromCoverage(process.cwd(), readFileSync(process.argv[2], 'utf8'));
  if (missing.length > 0) {
    console.error(`Product modules missing from the coverage report: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('Every product module under src/ is in the coverage report.');
}
