import assert from 'node:assert/strict';
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
import { CAPABILITIES, MAPPING_FIXTURES, SPECKIT_VERSION, SPECKIT_WORKFLOW, WORKING_COPY, mappingCases } from './speckit-mapping-cases.ts';
import { SPECKIT_CAPABILITIES, SpecKitNormaliser } from './speckit-normaliser.ts';

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
const CAPTURE = join(REPOSITORY, `docs/qualification/speckit-${SPECKIT_VERSION}/scaffold`);
const DERIVED_LABEL = /^<!-- Derived fixture: written by hand from the pinned SpecKit 1\.2\.3 template \.specify\/templates\/(spec|plan|tasks)-template\.md, with content from the archived OpenSpec change ([a-z-]+)\. No harness has run SpecKit's agent steps\. -->$/m;

// Replaying each case's expected outcome lets the conformance suite check the
// expected outputs themselves, apart from the normaliser.
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

test('the expected SpecKit outputs pass the framework-neutral conformance suite', async () => {
  const cases = mappingCases(WORKING_COPY);

  const report = await runSdlcFrameworkConformance(replayFramework(CAPABILITIES, cases), cases);

  assert.deepEqual(report.findings, []);
  assert.equal(report.cases, cases.length);
});

test('the normaliser turns the SpecKit fixtures into the expected outputs', async () => {
  const cases = mappingCases(WORKING_COPY);

  const report = await runSdlcFrameworkConformance(new SpecKitNormaliser(), cases);

  assert.deepEqual(report.findings, []);
  assert.equal(report.cases, cases.length);
  assert.deepEqual(SPECKIT_CAPABILITIES, CAPABILITIES);
});

test('the normaliser reports a directory that is not a SpecKit project as not found', async () => {
  const workingCopy = join(WORKING_COPY, 'specs');
  const normaliser = new SpecKitNormaliser();

  const results = [
    await normaliser.discoverWorkItems({ workingCopy }),
    await normaliser.resolveWorkflow({ workingCopy }),
    await normaliser.describeArtifacts({ workingCopy, workItem: MAPPING_FIXTURES[0]!.feature }),
  ];

  assert.deepEqual(results.map((result) => result.ok || result.error.code), ['not-found', 'not-found', 'not-found']);
});

test('the fixtures cover a feature, a fix, and a documentation change', () => {
  assert.deepEqual(MAPPING_FIXTURES.map((fixture) => fixture.kind), ['feature', 'fix', 'documentation']);
});

test('every expected revision digest is the digest of its fixture file', () => {
  for (const fixture of MAPPING_FIXTURES) {
    for (const file of fixture.files) {
      assert.equal(sha256(join(WORKING_COPY, 'specs', fixture.feature, file.path)), file.sha256, `${fixture.feature}/${file.path}`);
    }
  }
});

test('the working copy is the pinned scaffold capture plus the derived features', () => {
  const scaffold = filesUnder(WORKING_COPY).filter((path) => !path.startsWith('specs/'));
  assert.deepEqual(scaffold, filesUnder(CAPTURE));
  for (const path of scaffold) {
    assert.ok(readFileSync(join(WORKING_COPY, path)).equals(readFileSync(join(CAPTURE, path))), path);
  }
  const derived = MAPPING_FIXTURES.flatMap((fixture) => fixture.files.map((file) => `specs/${fixture.feature}/${file.path}`)).sort();
  assert.deepEqual(filesUnder(WORKING_COPY).filter((path) => path.startsWith('specs/')), derived);
});

test('every derived artifact is labelled as derived from its pinned template', () => {
  for (const fixture of MAPPING_FIXTURES) {
    for (const file of fixture.files) {
      const label = readFileSync(join(WORKING_COPY, 'specs', fixture.feature, file.path), 'utf8').match(DERIVED_LABEL);
      assert.deepEqual(label?.slice(1), [file.artifactId, fixture.sourceChange], `${fixture.feature}/${file.path}`);
    }
  }
});

test('the workflow digest is the digest of the bundled speckit workflow', () => {
  assert.equal(SPECKIT_WORKFLOW.digest, `sha256:${sha256(join(WORKING_COPY, '.specify/workflows/speckit/workflow.yml'))}`);
});
