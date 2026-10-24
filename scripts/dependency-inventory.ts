import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { workspacePackageDirs } from './workspace-packages.ts';

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

interface LockedPackage {
  version: string;
  integrity?: string;
  dev?: boolean;
  inBundle?: boolean;
  optional?: boolean;
  link?: boolean;
  resolved?: string;
}

// npm records each workspace package twice: a `node_modules/<name>` link and
// the package directory itself. Both are first-party product code, not
// dependencies, so the inventory skips them, but only for links that point to
// a declared workspace package under the same name; packages installed inside
// a workspace package's own node_modules are still inventoried.
function workspaceDirectories(root: string, packages: Record<string, LockedPackage>): Set<string> {
  const declared = new Map(workspacePackageDirs(root).map(dir => [dir, JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name]));
  const directories = new Set<string>();
  for (const [path, locked] of Object.entries(packages)) {
    if (locked.link !== true) continue;
    const target = locked.resolved ?? '';
    const name = path.slice('node_modules/'.length);
    if (!path.startsWith('node_modules/') || path.split('/').some(part => part === '..') || declared.get(target) !== name || packages[target] === undefined) {
      throw new Error(`Unsupported linked package: ${path} -> ${target}`);
    }
    directories.add(target);
  }
  return directories;
}

function isInstallationPath(path: string, workspaces: Set<string>): boolean {
  return path.startsWith('node_modules/') || [...workspaces].some(directory => path.startsWith(`${directory}/node_modules/`));
}

export function collectLicenses(root: string, packages: Record<string, LockedPackage>) {
  const workspaces = workspaceDirectories(root, packages);
  return Object.entries(packages)
    .filter(([path, locked]) => path !== '' && locked.link !== true && !workspaces.has(path))
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([path, locked]) => {
      if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => part === '..') || !isInstallationPath(path, workspaces)) {
        throw new Error(`Unsafe lockfile installation path: ${path}`);
      }
      const directory = join(root, path);
      const manifestPath = join(directory, 'package.json');
      if (!existsSync(manifestPath)) throw new Error(`Missing installed package: ${path}; run npm ci --ignore-scripts`);
      if (lstatSync(directory).isSymbolicLink()) throw new Error(`Linked package cannot establish inventory: ${path}`);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.version !== locked.version) throw new Error(`Installed version differs from lockfile: ${path}`);
      const licenseFiles = readdirSync(directory).sort().filter(name => /^(licen[cs]e|copying|notice)([._-].*)?$/i.test(name))
        .filter(name => lstatSync(join(directory, name)).isFile())
        .map(name => ({ path: `${path}/${name}`, sha256: sha256(readFileSync(join(directory, name))) }));
      const declaration = manifest.license ?? manifest.licenses ?? null;
      return {
        path, name: manifest.name, version: manifest.version,
        integrity: locked.integrity ?? null,
        development: locked.dev === true, bundled: locked.inBundle === true, optional: locked.optional === true,
        declaration, declarationField: manifest.license ? 'license' : manifest.licenses ? 'licenses' : null,
        manifestSha256: sha256(readFileSync(manifestPath)), licenseFiles,
        gaps: [
          ...(declaration === null ? ['missing-license-declaration'] : []),
          ...(licenseFiles.length === 0 ? ['missing-top-level-license-text'] : []),
        ],
      };
    });
}

const reviewStatuses = ['text-located', 'notice-only', 'declaration-only'] as const;
export type LicenseReviewStatus = typeof reviewStatuses[number];

export interface LicenseReview {
  path: string;
  version: string;
  manifestSha256: string;
  status: LicenseReviewStatus;
  finding: string;
  evidence: string[];
}

interface InventoriedPackage {
  path: string;
  version: string;
  manifestSha256: string;
  gaps: string[];
}

const reviewKey = (entry: { path: string; version: string; manifestSha256: string }): string =>
  `${entry.path}@${entry.version}#${entry.manifestSha256}`;

const isNonBlankString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function invalidReviewField(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return 'entry';
  const review = entry as Record<string, unknown>;
  for (const field of ['path', 'version', 'manifestSha256', 'finding']) {
    if (!isNonBlankString(review[field])) return field;
  }
  if (!reviewStatuses.includes(review.status as LicenseReviewStatus)) return 'status';
  if (!Array.isArray(review.evidence) || review.evidence.length === 0 || !review.evidence.every(isNonBlankString)) return 'evidence';
  return null;
}

export function parseLicenseReviews(document: unknown): LicenseReview[] {
  const reviews = (document as { reviews?: unknown } | null)?.reviews;
  if (!Array.isArray(reviews)) throw new Error('License coverage reviews must contain a reviews array');
  reviews.forEach((entry, index) => {
    const field = invalidReviewField(entry);
    if (field) throw new Error(`Incomplete license coverage review at index ${index}: invalid ${field}`);
  });
  return reviews as LicenseReview[];
}

export function checkLicenseReviews(packages: InventoriedPackage[], reviews: LicenseReview[]): void {
  const gapKeys = new Set(packages.filter(pkg => pkg.gaps.length > 0).map(reviewKey));
  const reviewKeys = new Set(reviews.map(reviewKey));
  const unreviewed = [...gapKeys].filter(key => !reviewKeys.has(key));
  const stale = [...reviewKeys].filter(key => !gapKeys.has(key));
  if (reviewKeys.size !== reviews.length) throw new Error('Duplicate license coverage review entries');
  if (unreviewed.length > 0 || stale.length > 0) {
    throw new Error(`License coverage reviews out of date; unreviewed: [${unreviewed.join(', ')}]; stale: [${stale.join(', ')}]`);
  }
}

export function normalizeSbom(input: string): string {
  const bom = JSON.parse(input);
  if (bom.bomFormat !== 'CycloneDX' || !Array.isArray(bom.components) || !Array.isArray(bom.dependencies)) {
    throw new Error('Expected an npm-generated CycloneDX dependency graph');
  }
  delete bom.serialNumber;
  if (bom.metadata) delete bom.metadata.timestamp;
  bom.components.sort((a: { 'bom-ref': string }, b: { 'bom-ref': string }) => a['bom-ref'].localeCompare(b['bom-ref'], 'en'));
  bom.dependencies.sort((a: { ref: string }, b: { ref: string }) => a.ref.localeCompare(b.ref, 'en'));
  for (const dependency of bom.dependencies) dependency.dependsOn?.sort();
  return JSON.stringify(bom, null, 2) + '\n';
}

export function checkEvidence(actual: string, expectedPath: string): void {
  if (!existsSync(expectedPath) || readFileSync(expectedPath, 'utf8') !== actual) {
    throw new Error(`Dependency evidence drift: ${expectedPath}; regenerate with npm run inventory:dependencies and review`);
  }
}
