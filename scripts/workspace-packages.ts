import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, posix } from 'node:path';
import ts from 'typescript';

const PACKAGE_SCOPE = '@taskelith/';
const LAYOUT_OPTIONS = ['composite', 'declaration', 'rootDir', 'outDir', 'tsBuildInfoFile'];
const PUBLIC_EXPORT = { '.': { types: './dist/index.d.ts', default: './dist/index.js' } };
// A module package may also export its port entry (ADR 0009).
const MODULE_EXPORTS = { ...PUBLIC_EXPORT, './port': { types: './dist/port.d.ts', default: './dist/port.js' } };

// Expands workspace patterns (`dir` or `dir/*`) into existing package
// directories; a pattern may match none, as packages come with their first use.
export function workspacePackageDirs(root: string): string[] {
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) return [];
  const patterns: string[] = JSON.parse(readFileSync(manifestPath, 'utf8')).workspaces ?? [];
  return patterns.flatMap((pattern) => expandPattern(root, pattern))
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .sort();
}

function expandPattern(root: string, pattern: string): string[] {
  if (!pattern.endsWith('/*')) return [pattern];
  const parent = pattern.slice(0, -2);
  if (!existsSync(join(root, parent))) return [];
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => posix.join(parent, entry.name));
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// tsconfig files accept comments and trailing commas, so they are read with
// TypeScript's own parser.
function readTsconfig(path: string): Record<string, any> {
  const { config, error } = ts.readConfigFile(path, ts.sys.readFile);
  if (error) throw new Error(`${path}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  return config;
}

function workspaceDependencies(manifest: Record<string, any>): string[] {
  const names = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies]
    .flatMap((group) => Object.keys(group ?? {}))
    .filter((name) => name.startsWith(PACKAGE_SCOPE));
  return [...new Set(names)];
}

// The package contract every workspace package follows, so that builds,
// imports, and the boundary check behave the same for each of them.
export function workspacePackageProblems(root: string, dir: string): string[] {
  const manifest = readJson(join(root, dir, 'package.json'));
  const problems: string[] = [];
  if (manifest.name !== `${PACKAGE_SCOPE}${posix.basename(dir)}`) problems.push(`name must be ${PACKAGE_SCOPE}${posix.basename(dir)}`);
  if (manifest.private !== true) problems.push('must be private');
  if (manifest.type !== 'module') problems.push('type must be module');
  if (!isDeepStrictEqual(manifest.exports, PUBLIC_EXPORT) && !(isModulePackage(dir) && isDeepStrictEqual(manifest.exports, MODULE_EXPORTS))) {
    problems.push('exports must be only the root entry ./dist/index.js with types ./dist/index.d.ts, and for a module also its port entry ./dist/port.js');
  }
  if (manifest.imports !== undefined) problems.push('must not declare imports aliases');

  const tsconfigPath = join(root, dir, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return [...problems, 'tsconfig.json is missing'];
  const tsconfig = readTsconfig(tsconfigPath);
  const base = posix.relative(dir, 'tsconfig.package.json');
  if (tsconfig.extends !== base) problems.push(`tsconfig.json must extend ${base}`);
  const overrides = [
    ...LAYOUT_OPTIONS.filter((option) => tsconfig.compilerOptions?.[option] !== undefined),
    ...['include', 'files'].filter((key) => tsconfig[key] !== undefined),
  ];
  if (overrides.length > 0) problems.push(`tsconfig.json must take its layout from the shared package base, not override ${overrides.join(', ')}`);

  const packagesByName = new Map(workspacePackageDirs(root).map((other) => [readJson(join(root, other, 'package.json')).name, other]));
  const expected = workspaceDependencies(manifest).map((name) => {
    const target = packagesByName.get(name);
    if (!target) problems.push(`depends on ${name}, which is not a workspace package`);
    return target ? posix.relative(dir, target) : null;
  }).filter((path): path is string => path !== null).sort();
  const actual = (tsconfig.references ?? []).map((reference: { path: string }) => reference.path).sort();
  if (!isDeepStrictEqual(actual, expected)) problems.push(`tsconfig.json references must be exactly its workspace dependencies: ${JSON.stringify(expected)}`);
  return problems;
}

function isModulePackage(dir: string): boolean {
  return dir.startsWith('packages/modules/');
}

export function missingBuildOutputs(root: string, dir: string): string[] {
  const exports = readJson(join(root, dir, 'package.json')).exports ?? {};
  const port = Object.hasOwn(exports, './port') ? ['dist/port.js', 'dist/port.d.ts'] : [];
  return ['dist/index.js', 'dist/index.d.ts', ...port].filter((output) => !existsSync(join(root, dir, output)));
}
