import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkEvidence, checkLicenseReviews, collectLicenses, normalizeSbom, parseLicenseReviews, sha256 } from '../scripts/dependency-inventory.ts';
import { checkInventoryInputs, INVENTORY_INPUTS, staleInventoryInputs } from '../scripts/inventory-provenance.ts';
import type { LicenseReview } from '../scripts/dependency-inventory.ts';

test('bundled legacy licenses retain text hashes and expose missing coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-license-fixture-'));
  try {
    const bundled = 'node_modules/tool/node_modules/legacy';
    mkdirSync(join(root, bundled), { recursive: true });
    writeFileSync(join(root, bundled, 'package.json'), JSON.stringify({ name: 'legacy', version: '1.0.0', licenses: [{ type: 'MIT' }] }));
    writeFileSync(join(root, bundled, 'LICENSE'), 'fixture license');
    mkdirSync(join(root, 'node_modules/missing'), { recursive: true });
    writeFileSync(join(root, 'node_modules/missing/package.json'), JSON.stringify({ name: 'missing', version: '2.0.0' }));
    const result = collectLicenses(root, {
      [bundled]: { version: '1.0.0', inBundle: true },
      'node_modules/missing': { version: '2.0.0' },
    });
    const legacy = result.find(pkg => pkg.name === 'legacy')!;
    assert(legacy.bundled);
    assert.equal(legacy.declarationField, 'licenses');
    assert.deepEqual(legacy.declaration, [{ type: 'MIT' }]);
    assert.deepEqual(legacy.licenseFiles, [{ path: `${bundled}/LICENSE`, sha256: sha256('fixture license') }]);
    assert.deepEqual(legacy.gaps, []);
    assert.deepEqual(result.find(pkg => pkg.name === 'missing')!.gaps, ['missing-license-declaration', 'missing-top-level-license-text']);
    assert(!JSON.stringify(result).includes(root));
    assert.throws(() => collectLicenses(root, { [bundled]: { version: '9.0.0' } }), /differs from lockfile/);
    assert.throws(() => collectLicenses(root, { 'node_modules/absent': { version: '1.0.0' } }), /Missing installed package/);
    assert.throws(() => collectLicenses(root, { 'node_modules/../../outside': { version: '1.0.0' } }), /Unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('workspace packages are first-party and skipped, while their installed dependencies are inventoried', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-license-workspace-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/modules/*'] }));
    const nested = 'packages/modules/sdlc/node_modules/dep';
    mkdirSync(join(root, nested), { recursive: true });
    writeFileSync(join(root, 'packages/modules/sdlc/package.json'), JSON.stringify({ name: '@taskelith/sdlc', version: '0.0.0' }));
    writeFileSync(join(root, nested, 'package.json'), JSON.stringify({ name: 'dep', version: '1.0.0', license: 'MIT' }));
    writeFileSync(join(root, nested, 'LICENSE'), 'dep license');
    const result = collectLicenses(root, {
      'node_modules/@taskelith/sdlc': { version: '', link: true, resolved: 'packages/modules/sdlc' },
      'packages/modules/sdlc': { version: '0.0.0' },
      [nested]: { version: '1.0.0' },
    });
    assert.deepEqual(result.map(pkg => pkg.path), [nested]);
    const workspace = { 'packages/modules/sdlc': { version: '0.0.0' } };
    for (const [path, resolved] of [
      ['node_modules/evil', '../outside'],
      ['node_modules/../../outside', 'packages/modules/sdlc'],
      ['node_modules/@taskelith/other', 'packages/modules/sdlc'],
      ['node_modules/@taskelith/sdlc', 'packages/./modules/sdlc'],
      ['node_modules/@taskelith/sdlc', 'packages/modules/not-a-workspace'],
      ['node_modules/dep', nested],
    ]) {
      assert.throws(() => collectLicenses(root, { ...workspace, [path]: { version: '', link: true, resolved } }), /Unsupported linked package/, `${path} -> ${resolved}`);
    }
    assert.throws(() => collectLicenses(root, { 'node_modules/@taskelith/sdlc': { version: '', link: true, resolved: 'packages/modules/sdlc' } }), /Unsupported linked package/);
    assert.throws(() => collectLicenses(root, { 'packages/modules/sdlc': { version: '0.0.0' } }), /Unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('SBOM normalization retains graph and metadata while removing volatile identifiers', () => {
  const input = {
    bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: 'urn:uuid:first',
    metadata: { timestamp: 'first', tools: [{ name: 'npm', version: '12.2.1' }] },
    components: [{ 'bom-ref': 'b', licenses: [{ license: { id: 'MIT' } }] }, { 'bom-ref': 'a' }],
    dependencies: [{ ref: 'b', dependsOn: ['b', 'a'] }, { ref: 'a', dependsOn: [] }],
  };
  const first = normalizeSbom(JSON.stringify(input));
  const second = normalizeSbom(JSON.stringify({ ...input, serialNumber: 'urn:uuid:second', metadata: { ...input.metadata, timestamp: 'second' } }));
  assert.equal(first, second);
  const output = JSON.parse(first);
  assert.deepEqual(output.dependencies, [{ ref: 'a', dependsOn: [] }, { ref: 'b', dependsOn: ['a', 'b'] }]);
  assert.deepEqual(output.components[1].licenses, input.components[0].licenses);
  assert.deepEqual(output.metadata.tools, input.metadata.tools);
  assert.throws(() => normalizeSbom('{}'), /CycloneDX/);
});

test('drift detection leaves retained evidence unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-evidence-fixture-'));
  try {
    const path = join(root, 'evidence.json');
    writeFileSync(path, 'reviewed evidence');
    checkEvidence('reviewed evidence', path);
    assert.throws(() => checkEvidence('changed evidence', path), /drift/);
    assert.equal(readFileSync(path, 'utf8'), 'reviewed evidence');
    assert.throws(() => checkEvidence('new evidence', join(root, 'absent')), /drift/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inventory inputs are stale when their content differs from the recorded provenance', () => {
  const contents: Record<string, string> = Object.fromEntries(INVENTORY_INPUTS.map(path => [path, `content of ${path}`]));
  const readInput = (path: string) => Buffer.from(contents[path]);
  const provenance = Object.fromEntries(INVENTORY_INPUTS.map(path => [path, sha256(contents[path])]));
  assert.deepEqual(staleInventoryInputs(provenance, readInput), []);
  checkInventoryInputs(provenance, readInput);
  contents['package-lock.json'] = 'merged lockfile';
  assert.deepEqual(staleInventoryInputs(provenance, readInput), ['package-lock.json']);
  assert.throws(() => checkInventoryInputs(provenance, readInput),
    /^Error: Dependency inventory is stale; changed inputs: package-lock\.json; regenerate with make dependency-inventory/);
  assert.deepEqual(staleInventoryInputs(undefined, readInput), [...INVENTORY_INPUTS]);
  assert.deepEqual(staleInventoryInputs('not an object', readInput), [...INVENTORY_INPUTS]);
});

test('license coverage reviews must match every gap by exact manifest', () => {
  const gap = { path: 'node_modules/a', version: '1.0.0', manifestSha256: 'aaa', gaps: ['missing-top-level-license-text'] };
  const covered = { path: 'node_modules/b', version: '1.0.0', manifestSha256: 'bbb', gaps: [] };
  const review: LicenseReview = {
    path: 'node_modules/a', version: '1.0.0', manifestSha256: 'aaa',
    status: 'notice-only', finding: 'README statement only', evidence: ['https://example.test/a'],
  };
  checkLicenseReviews([gap, covered], [review]);
  assert.throws(() => checkLicenseReviews([gap], []), /unreviewed: \[node_modules\/a@1\.0\.0#aaa\]/);
  assert.throws(() => checkLicenseReviews([{ ...gap, manifestSha256: 'changed' }], [review]), /stale: \[node_modules\/a@1\.0\.0#aaa\]/);
  assert.throws(() => checkLicenseReviews([covered], [{ ...review, path: 'node_modules/b', manifestSha256: 'bbb' }]), /stale/);
  assert.throws(() => checkLicenseReviews([gap], [review, review]), /Duplicate/);
});

test('license coverage review parsing rejects malformed untrusted entries', () => {
  const review = {
    path: 'node_modules/a', version: '1.0.0', manifestSha256: 'aaa',
    status: 'notice-only', finding: 'README statement only', evidence: ['https://example.test/a'],
  };
  assert.deepEqual(parseLicenseReviews({ reviews: [review] }), [review]);
  assert.throws(() => parseLicenseReviews(null), /reviews array/);
  assert.throws(() => parseLicenseReviews({ reviews: {} }), /reviews array/);
  for (const [entry, field] of [
    [null, 'entry'],
    [{ ...review, path: 7 }, 'path'],
    [{ ...review, finding: 123 }, 'finding'],
    [{ ...review, finding: '   ' }, 'finding'],
    [{ ...review, status: 'approved' }, 'status'],
    [{ ...review, evidence: 'https://example.test/a' }, 'evidence'],
    [{ ...review, evidence: [] }, 'evidence'],
    [{ ...review, evidence: [''] }, 'evidence'],
    [{ ...review, evidence: undefined }, 'evidence'],
  ] as const) {
    assert.throws(() => parseLicenseReviews({ reviews: [review, entry] }), new RegExp(`index 1: invalid ${field}$`));
  }
});
