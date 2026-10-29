import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BROWSER_APPLICATIONS, nodePackageDirs, workspacePackageDirs } from './workspace-packages.ts';

// Coverage reports only modules that tests load, so this fails on a product
// module missing from Node's or a browser application's Vitest report.

const NODE_SOURCE = /\.ts$/;
const BROWSER_SOURCE = /\.tsx?$/;

function sourceModules(root: string, dir: string, pattern = NODE_SOURCE): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(join(root, path)).isDirectory()) return sourceModules(root, path, pattern);
    return pattern.test(path) && !path.endsWith('.d.ts') ? [path] : [];
  });
}

function productSources(root: string): { source: string; compiled: string }[] {
  return ['', ...nodePackageDirs(root)].flatMap((packageDir) => {
    const sourceDir = posix.join(packageDir, 'src');
    const distDir = posix.join(packageDir, 'dist');
    return sourceModules(root, sourceDir).map((source) => {
      const relativeSource = relative(sourceDir, source).split(sep).join('/');
      return { source: source.split(sep).join('/'), compiled: posix.join(distDir, relativeSource.replace(/\.ts$/, '.js')) };
    });
  });
}

function coveredFiles(root: string, lcov: string): Set<string> {
  return new Set(lcov.split('\n')
    .filter((line) => line.startsWith('SF:'))
    .map((line) => relative(root, resolve(root, line.slice(3))).split(sep).join('/')));
}

function isTypeOnly(root: string, compiled: string): boolean {
  const path = join(root, compiled);
  if (!existsSync(path)) return false;
  const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  return code === 'export {};';
}

// A browser source that emits nothing at run time declares only types.
function isTypeOnlySource(root: string, source: string): boolean {
  const { outputText } = ts.transpileModule(readFileSync(join(root, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: true },
    fileName: source,
  });
  return outputText.replace(/\/\/.*$/gm, '').trim() === 'export {};';
}

export type ReadReport = (path: string) => string;

const readReport: ReadReport = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// Each browser application's report is <app>/coverage/lcov.info, with paths
// relative to the application's directory.
function missingBrowserSources(root: string, dir: string, read: ReadReport): string[] {
  const covered = coveredFiles(join(root, dir), read(join(root, dir, 'coverage/lcov.info')));
  return sourceModules(root, posix.join(dir, 'src'), BROWSER_SOURCE)
    .map((source) => source.split(sep).join('/'))
    .filter((source) => !covered.has(posix.relative(dir, source)) && !isTypeOnlySource(root, source));
}

export function missingFromCoverage(root: string, lcov: string, read: ReadReport = readReport): string[] {
  const covered = coveredFiles(root, lcov);
  const nodeMissing = productSources(root)
    .filter(({ compiled }) => !covered.has(compiled) && !isTypeOnly(root, compiled))
    .map(({ source }) => source);
  const browserApps = workspacePackageDirs(root).filter((dir) => BROWSER_APPLICATIONS.has(dir));
  return [...nodeMissing, ...browserApps.flatMap((dir) => missingBrowserSources(root, dir, read))];
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = missingFromCoverage(process.cwd(), readFileSync(process.argv[2], 'utf8'));
  if (missing.length > 0) {
    console.error(`Product modules missing from the coverage report: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('Every product module is in the coverage report.');
}
