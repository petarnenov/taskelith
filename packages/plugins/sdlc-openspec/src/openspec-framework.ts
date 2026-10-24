import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  readArchiveLocation,
  readChangeList,
  readChangeStatus,
  readContextFiles,
  readFailureMessage,
  readInstruction,
  readSchemaLocation,
  readValidation,
  readVersion,
  type ChangeStatus,
  type SchemaArtifact,
} from './cli-output.js';
import { runOpenSpec, type OpenSpecCliOptions } from './openspec-cli.js';
import type {
  ArtifactRequirement,
  ArtifactRevision,
  FinalizationReport,
  FrameworkContext,
  ResolvedWorkflow,
  SdlcFramework,
  SdlcFrameworkCapabilities,
  Stage,
  StageInstructions,
  StageRequest,
  StructuralValidationReport,
  StructuralValidationRequest,
  WorkItem,
  WorkItemRequest,
  WorkflowRequest,
} from './sdlc-framework-shapes.js';

// The CLI version whose output this adapter normalizes (G1 decision D6 (a)).
export const OPENSPEC_VERSION = '1.14.3';

export const OPENSPEC_CAPABILITIES: SdlcFrameworkCapabilities = Object.freeze({
  optionalOperations: Object.freeze(['validateStructure', 'finalize']),
  nativeObligations: Object.freeze(['intake', 'specification', 'implementation', 'closure']),
});

const VALIDATOR = 'openspec-validate-strict';
const APPLY_STAGE = 'apply';
// Platform-managed stages, and `archive`, which runs through finalize.
const STAGES_WITHOUT_INSTRUCTIONS: readonly string[] = ['verify', 'review', 'archive'];
const PROBE_CHANGE = 'taskelith-workflow-probe';
const PROJECT_SCHEMA_ENTRIES = ['config.yaml', 'config.yml', 'schemas'];

interface WorkingCopy {
  readonly root: string;
  readonly changes: readonly string[];
  readonly toolVersion: string;
}

// A working copy with the status of the change whose workflow is resolved.
interface WorkflowSubject extends WorkingCopy {
  readonly status: ChangeStatus;
}

interface OpenChange extends WorkflowSubject {
  readonly change: string;
}

interface ArtifactFile {
  readonly artifactId: string;
  readonly path: string;
}

interface SchemaDefinition {
  readonly digest: string;
  readonly version: string;
}

// Implements the SdlcFramework port by spawning the pinned OpenSpec CLI in the
// working copy and normalizing its JSON output (fixtures/README.md).
export class OpenSpecFramework implements SdlcFramework {
  readonly capabilities = OPENSPEC_CAPABILITIES;
  readonly #options: OpenSpecCliOptions;
  #toolVersion: Promise<Result<string>> | undefined;

  constructor(options: OpenSpecCliOptions) {
    this.#options = options;
  }

  async discoverWorkItems(request: FrameworkContext): Promise<Result<readonly WorkItem[]>> {
    const copy = await this.openWorkingCopy(request.workingCopy);
    if (!copy.ok) return copy;
    return ok([...copy.value.changes].sort().map((change) => ({ id: `openspec:${change}`, nativeReference: change })));
  }

  async resolveWorkflow(request: WorkflowRequest): Promise<Result<ResolvedWorkflow>> {
    const { workItem } = request;
    const subject = workItem === undefined ? await this.openNewChange(request.workingCopy) : await this.openChange({ ...request, workItem });
    if (!subject.ok) return subject;
    const { root, status, toolVersion } = subject.value;
    const schema = await this.schemaDefinition(root, status.schemaName);
    if (!schema.ok) return schema;
    return ok({
      definition: { id: `openspec/${status.schemaName}`, version: schema.value.version, stages: stagesOf(status) },
      digest: schema.value.digest,
      upstreamToolVersion: toolVersion,
    });
  }

  async describeArtifacts(request: WorkItemRequest): Promise<Result<readonly ArtifactRequirement[]>> {
    const open = await this.openChange(request);
    if (!open.ok) return open;
    return ok(open.value.status.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      stageId: artifact.id,
      requires: artifact.requires,
      present: artifact.done,
    })));
  }

  async inspectArtifactRevisions(request: WorkItemRequest): Promise<Result<readonly ArtifactRevision[]>> {
    const open = await this.openChange(request);
    if (!open.ok) return open;
    return currentRevisions(open.value);
  }

  async prepareStageInstructions(request: StageRequest): Promise<Result<StageInstructions>> {
    const open = await this.openChange(request);
    if (!open.ok) return open;
    const { stageId } = request;
    const artifact = open.value.status.artifacts.find((candidate) => candidate.id === stageId);
    if (artifact !== undefined) return this.artifactInstructions(open.value, artifact);
    if (stageId === APPLY_STAGE) return this.applyInstructions(open.value);
    if (STAGES_WITHOUT_INSTRUCTIONS.includes(stageId)) {
      return err(failure('invalid', `stage ${stageId} is not an agent task`, { stageId }));
    }
    return err(failure('not-found', `change ${request.workItem} has no stage ${stageId}`, { stageId }));
  }

  async validateStructure(request: StructuralValidationRequest): Promise<Result<StructuralValidationReport>> {
    const open = await this.openChange(request);
    if (!open.ok) return open;
    const { root, change, toolVersion } = open.value;
    const current = await currentRevisions(open.value);
    if (!current.ok) return current;
    if (!isSameRevisionSet(request.subject, current.value)) {
      return err(failure('conflict', `the subject is not the current revision set of change ${change}`, { workItem: change }));
    }
    const output = await runOpenSpec(this.#options, root, ['validate', change, '--type', 'change', '--strict']);
    if (!output.ok) return output;
    const outcome = readValidation(output.value.json);
    if (!outcome.ok) return outcome;
    const { valid, issues } = outcome.value;
    return ok({
      validator: VALIDATOR,
      verdict: valid ? 'valid' : 'invalid',
      reference: `openspec@${toolVersion} validate ${change} --strict`,
      problems: valid ? [] : invalidityProblems(issues),
    });
  }

  async finalize(request: WorkItemRequest): Promise<Result<FinalizationReport>> {
    const open = await this.openChange(request);
    if (!open.ok) return open;
    const { root, change, status, toolVersion } = open.value;
    const files = artifactFiles(status).map((file) => ({ ...file, path: relative(status.changeRoot, file.path) }));
    if (files.some((file) => !isInside(file.path))) {
      return err(failure('internal', `openspec status listed a file outside change ${change}`, { workItem: change }));
    }
    const output = await runOpenSpec(this.#options, root, ['archive', change, '--yes']);
    if (!output.ok) return output;
    if (!output.value.succeeded) {
      const message = readFailureMessage(output.value.json);
      return err(failure('precondition-failed', `openspec archive ${change} failed: ${message}`, { workItem: change }));
    }
    const archive = readArchiveLocation(output.value.json);
    if (!archive.ok) return archive;
    const revisions = await fileRevisions(root, files.map((file) => ({ ...file, path: join(archive.value, file.path) })));
    if (!revisions.ok) return revisions;
    return ok({ reference: `openspec@${toolVersion} archive ${change} --yes`, revisions: revisions.value });
  }

  private async artifactInstructions(open: OpenChange, artifact: SchemaArtifact): Promise<Result<StageInstructions>> {
    const output = await this.command(open.root, ['instructions', artifact.id, '--change', open.change]);
    if (!output.ok) return output;
    const instruction = readInstruction(output.value);
    if (!instruction.ok) return instruction;
    const revisions = await currentRevisions(open);
    if (!revisions.ok) return revisions;
    return ok({
      stageId: artifact.id,
      instructions: instruction.value,
      inputs: revisions.value.filter((revision) => artifact.requires.includes(revision.artifactId)),
      outputs: [artifact.id],
    });
  }

  private async applyInstructions(open: OpenChange): Promise<Result<StageInstructions>> {
    const output = await this.command(open.root, ['instructions', APPLY_STAGE, '--change', open.change]);
    if (!output.ok) return output;
    const instruction = readInstruction(output.value);
    if (!instruction.ok) return instruction;
    const contextFiles = readContextFiles(output.value);
    if (!contextFiles.ok) return contextFiles;
    const revisions = await currentRevisions(open);
    if (!revisions.ok) return revisions;
    const context = new Set(contextFiles.value.map((path) => nativeReferenceOf(open.root, path)));
    return ok({
      stageId: APPLY_STAGE,
      instructions: instruction.value,
      inputs: revisions.value.filter((revision) => context.has(revision.nativeReference)),
      outputs: [],
    });
  }

  // The working copy must itself be the OpenSpec root, so that the CLI never
  // acts on an enclosing project.
  private async openWorkingCopy(workingCopy: string): Promise<Result<WorkingCopy>> {
    const toolVersion = await this.toolVersion();
    if (!toolVersion.ok) return toolVersion;
    const root = await realpath(workingCopy).catch(() => undefined);
    if (root === undefined || !(await isDirectory(root))) {
      return err(failure('not-found', `working copy ${workingCopy} is not a directory`, { workingCopy }));
    }
    const output = await runOpenSpec(this.#options, root, ['list']);
    if (!output.ok) return output;
    if (!output.value.succeeded) {
      const message = readFailureMessage(output.value.json);
      return err(failure('not-found', `working copy ${workingCopy} is not an OpenSpec root: ${message}`, { workingCopy }));
    }
    const listed = readChangeList(output.value.json);
    if (!listed.ok) return listed;
    if (listed.value.root !== root) {
      return err(failure('not-found', `working copy ${workingCopy} is not an OpenSpec root`, { workingCopy }));
    }
    return ok({ root, changes: listed.value.changes, toolVersion: toolVersion.value });
  }

  private async openChange(request: WorkItemRequest): Promise<Result<OpenChange>> {
    const copy = await this.openWorkingCopy(request.workingCopy);
    if (!copy.ok) return copy;
    const change = request.workItem;
    if (!copy.value.changes.includes(change)) {
      return err(failure('not-found', `${change} is not an active OpenSpec change`, { workItem: change }));
    }
    const status = await this.changeStatus(copy.value.root, change);
    if (!status.ok) return status;
    return ok({ ...copy.value, change, status: status.value });
  }

  // OpenSpec reports a schema's artifact graph only for a change, so the
  // workflow of a new change is read from an empty change in a scratch copy.
  private async openNewChange(workingCopy: string): Promise<Result<WorkflowSubject>> {
    const copy = await this.openWorkingCopy(workingCopy);
    if (!copy.ok) return copy;
    try {
      const probe = await mkdtemp(join(tmpdir(), 'taskelith-openspec-'));
      try {
        const status = await this.probeStatus(copy.value.root, probe);
        return status.ok ? ok({ ...copy.value, status: status.value }) : status;
      } finally {
        await rm(probe, { recursive: true, force: true });
      }
    } catch (error) {
      return err(failure('internal', `the workflow probe failed: ${messageOf(error)}`));
    }
  }

  private async probeStatus(root: string, probe: string): Promise<Result<ChangeStatus>> {
    await mkdir(join(probe, 'openspec', 'changes', PROBE_CHANGE), { recursive: true });
    for (const entry of PROJECT_SCHEMA_ENTRIES) {
      const source = join(root, 'openspec', entry);
      if (await exists(source)) await cp(source, join(probe, 'openspec', entry), { recursive: true });
    }
    return this.changeStatus(probe, PROBE_CHANGE);
  }

  private async changeStatus(root: string, change: string): Promise<Result<ChangeStatus>> {
    const output = await this.command(root, ['status', '--change', change]);
    return output.ok ? readChangeStatus(output.value) : output;
  }

  private async schemaDefinition(root: string, schemaName: string): Promise<Result<SchemaDefinition>> {
    const output = await this.command(root, ['schema', 'which', schemaName]);
    if (!output.ok) return output;
    const location = readSchemaLocation(output.value);
    if (!location.ok) return location;
    const content = await readBytes(join(location.value, 'schema.yaml'));
    if (!content.ok) return content;
    const version = SCHEMA_VERSION.exec(content.value.toString('utf8'))?.[2];
    if (version === undefined) return err(failure('internal', `schema ${schemaName} declares no version`, { schemaName }));
    return ok({ digest: sha256(content.value), version });
  }

  // Only a successful check is kept, so a CLI that was briefly missing is
  // checked again on the next operation.
  private async toolVersion(): Promise<Result<string>> {
    this.#toolVersion ??= this.readToolVersion();
    const version = await this.#toolVersion;
    if (!version.ok) this.#toolVersion = undefined;
    return version;
  }

  private async readToolVersion(): Promise<Result<string>> {
    const output = await this.command(tmpdir(), ['version']);
    if (!output.ok) return output;
    const version = readVersion(output.value);
    if (!version.ok || version.value === OPENSPEC_VERSION) return version;
    return err(failure('unavailable', `OpenSpec ${version.value} is not the pinned ${OPENSPEC_VERSION}`, { version: version.value }));
  }

  private async command(directory: string, args: readonly string[]): Promise<Result<unknown>> {
    const output = await runOpenSpec(this.#options, directory, args);
    if (!output.ok) return output;
    if (!output.value.succeeded) {
      const command = ['openspec', ...args].join(' ');
      return err(failure('internal', `${command} failed: ${readFailureMessage(output.value.json)}`, { command }));
    }
    return ok(output.value.json);
  }
}

// The top-level `version` scalar of a schema.yaml file, optionally quoted and
// followed by a comment.
const SCHEMA_VERSION = /^version:[ \t]*(["']?)([^"'#\s]+)\1[ \t]*(?:#.*)?$/m;

// Schema artifacts are native stages: those without prerequisites cover
// intake, the rest specification; verify and review are platform-managed.
function stagesOf(status: ChangeStatus): Stage[] {
  return [
    ...status.artifacts.map((artifact): Stage => ({
      id: artifact.id,
      obligations: [artifact.requires.length === 0 ? 'intake' : 'specification'],
      origin: 'native',
      dependsOn: artifact.requires,
    })),
    { id: APPLY_STAGE, obligations: ['implementation'], origin: 'native', dependsOn: status.applyRequires },
    { id: 'verify', obligations: ['verification'], origin: 'platform-managed', dependsOn: [APPLY_STAGE] },
    { id: 'review', obligations: ['review'], origin: 'platform-managed', dependsOn: ['verify'] },
    { id: 'archive', obligations: ['closure'], origin: 'native', dependsOn: ['review'] },
  ];
}

function artifactFiles(status: ChangeStatus): ArtifactFile[] {
  return status.artifacts.flatMap((artifact) => artifact.files.map((path) => ({ artifactId: artifact.id, path })));
}

function currentRevisions(open: OpenChange): Promise<Result<ArtifactRevision[]>> {
  return fileRevisions(open.root, artifactFiles(open.status));
}

async function fileRevisions(root: string, files: readonly ArtifactFile[]): Promise<Result<ArtifactRevision[]>> {
  const revisions: ArtifactRevision[] = [];
  for (const file of files) {
    if (!isInside(relative(root, file.path))) {
      return err(failure('internal', `${file.path} is outside the working copy`, { path: file.path }));
    }
    const content = await readBytes(file.path);
    if (!content.ok) return content;
    revisions.push({ artifactId: file.artifactId, digest: sha256(content.value), nativeReference: nativeReferenceOf(root, file.path) });
  }
  return ok(revisions);
}

function isSameRevisionSet(subject: readonly ArtifactRevision[], current: readonly ArtifactRevision[]): boolean {
  const key = (revision: ArtifactRevision) => JSON.stringify([revision.artifactId, revision.digest, revision.nativeReference]);
  const currentKeys = new Set(current.map(key));
  return subject.length === current.length && new Set(subject.map(key)).size === subject.length
    && subject.every((revision) => currentKeys.has(key(revision)));
}

// An invalid report has at least one problem, even without a reported issue.
function invalidityProblems(issues: readonly string[]): { readonly message: string }[] {
  const messages = issues.length > 0 ? issues : ['OpenSpec reported the change invalid without an issue'];
  return messages.map((message) => ({ message }));
}

// A relative path that stays inside its base directory.
function isInside(relativePath: string): boolean {
  return relativePath !== '' && !isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`);
}

function nativeReferenceOf(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

async function readBytes(path: string): Promise<Result<Buffer>> {
  try {
    return ok(await readFile(path));
  } catch (error) {
    return err(failure('internal', `${path} could not be read: ${messageOf(error)}`, { path }));
  }
}

function isDirectory(path: string): Promise<boolean> {
  return stat(path).then((entry) => entry.isDirectory(), () => false);
}

function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(content: Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
