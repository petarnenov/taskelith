import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { missingBuildOutputs, workspacePackageDirs, workspacePackageProblems } from './workspace-packages.ts';

// Checks every workspace package against the package contract, then builds
// them with `tsc --build`, which orders the builds by the project references
// the contract requires. TypeScript and npm both fail when there is nothing to
// build, so an empty workspace is a successful no-op here.
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
