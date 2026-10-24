import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runSdlcFrameworkConformance, type SdlcFramework } from '@taskelith/sdlc';
import {
  OPENSPEC_CAPABILITIES,
  OPENSPEC_PLUGIN_MANIFEST,
  OpenSpecFramework,
  registerOpenSpecFramework,
  type OpenSpecCliOptions,
} from '@taskelith/sdlc-openspec';
import { ARCHIVE_DATE, CAPABILITIES, MAPPING_FIXTURES, WORKING_COPY, mappingCases, revisionsOf } from './openspec-mapping-cases.ts';

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
const FIXED_ARCHIVE_DATE = new URL('./fixed-archive-date.mjs', import.meta.url);
const SCRATCH = mkdtempSync(join(tmpdir(), 'taskelith-openspec-adapter-'));

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

// The pinned CLI from the lockfile, with its clock fixed to the fixtures'
// archive date.
const PINNED_CLI: OpenSpecCliOptions = {
  executable: join(REPOSITORY, 'node_modules/.bin/openspec'),
  environment: { NODE_OPTIONS: `--import="${FIXED_ARCHIVE_DATE.href}"`, TZ: 'UTC' },
};

const FIXTURE = MAPPING_FIXTURES[0]!;

// Finalization archives changes, so every test works on its own copy of the
// fixture working copy, never on this repository.
function workingCopy(): string {
  const copy = mkdtempSync(join(SCRATCH, 'working-copy-'));
  cpSync(WORKING_COPY, copy, { recursive: true });
  return copy;
}

function framework(options: OpenSpecCliOptions = PINNED_CLI): SdlcFramework {
  return new OpenSpecFramework(options);
}

// A stand-in CLI: `version` reports `version`, and every other command runs
// `body`, a Node.js script.
function fakeCli(body: string, version = '1.14.3'): OpenSpecCliOptions {
  const executable = join(mkdtempSync(join(SCRATCH, 'fake-cli-')), 'openspec');
  const versionOutput = JSON.stringify({ version });
  writeFileSync(executable, `#!/usr/bin/env node\nif (process.argv[2] === 'version') console.log('${versionOutput}');\nelse { ${body} }\n`);
  chmodSync(executable, 0o755);
  return { executable };
}

function printing(output: string): string {
  return `process.stdout.write(${JSON.stringify(output)});`;
}

test('the adapter passes the conformance suite on the OpenSpec fixtures', async () => {
  const cases = mappingCases(workingCopy());
  // Archiving last keeps every change active for the cases that read it.
  const ordered = [...cases.filter((testCase) => testCase.operation !== 'finalize'), ...cases.filter((testCase) => testCase.operation === 'finalize')];

  const report = await runSdlcFrameworkConformance(framework(), ordered);

  assert.deepEqual(report.findings, []);
  assert.equal(report.cases, cases.length);
});

test('the declared capabilities are the expected ones', () => {
  assert.deepEqual(OPENSPEC_CAPABILITIES, CAPABILITIES);
});

test('registration admits the plugin for a host that offers the SdlcFramework port', () => {
  const registered = registerOpenSpecFramework({ ports: ['SdlcFramework'] }, PINNED_CLI);

  assert.ok(registered.ok);
  assert.ok(registered.value instanceof OpenSpecFramework);
});

test('registration fails when the host does not offer the SdlcFramework port', () => {
  const registered = registerOpenSpecFramework({ ports: ['ScmProvider'] }, PINNED_CLI);

  assert.equal(!registered.ok && registered.error.code, 'not-found');
});

test('the manifest declares the optional operations as its capabilities', () => {
  assert.equal(OPENSPEC_PLUGIN_MANIFEST.port, 'SdlcFramework');
  assert.deepEqual(OPENSPEC_PLUGIN_MANIFEST.capabilities, ['validate-structure', 'finalize']);
});

test('finalization reports the archived revisions with unchanged digests', async () => {
  const copy = workingCopy();

  const finalized = await framework().finalize({ workingCopy: copy, workItem: FIXTURE.change });

  assert.ok(finalized.ok);
  assert.deepEqual(finalized.value.revisions, revisionsOf(FIXTURE, `openspec/changes/archive/${ARCHIVE_DATE}-${FIXTURE.change}`));
  const remaining = await framework().discoverWorkItems({ workingCopy: copy });
  assert.ok(remaining.ok);
  assert.ok(!remaining.value.some((workItem) => workItem.nativeReference === FIXTURE.change));
});

test('finalization fails with precondition-failed when OpenSpec refuses to archive', async () => {
  const copy = workingCopy();
  mkdirSync(join(copy, 'openspec/changes/archive', `${ARCHIVE_DATE}-${FIXTURE.change}`), { recursive: true });

  const finalized = await framework().finalize({ workingCopy: copy, workItem: FIXTURE.change });

  assert.equal(!finalized.ok && finalized.error.code, 'precondition-failed');
});

test('structural validation of a subject that is not the current revision set fails with conflict', async () => {
  const subject = revisionsOf(FIXTURE).slice(1);

  const report = await framework().validateStructure({ workingCopy: workingCopy(), workItem: FIXTURE.change, subject });

  assert.equal(!report.ok && report.error.code, 'conflict');
});

test('structural validation of an invalid change reports its problems', async () => {
  const copy = workingCopy();
  const spec = join(copy, 'openspec/changes', FIXTURE.change, FIXTURE.files[1]!.path);
  writeFileSync(spec, '## ADDED Requirements\n\n### Requirement: Without a scenario\nThe system SHALL do something.\n');
  const subject = await framework().inspectArtifactRevisions({ workingCopy: copy, workItem: FIXTURE.change });
  assert.ok(subject.ok);

  const report = await framework().validateStructure({ workingCopy: copy, workItem: FIXTURE.change, subject: subject.value });

  assert.ok(report.ok);
  assert.equal(report.value.verdict, 'invalid');
  assert.ok(report.value.problems.length > 0);
});

test('a working copy that does not exist is not found', async () => {
  const discovered = await framework().discoverWorkItems({ workingCopy: join(SCRATCH, 'missing') });

  assert.equal(!discovered.ok && discovered.error.code, 'not-found');
});

test('a directory outside any OpenSpec project is not found', async () => {
  const discovered = await framework().discoverWorkItems({ workingCopy: mkdtempSync(join(SCRATCH, 'empty-')) });

  assert.equal(!discovered.ok && discovered.error.code, 'not-found');
});

test('a working copy that is a file is not found', async () => {
  const file = join(workingCopy(), 'openspec/config.yaml');

  const discovered = await framework().discoverWorkItems({ workingCopy: file });

  assert.equal(!discovered.ok && discovered.error.code, 'not-found');
});

test('an artifact file outside the working copy is an internal failure', async () => {
  const outside = fakeCli([
    "const command = process.argv[2];",
    "const root = { path: process.cwd() };",
    "if (command === 'list') console.log(JSON.stringify({ changes: [{ name: 'outside' }], root }));",
    "else console.log(JSON.stringify({ schemaName: 'spec-driven', changeRoot: process.cwd(), applyRequires: [],",
    "  artifactPaths: { proposal: { existingOutputPaths: ['/etc/hosts'] } },",
    "  artifacts: [{ id: 'proposal', requires: [], status: 'done' }] }));",
  ].join('\n'));

  const revisions = await framework(outside).inspectArtifactRevisions({ workingCopy: workingCopy(), workItem: 'outside' });

  assert.equal(!revisions.ok && revisions.error.code, 'internal');
});

test('a directory inside an OpenSpec project is not an OpenSpec root', async () => {
  const discovered = await framework().discoverWorkItems({ workingCopy: join(workingCopy(), 'openspec/specs') });

  assert.equal(!discovered.ok && discovered.error.code, 'not-found');
});

test('a CLI that cannot run is unavailable', async () => {
  const discovered = await framework({ executable: join(SCRATCH, 'no-such-openspec') }).discoverWorkItems({ workingCopy: workingCopy() });

  assert.equal(!discovered.ok && discovered.error.code, 'unavailable');
});

test('a CLI other than the pinned version is unavailable', async () => {
  const discovered = await framework(fakeCli(printing('{}'), '1.15.0')).discoverWorkItems({ workingCopy: workingCopy() });

  assert.equal(!discovered.ok && discovered.error.code, 'unavailable');
});

test('CLI output that is not JSON or not the expected JSON is an internal failure', async () => {
  for (const output of ['not json', '{"changes": "none", "root": {"path": "/"}}', '[]']) {
    const discovered = await framework(fakeCli(printing(output))).discoverWorkItems({ workingCopy: workingCopy() });

    assert.equal(!discovered.ok && discovered.error.code, 'internal', output);
  }
});

test('the CLI runs without telemetry even when the caller enables it', async () => {
  const echo = fakeCli([
    'const seen = `OPENSPEC_TELEMETRY=${process.env.OPENSPEC_TELEMETRY} DO_NOT_TRACK=${process.env.DO_NOT_TRACK}`;',
    'console.log(JSON.stringify({ status: [{ message: seen }] }));',
    'process.exit(1);',
  ].join(' '));
  const environment = { OPENSPEC_TELEMETRY: '1', DO_NOT_TRACK: '0' };

  const discovered = await framework({ ...echo, environment }).discoverWorkItems({ workingCopy: workingCopy() });

  assert.ok(!discovered.ok);
  assert.match(discovered.error.message, /: OPENSPEC_TELEMETRY=0 DO_NOT_TRACK=1$/);
});
