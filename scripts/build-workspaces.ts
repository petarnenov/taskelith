import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { missingBuildOutputs, workspacePackageDirs, workspacePackageProblems } from './workspace-packages.ts';

// Checks the workspace packages against their contract, then runs `tsc --build`
// over their project references; with no package, it succeeds without building.
const root = process.cwd();
const packages = workspacePackageDirs(root);

if (packages.length === 0) {
  console.log('No workspace packages to build.');
} else {
  const problems = packages.flatMap((dir) => workspacePackageProblems(root, dir).map((problem) => `${dir}: ${problem}`));
  if (problems.length > 0) {
    for (const problem of problems) console.error(`Workspace package contract: ${problem}`);
    process.exit(1);
  }
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--build', ...packages.map((dir) => join(dir, 'tsconfig.json'))], { stdio: 'inherit' });
  const missing = packages.flatMap((dir) => missingBuildOutputs(root, dir).map((output) => `${dir}/${output}`));
  if (missing.length > 0) {
    console.error(`Workspace package build outputs missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}
