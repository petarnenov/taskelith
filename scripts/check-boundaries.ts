import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', '.openspec']);
const INFRA_SDKS = new Set([
  'pg', 'postgres', 'nats', 'neo4j-driver', 'better-sqlite3', 'sqlite3',
  'express', 'fastify', 'koa', 'ws', 'undici', 'axios', 'node-pty',
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

function extractImports(filePath: string, source: string): string[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      specs.push(node.arguments[0]!.text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      specs.push(node.arguments[0]!.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specs.push(node.argument.literal.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      specs.push(node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

function toPosix(p: string): string {
  return p.split('\\').join('/');
}

function resolveImportPath(fromFile: string, specifier: string, root: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = resolve(dirname(fromFile), specifier);
  return toPosix(relative(root, resolved));
}

export function checkWorkspaceBoundaries(root: string): string[] {
  const violations: string[] = [];
  const files = walkFiles(root);

  for (const file of files) {
    const rel = toPosix(relative(root, file));
    const base = posix.basename(rel);

    if (extIsGo(rel, base)) {
      violations.push(`${rel}: prohibited Go artifact in product repository (R02/R36)`);
      continue;
    }

    if (!/\.(?:[cm]?ts|tsx)$/.test(rel)) continue;

    const specs = extractImports(rel, readFileSync(file, 'utf8'));

    for (const spec of specs) {
      const targetRel = resolveImportPath(file, spec, root);

      if (targetRel && targetRel.startsWith('..')) {
        violations.push(`${rel}: import escapes repository root (${spec})`);
        continue;
      }

      if (rel.startsWith('src/') && targetRel && /^(?:scripts|test)\//.test(targetRel)) {
        violations.push(`${rel}: product source cannot import development scripts or tests (${spec})`);
      }

      const moduleMatch = rel.match(/^(?:src|packages)\/modules\/([^/]+)\/(.+)$/);
      if (moduleMatch) {
        const [, moduleName, moduleRest] = moduleMatch;
        const layerMatch = moduleRest!.match(/^(domain|application|ports)\//);
        const layer = layerMatch ? layerMatch[1]! : 'module-root';
        const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;

        if (!spec.startsWith('.') && INFRA_SDKS.has(pkgName)) {
          violations.push(`${rel}: ${layer} layer in module "${moduleName}" cannot import infrastructure SDK "${spec}" (R03)`);
        }

        if (targetRel) {
          if (/^(?:src|packages)\/(?:adapters|plugins)\//.test(targetRel) || /^apps\//.test(targetRel)) {
            violations.push(`${rel}: ${layer} layer in module "${moduleName}" cannot import adapter, plugin, or app "${spec}" (R03)`);
          }

          if (layer === 'domain' && new RegExp(`^(?:src|packages)/modules/${moduleName}/(?:application|ports)/`).test(targetRel)) {
            violations.push(`${rel}: domain layer in module "${moduleName}" cannot import ${targetRel} (R03)`);
          }

          const otherModule = targetRel.match(/^(?:src|packages)\/modules\/([^/]+)\/(.+)$/);
          if (otherModule && otherModule[1] !== moduleName) {
            const [, targetMod, targetSubpath] = otherModule;
            if (!/^index(?:\.[cm]?[jt]s)?$/.test(targetSubpath!)) {
              violations.push(`${rel}: cross-module import into "${targetMod}" must use its public index export, not internal path "${spec}" (F11/R03)`);
            }
          }
        }
      }

      if (rel.startsWith('apps/web/')) {
        const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
        if (spec.startsWith('node:') || isBuiltin(spec) || (!spec.startsWith('.') && INFRA_SDKS.has(pkgName))) {
          violations.push(`${rel}: web SPA cannot import Node or server SDK "${spec}" (R03)`);
        }
        if (targetRel && (/^(?:apps\/(?:control-plane|worker|cli)|(?:src|packages)\/(?:modules|adapters|plugins))\//.test(targetRel))) {
          violations.push(`${rel}: web SPA cannot import backend/worker module or adapter "${spec}" (R03)`);
        }
      }
    }
  }

  return violations;
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
