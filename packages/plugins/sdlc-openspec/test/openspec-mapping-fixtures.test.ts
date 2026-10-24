import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  runSdlcFrameworkConformance,
  type SdlcConformanceCase,
  type SdlcFramework,
  type SdlcFrameworkCapabilities,
  type SdlcOperation,
} from '@taskelith/sdlc';
import {
  ARCHIVE_DATE,
  BASE_SPEC_DIGESTS,
  CAPABILITIES,
  MAPPING_FIXTURES,
  OPENSPEC_VERSION,
  SPEC_DRIVEN_ARTIFACTS,
  SPEC_DRIVEN_WORKFLOW,
  WORKING_COPY,
  expectedInstructionText,
  mappingCases,
  workItemOf,
} from './openspec-mapping-cases.ts';

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
const OPENSPEC_PACKAGE = join(REPOSITORY, 'node_modules/@fission-ai/openspec');

// Until the adapter exists (G1 item 11), a framework that answers each request
// with the expected outcome of its case lets the conformance suite check the
// expected outputs themselves: their shapes, domain parsing, and capabilities.
function replayFramework(capabilities: SdlcFrameworkCapabilities, cases: readonly SdlcConformanceCase[]): SdlcFramework {
  const answer = async (operation: SdlcOperation, request: unknown): Promise<Result<any>> => {
    const match = cases.find((testCase) => testCase.operation === operation && isDeepStrictEqual(testCase.request, request));
    if (match === undefined) return err(failure('internal', `no fixture case for ${operation}`));
    return match.expected.ok ? ok(match.expected.value) : err(failure(match.expected.code, 'replayed fixture failure'));
  };
  return {
    capabilities,
    discoverWorkItems: (request) => answer('discoverWorkItems', request),
    resolveWorkflow: (request) => answer('resolveWorkflow', request),
    describeArtifacts: (request) => answer('describeArtifacts', request),
    inspectArtifactRevisions: (request) => answer('inspectArtifactRevisions', request),
    prepareStageInstructions: (request) => answer('prepareStageInstructions', request),
    validateStructure: (request) => answer('validateStructure', request),
    finalize: (request) => answer('finalize', request),
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

// The pinned CLI from this repository's lockfile, without telemetry or version
// checks, so that the test makes no network request.
function openspec(...args: string[]): any {
  const output = execFileSync(join(REPOSITORY, 'node_modules/.bin/openspec'), [...args, '--json'], {
    cwd: WORKING_COPY,
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1' },
  });
  return JSON.parse(output);
}

test('the expected OpenSpec outputs pass the framework-neutral conformance suite', async () => {
  const cases = mappingCases(WORKING_COPY);

  const report = await runSdlcFrameworkConformance(replayFramework(CAPABILITIES, cases), cases);

  assert.deepEqual(report.findings, []);
  assert.equal(report.cases, cases.length);
});

test('the fixtures cover a feature, a fix, and a documentation change', () => {
  assert.deepEqual(MAPPING_FIXTURES.map((fixture) => fixture.kind), ['feature', 'fix', 'documentation']);
});

test('every expected revision digest is the digest of its fixture file', () => {
  for (const fixture of MAPPING_FIXTURES) {
    for (const file of fixture.files) {
      assert.equal(sha256(join(WORKING_COPY, 'openspec/changes', fixture.change, file.path)), file.sha256, `${fixture.change}/${file.path}`);
    }
  }
});

test('each fixture change is its archived change byte for byte', () => {
  for (const { change } of MAPPING_FIXTURES) {
    const archived = join(REPOSITORY, 'openspec/changes/archive', `${ARCHIVE_DATE}-${change}`);
    const fixture = join(WORKING_COPY, 'openspec/changes', change);
    assert.deepEqual(filesUnder(fixture), filesUnder(archived), change);
    for (const path of filesUnder(archived)) {
      assert.ok(readFileSync(join(fixture, path)).equals(readFileSync(join(archived, path))), `${change}/${path}`);
    }
  }
});

test('the working copy holds only the fixture changes, the repository configuration, and the base specs', () => {
  const changeFiles = MAPPING_FIXTURES.flatMap(({ change }) => {
    const archived = join(REPOSITORY, 'openspec/changes/archive', `${ARCHIVE_DATE}-${change}`);
    return filesUnder(archived).map((path) => `openspec/changes/${change}/${path}`);
  });
  const expected = [...changeFiles, 'openspec/config.yaml', ...Object.keys(BASE_SPEC_DIGESTS)].sort();
  assert.deepEqual(filesUnder(WORKING_COPY), expected);
  assert.ok(readFileSync(join(WORKING_COPY, 'openspec/config.yaml')).equals(readFileSync(join(REPOSITORY, 'openspec/config.yaml'))));
  for (const [path, digest] of Object.entries(BASE_SPEC_DIGESTS)) assert.equal(sha256(join(WORKING_COPY, path)), digest, path);
});

test('the workflow digest is the digest of the pinned spec-driven schema', () => {
  assert.equal(JSON.parse(readFileSync(join(OPENSPEC_PACKAGE, 'package.json'), 'utf8')).version, OPENSPEC_VERSION);
  assert.equal(SPEC_DRIVEN_WORKFLOW.digest, `sha256:${sha256(join(OPENSPEC_PACKAGE, 'schemas/spec-driven/schema.yaml'))}`);
});

test('the expected outputs agree with the pinned OpenSpec CLI', () => {
  const listed = openspec('list').changes.map((change: { name: string }) => change.name).sort();
  assert.deepEqual(listed, MAPPING_FIXTURES.map((fixture) => fixture.change).sort());

  for (const fixture of MAPPING_FIXTURES) {
    const status = openspec('status', '--change', fixture.change);
    assert.equal(status.schemaName, 'spec-driven');
    const described = status.artifacts.map((artifact: { id: string; requires: string[]; status: string }) => ({
      artifactId: artifact.id,
      stageId: artifact.id,
      requires: artifact.requires,
      present: artifact.status === 'done',
    }));
    assert.deepEqual(described, SPEC_DRIVEN_ARTIFACTS, fixture.change);

    for (const stageId of [fixture.instructions.stageId, 'apply']) {
      assert.equal(openspec('instructions', stageId, '--change', fixture.change).instruction, expectedInstructionText(stageId));
    }
  }

  const validation = openspec('validate', '--all', '--strict');
  const expectedItems = [...MAPPING_FIXTURES.map((fixture) => workItemOf(fixture).nativeReference), 'integration-flow', 'trust-and-operational-foundation'];
  assert.deepEqual(validation.items.map((item: { id: string; valid: boolean }) => [item.id, item.valid]).sort(), expectedItems.sort().map((id) => [id, true]));
});
