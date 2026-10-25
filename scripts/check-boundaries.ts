import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { workspaceDependencies, workspacePackageDirs } from './workspace-packages.ts';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', '.openspec']);
const WORKSPACE_SCOPE = '@taskelith/';
const KERNEL_PACKAGE = '@taskelith/kernel';
const PLUGIN_ALLOWED_PACKAGES = new Set([KERNEL_PACKAGE, '@taskelith/plugin-sdk', '@taskelith/contracts']);
const INFRA_SDKS = new Set([
  'pg', 'postgres', 'nats', 'neo4j-driver', 'better-sqlite3', 'sqlite3',
  'express', 'fastify', 'koa', 'ws', 'undici', 'axios', 'node-pty',
  '@nats-io/jetstream', '@nats-io/nats-core', '@nats-io/transport-node',
]);

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...walkFiles(full));
    else if (stat.isFile()) results.push(full);
  }
  return results.sort();
}

// `import(specifier, options)` and `require(specifier)`, with a string or a
// template literal without substitutions as the specifier.
function isImportOrRequire(node: ts.CallExpression): boolean {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return node.arguments.length <= 2;
  return ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1;
}

// `typeOnly`: declared with `import type` or `export type`. `erased`: also
// when every named binding has an inline `type`, so no runtime code loads.
interface ModuleImport {
  spec: string;
  typeOnly: boolean;
  erased: boolean;
}

function hasOnlyInlineTypeImports(clause: ts.ImportClause | undefined): boolean {
  const bindings = clause?.namedBindings;
  return !clause?.name && bindings !== undefined && ts.isNamedImports(bindings) && allTypeOnly(bindings.elements);
}

function hasOnlyInlineTypeExports(node: ts.ExportDeclaration): boolean {
  const clause = node.exportClause;
  return clause !== undefined && ts.isNamedExports(clause) && allTypeOnly(clause.elements);
}

function allTypeOnly(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function extractImports(filePath: string, source: string): ModuleImport[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const imports: ModuleImport[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.importClause?.isTypeOnly ?? false;
      imports.push({ spec: node.moduleSpecifier.text, typeOnly, erased: typeOnly || hasOnlyInlineTypeImports(node.importClause) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly, erased: node.isTypeOnly || hasOnlyInlineTypeExports(node) });
    } else if (ts.isCallExpression(node) && isImportOrRequire(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      imports.push({ spec: node.arguments[0].text, typeOnly: false, erased: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      imports.push({ spec: node.argument.literal.text, typeOnly: true, erased: true });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      imports.push({ spec: node.moduleReference.expression.text, typeOnly: node.isTypeOnly, erased: node.isTypeOnly });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return imports;
}

function toPosix(p: string): string {
  return p.split('\\').join('/');
}

function packageName(spec: string): string {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
}

// One import of one file, with its known target as a repository path: the
// resolved file of a relative import or the entry of a workspace package.
interface ImportEdge {
  rel: string;
  spec: string;
  target: string | null;
  relative: boolean;
  typeOnly: boolean;
  erased: boolean;
  workspaces: Map<string, string>;
}

function workspacePackagesByName(root: string): Map<string, string> {
  return new Map(workspacePackageDirs(root).map((dir) => {
    const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    return [manifest.name as string, dir];
  }));
}

const PORT_ENTRY = 'port';

// A module package's port entry, `@taskelith/<module>/port`: the frozen ports
// that plugins implement, without the module's domain or application code.
function isPortEntry(spec: string, workspaces: Map<string, string>): boolean {
  const dir = workspaces.get(packageName(spec));
  return dir !== undefined && dir.startsWith('packages/modules/') && spec === `${packageName(spec)}/${PORT_ENTRY}`;
}

function importTarget(file: string, spec: string, root: string, workspaces: Map<string, string>): string | null {
  if (spec.startsWith('.')) return toPosix(relative(root, resolve(dirname(file), spec)));
  const dir = workspaces.get(packageName(spec));
  if (!dir) return null;
  return isPortEntry(spec, workspaces) ? `${dir}/src/${PORT_ENTRY}.ts` : `${dir}/src/index.ts`;
}

// The product package that owns a path: the root package (`src/`), a workspace
// package under `packages/`, or an application under `apps/`.
function owningPackage(path: string): string | null {
  const match = path.match(/^(?:(src)\/|(packages\/(?:kernel|contracts|plugin-sdk|testing))\/|(packages\/(?:modules|adapters|plugins)\/[^/]+)\/|(apps\/[^/]+)\/)/);
  if (!match) return null;
  return match[1] ? 'root' : (match[2] ?? match[3] ?? match[4])!;
}

function isProductSource(path: string): boolean {
  const owner = owningPackage(path);
  if (owner === 'root') return true;
  return owner !== null && path.startsWith(`${owner}/src/`);
}

function isDevelopmentCode(path: string): boolean {
  const owner = owningPackage(path);
  return /^(?:scripts|test)\//.test(path) || (owner !== null && owner !== 'root' && path.startsWith(`${owner}/test/`));
}

function checkDevelopmentImport({ rel, spec, target, relative: isRelative }: ImportEdge): string[] {
  if (!isRelative || !target || !isProductSource(rel) || !isDevelopmentCode(target)) return [];
  return [`${rel}: product source cannot import development scripts or tests (${spec})`];
}

const TEST_HARNESS_PACKAGE = '@taskelith/testing';

// The test harness serves tests only; product code takes the real adapters.
function checkTestHarnessImport({ rel, spec }: ImportEdge): string[] {
  if (packageName(spec) !== TEST_HARNESS_PACKAGE || isDevelopmentCode(rel)) return [];
  const owner = owningPackage(rel);
  if (owner === null || owner === 'packages/testing') return [];
  return [`${rel}: product code cannot import the test harness "${spec}" (R03)`];
}

// At runtime the harness itself stands on the kernel and Node built-ins only.
function checkTestHarnessSource({ rel, spec, typeOnly }: ImportEdge): string[] {
  if (!rel.startsWith('packages/testing/src/') || typeOnly || spec.startsWith('.')) return [];
  if (spec.startsWith('node:') || isBuiltin(spec) || spec === KERNEL_PACKAGE) return [];
  return [`${rel}: the test harness may import only the kernel and Node built-ins at runtime, not "${spec}" (R03)`];
}

// The harness stands on the kernel alone, so every package's tests can use it.
function checkTestHarnessManifest(root: string, workspaces: Map<string, string>): string[] {
  const dir = workspaces.get(TEST_HARNESS_PACKAGE);
  if (dir === undefined) return [];
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  return workspaceDependencies(manifest)
    .filter((name) => name !== KERNEL_PACKAGE)
    .map((name) => `${dir}/package.json: the test harness may depend on no workspace package but the kernel, not "${name}" (R03)`);
}

function checkWorkspaceEncapsulation({ rel, spec, target, relative: isRelative, workspaces }: ImportEdge): string[] {
  const violations: string[] = [];
  const owner = owningPackage(rel);
  if (owner === null) return violations;
  if (isRelative && target && /(?:^|\/)(?:node_modules|dist)(?:\/|$)/.test(target)) {
    violations.push(`${rel}: relative import "${spec}" reaches installed or built code; import packages by name and sources by relative path (R03)`);
  }
  if (spec.startsWith('#')) {
    violations.push(`${rel}: package imports alias "${spec}" hides the imported package; import it by package name or relative path (R03)`);
  }
  if (spec.startsWith(WORKSPACE_SCOPE) && spec !== packageName(spec) && !isPortEntry(spec, workspaces)) {
    violations.push(`${rel}: workspace package "${packageName(spec)}" must be imported through its root export or port entry, not "${spec}" (F11/R03)`);
  }
  if (owner === 'root' && rel.startsWith('src/') && spec.startsWith(WORKSPACE_SCOPE)) {
    violations.push(`${rel}: the published root package cannot import private workspace package "${spec}" until a distribution strategy exists (R03)`);
  }
  const targetOwner = target ? owningPackage(target) : null;
  if (isRelative && targetOwner && targetOwner !== owner) {
    violations.push(`${rel}: relative import "${spec}" crosses into another package; import it by package name (F11/R03)`);
  }
  return violations;
}

function checkKernelImport({ rel, spec, target, relative: isRelative }: ImportEdge): string[] {
  if (!rel.startsWith('packages/kernel/src/')) return [];
  const violations: string[] = [];
  if (spec.startsWith(WORKSPACE_SCOPE)) violations.push(`${rel}: kernel cannot import workspace package "${spec}" (R03)`);
  if (isRelative && target && !target.startsWith('packages/kernel/')) {
    violations.push(`${rel}: kernel cannot import outside packages/kernel ("${spec}") (R03)`);
  }
  if (!isRelative && INFRA_SDKS.has(packageName(spec))) violations.push(`${rel}: kernel cannot import infrastructure SDK "${spec}" (R03)`);
  return violations;
}

function checkPluginImport({ rel, spec }: ImportEdge): string[] {
  const plugin = rel.match(/^packages\/plugins\/([^/]+)\/src\//)?.[1];
  if (!plugin || !spec.startsWith(WORKSPACE_SCOPE) || PLUGIN_ALLOWED_PACKAGES.has(packageName(spec))) return [];
  return [`${rel}: plugin "${plugin}" may import only the kernel, plugin SDK, and contracts packages, not "${spec}" (ADR 0003)`];
}

// The plugin SDK re-exports frozen ports for plugins, so it reads a module
// only for types and only through its port entry (ADR 0009).
function checkPluginSdkImport({ rel, spec, typeOnly, workspaces }: ImportEdge): string[] {
  if (!rel.startsWith('packages/plugin-sdk/src/')) return [];
  if (!workspaces.get(packageName(spec))?.startsWith('packages/modules/')) return [];
  if (isPortEntry(spec, workspaces) && typeOnly) return [];
  return [`${rel}: the plugin SDK may import module "${packageName(spec)}" only type-only through its port entry, not "${spec}" (ADR 0009)`];
}

function checkModuleImport({ rel, spec, target, relative: isRelative }: ImportEdge): string[] {
  const moduleMatch = rel.match(/^(?:src|packages)\/modules\/([^/]+)\/(.+)$/);
  if (!moduleMatch || moduleMatch[2]!.startsWith('test/')) return [];
  const [, moduleName, moduleRest] = moduleMatch;
  const layer = moduleRest!.match(/^(?:src\/)?(domain|application|ports)(?:\/|\.[cm]?[jt]sx?$)/)?.[1] ?? 'module-root';
  const violations: string[] = [];

  if (!isRelative && INFRA_SDKS.has(packageName(spec))) {
    violations.push(`${rel}: ${layer} layer in module "${moduleName}" cannot import infrastructure SDK "${spec}" (R03)`);
  }
  if (!target) return violations;
  if (/^(?:src|packages)\/(?:adapters|plugins)\//.test(target) || /^apps\//.test(target)) {
    violations.push(`${rel}: ${layer} layer in module "${moduleName}" cannot import adapter, plugin, or app "${spec}" (R03)`);
  }
  if (layer === 'domain' && new RegExp(`^(?:src|packages)/modules/${moduleName}/(?:src/)?(?:application|ports?)(?:\\.[cm]?[jt]sx?)?(?:/|$)`).test(target)) {
    violations.push(`${rel}: domain layer in module "${moduleName}" cannot import ${target} (R03)`);
  }
  const otherModule = target.match(/^(?:src|packages)\/modules\/([^/]+)\/(.+)$/);
  if (isRelative && otherModule && otherModule[1] !== moduleName && !/^(?:src\/)?index(?:\.[cm]?[jt]s)?$/.test(otherModule[2]!)) {
    violations.push(`${rel}: cross-module import into "${otherModule[1]}" must use its public index export, not internal path "${spec}" (F11/R03)`);
  }
  return violations;
}

function checkWebImport({ rel, spec, target, relative: isRelative }: ImportEdge): string[] {
  if (!rel.startsWith('apps/web/')) return [];
  const violations: string[] = [];
  if (spec.startsWith('node:') || isBuiltin(spec) || (!isRelative && INFRA_SDKS.has(packageName(spec)))) {
    violations.push(`${rel}: web SPA cannot import Node or server SDK "${spec}" (R03)`);
  }
  if (target && /^(?:apps\/(?:control-plane|worker|cli)|(?:src|packages)\/(?:modules|adapters|plugins))\//.test(target)) {
    violations.push(`${rel}: web SPA cannot import backend/worker module or adapter "${spec}" (R03)`);
  }
  return violations;
}

// Worker-only code: the worker app, worker process adapters, and each package
// that launches processes or imports worker-only code at runtime.
const WORKER_ONLY_PACKAGE = /^(?:apps\/worker|packages\/adapters\/worker-[^/]+)$/;
const PROCESS_LAUNCH_MODULES = new Set(['child_process', 'node-pty', 'execa', 'cross-spawn', 'shelljs', 'zx']);
const API_AND_BROWSER_APPS = new Set(['apps/control-plane', 'apps/web']);

function isProcessLaunchModule(spec: string): boolean {
  return PROCESS_LAUNCH_MODULES.has(packageName(spec.replace(/^node:/, '')));
}

function targetPackage({ rel, target }: ImportEdge): string | null {
  const owner = target ? owningPackage(target) : null;
  return owner !== owningPackage(rel) ? owner : null;
}

// Gives the import chain that makes a package worker-only, following runtime
// imports between packages until nothing changes.
function workerOnlyChains(edges: ImportEdge[]): (dir: string) => string | undefined {
  const chains = new Map<string, string>();
  const chainOf = (dir: string) => (WORKER_ONLY_PACKAGE.test(dir) ? `${dir} is worker-only` : chains.get(dir));
  for (const edge of edges) {
    const owner = owningPackage(edge.rel)!;
    if (isProcessLaunchModule(edge.spec) && !chains.has(owner)) chains.set(owner, `${owner} imports "${edge.spec}"`);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of edges) {
      const owner = owningPackage(edge.rel)!;
      const target = targetPackage(edge);
      const targetChain = target ? chainOf(target) : undefined;
      if (chainOf(owner) || !targetChain) continue;
      chains.set(owner, `${owner} imports ${target}; ${targetChain}`);
      changed = true;
    }
  }
  return chainOf;
}

// API and browser bundles hold what their app imports at runtime, so neither
// may reach code that launches processes (architecture section 6).
function checkWorkerOnlyReach(edges: ImportEdge[]): string[] {
  const runtimeEdges = edges.filter((edge) => !edge.erased && isProductSource(edge.rel));
  const chainOf = workerOnlyChains(runtimeEdges);
  return runtimeEdges.filter((edge) => API_AND_BROWSER_APPS.has(owningPackage(edge.rel)!)).flatMap((edge) => {
    if (isProcessLaunchModule(edge.spec)) {
      return [`${edge.rel}: API and browser code cannot import process-launching module "${edge.spec}" (worker-only)`];
    }
    const target = targetPackage(edge);
    const chain = target ? chainOf(target) : undefined;
    return chain ? [`${edge.rel}: API and browser code cannot import worker-only code "${edge.spec}" (${chain})`] : [];
  });
}

const IMPORT_RULES = [
  checkDevelopmentImport, checkTestHarnessImport, checkTestHarnessSource, checkWorkspaceEncapsulation, checkKernelImport, checkPluginImport, checkPluginSdkImport, checkModuleImport,
  checkWebImport,
];

export function checkWorkspaceBoundaries(root: string): string[] {
  const violations: string[] = [];
  const workspaces = workspacePackagesByName(root);
  const edges: ImportEdge[] = [];

  for (const file of walkFiles(root)) {
    const rel = toPosix(relative(root, file));
    if (extIsGo(rel, posix.basename(rel))) {
      violations.push(`${rel}: prohibited Go artifact in product repository (R02/R36)`);
      continue;
    }
    if (!/\.(?:[cm]?ts|tsx)$/.test(rel)) continue;

    for (const { spec, typeOnly, erased } of extractImports(rel, readFileSync(file, 'utf8'))) {
      const target = importTarget(file, spec, root, workspaces);
      const edge: ImportEdge = { rel, spec, target, relative: spec.startsWith('.'), typeOnly, erased, workspaces };
      if (edge.relative && edge.target!.startsWith('..')) {
        violations.push(`${rel}: import escapes repository root (${spec})`);
        continue;
      }
      for (const rule of IMPORT_RULES) violations.push(...rule(edge));
      edges.push(edge);
    }
  }

  return [...violations, ...checkTestHarnessManifest(root, workspaces), ...checkWorkerOnlyReach(edges)];
}

function extIsGo(rel: string, base: string): boolean {
  return extname(rel) === '.go' || base === 'go.mod' || base === 'go.sum' || base === 'go.work';
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkWorkspaceBoundaries(process.cwd());
  if (violations.length > 0) {
    for (const v of violations) process.stderr.write(`Boundary violation: ${v}\n`);
    process.exitCode = 1;
  } else {
    console.log('Workspace and hexagonal boundary checks passed.');
  }
}
