import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  browserApplicationProblems, isBrowserApplication, missingBuildOutputs, workspacePackageDirs, workspacePackageProblems,
} from './workspace-packages.ts';

// Checks the workspace packages, runs `tsc --build`, then builds each browser
// application; with no package it is a no-op, as tsc fails on nothing.
const root = process.cwd();
const packages = workspacePackageDirs(root);
const nodePackages = packages.filter((dir) => !isBrowserApplication(dir));

if (packages.length === 0) {
  console.log('No workspace packages to build.');
} else {
  const problems = packages.flatMap((dir) => {
    const contract = isBrowserApplication(dir) ? browserApplicationProblems : workspacePackageProblems;
    return contract(root, dir).map((problem) => `${dir}: ${problem}`);
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`Workspace package contract: ${problem}`);
    process.exit(1);
  }
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  if (nodePackages.length > 0) {
    execFileSync(process.execPath, [tsc, '--build', ...nodePackages.map((dir) => join(dir, 'tsconfig.json'))], { stdio: 'inherit' });
  }
  for (const dir of packages.filter(isBrowserApplication)) {
    execFileSync('npm', ['run', 'build', `--workspace=${dir}`], { stdio: 'inherit' });
  }
  const missing = packages.flatMap((dir) => missingBuildOutputs(root, dir).map((output) => `${dir}/${output}`));
  if (missing.length > 0) {
    console.error(`Workspace package build outputs missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}
