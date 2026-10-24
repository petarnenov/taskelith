import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkEvidence, checkLicenseReviews, collectLicenses, normalizeSbom, parseLicenseReviews } from './dependency-inventory.ts';
import { checkInventoryInputs, INVENTORY_INPUTS, sha256 } from './inventory-provenance.ts';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Usage: inventory-dependencies.ts [--check]');
const expectedNode = readFileSync('.nvmrc', 'utf8').trim();
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const npmPins = [...workflow.matchAll(/npm install --global npm@([\d.]+) --ignore-scripts/g)].map(match => match[1]);
assert(npmPins.length === 2 && new Set(npmPins).size === 1, 'Expected matching npm pins in both CI jobs');
assert.equal(process.versions.node, expectedNode, 'Inventory requires the exact .nvmrc Node version');
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8', timeout: 30_000 }).trim();
assert.equal(npmVersion, npmPins[0], 'Inventory requires the exact CI npm version');

const directory = 'docs/dependencies';
const readInput = (path: string) => readFileSync(path);
if (args[0] === '--check') {
  const retained = JSON.parse(readFileSync(join(directory, 'licenses.json'), 'utf8'));
  checkInventoryInputs(retained.provenance, readInput);
}

const root = process.cwd();
const lockText = readFileSync('package-lock.json', 'utf8');
const packages = collectLicenses(root, JSON.parse(lockText).packages);
const sbom = normalizeSbom(execFileSync('npm', ['sbom', '--sbom-format=cyclonedx', '--package-lock-only'], {
  encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
}));
const provenance = Object.fromEntries(INVENTORY_INPUTS.map(path => [path, sha256(readInput(path))]));
const inventory = JSON.stringify({
  schemaVersion: 1,
  toolchain: { node: process.versions.node, npm: npmVersion },
  provenance,
  scope: 'Locked npm installation paths; top-level license/notice files only; global binaries and nested vendored code excluded',
  packageCount: packages.length,
  packagesWithGaps: packages.filter(pkg => pkg.gaps.length > 0).length,
  packages,
}, null, 2) + '\n';

for (const [name, content] of [['licenses.json', inventory], ['sbom.cdx.json', sbom]]) {
  const path = join(directory, name);
  if (args[0] === '--check') checkEvidence(content, path);
  else { mkdirSync(directory, { recursive: true }); writeFileSync(path, content); }
}
const reviews = parseLicenseReviews(JSON.parse(readFileSync(join(directory, 'license-reviews.json'), 'utf8')));
checkLicenseReviews(packages, reviews);
const declarationOnly = reviews.filter(review => review.status === 'declaration-only').length;
console.log(`${args[0] === '--check' ? 'Verified' : 'Generated'} ${packages.length} package paths; ${packages.filter(pkg => pkg.gaps.length > 0).length} with license coverage gaps (all reviewed; ${declarationOnly} declaration-only)`);
