import { err, failure, ok, type Result } from '@taskelith/kernel';

// Readers for the `--json` output of the pinned OpenSpec CLI (contract-tooling
// section 9). The output is untrusted, so each field is checked before use.

export interface ChangeList {
  readonly root: string;
  readonly changes: readonly string[];
}

export interface SchemaArtifact {
  readonly id: string;
  readonly requires: readonly string[];
  readonly done: boolean;
  // Absolute paths of the artifact's files, sorted.
  readonly files: readonly string[];
}

export interface ChangeStatus {
  readonly schemaName: string;
  readonly changeRoot: string;
  readonly applyRequires: readonly string[];
  readonly artifacts: readonly SchemaArtifact[];
}

export interface ValidationOutcome {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export function readVersion(json: unknown): Result<string> {
  return read('version', json, (output) => text(output, 'version'));
}

export function readChangeList(json: unknown): Result<ChangeList> {
  return read('list', json, (output) => ({
    root: text(record(output, 'root'), 'path'),
    changes: list(output, 'changes').map((change, index) => text(asRecord(change, `changes[${index}]`), 'name')),
  }));
}

export function readChangeStatus(json: unknown): Result<ChangeStatus> {
  return read('status', json, (output) => {
    const paths = record(output, 'artifactPaths');
    return {
      schemaName: text(output, 'schemaName'),
      changeRoot: text(output, 'changeRoot'),
      applyRequires: texts(output, 'applyRequires'),
      artifacts: list(output, 'artifacts').map((entry, index) => {
        const artifact = asRecord(entry, `artifacts[${index}]`);
        const id = text(artifact, 'id');
        return {
          id,
          requires: texts(artifact, 'requires'),
          done: text(artifact, 'status') === 'done',
          files: [...texts(record(paths, id), 'existingOutputPaths')].sort(),
        };
      }),
    };
  });
}

export function readSchemaLocation(json: unknown): Result<string> {
  return read('schema which', json, (output) => text(output, 'path'));
}

export function readInstruction(json: unknown): Result<string> {
  return read('instructions', json, (output) => text(output, 'instruction'));
}

// The files `instructions apply` lists as context, by artifact.
export function readContextFiles(json: unknown): Result<readonly string[]> {
  return read('instructions apply', json, (output) => {
    const files = record(output, 'contextFiles');
    return Object.keys(files).flatMap((artifactId) => texts(files, artifactId));
  });
}

export function readValidation(json: unknown): Result<ValidationOutcome> {
  return read('validate', json, (output) => {
    const items = list(output, 'items');
    if (items.length !== 1) throw new OutputShapeError(`items has ${items.length} entries, not 1`);
    const item = asRecord(items[0], 'items[0]');
    return {
      valid: flag(item, 'valid'),
      issues: list(item, 'issues').map((entry, index) => {
        const issue = asRecord(entry, `issues[${index}]`);
        return `${text(issue, 'path')}: ${text(issue, 'message')}`;
      }),
    };
  });
}

export function readArchiveLocation(json: unknown): Result<string> {
  return read('archive', json, (output) => text(record(output, 'archive'), 'path'));
}

// The message of a failed command: the first entry of its `status` array.
export function readFailureMessage(json: unknown): string {
  const message = read('failure', json, (output) => text(asRecord(list(output, 'status')[0], 'status[0]'), 'message'));
  return message.ok ? message.value : 'OpenSpec reported a failure without a message';
}

type JsonRecord = Readonly<Record<string, unknown>>;

class OutputShapeError extends Error {}

function read<Value>(command: string, json: unknown, reader: (output: JsonRecord) => Value): Result<Value> {
  try {
    return ok(reader(asRecord(json, 'output')));
  } catch (error) {
    if (!(error instanceof OutputShapeError)) throw error;
    return err(failure('internal', `openspec ${command} printed unexpected JSON: ${error.message}`, { command }));
  }
}

function asRecord(value: unknown, name: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new OutputShapeError(`${name} is not an object`);
  return value as JsonRecord;
}

function record(owner: JsonRecord, key: string): JsonRecord {
  return asRecord(owner[key], key);
}

function list(owner: JsonRecord, key: string): readonly unknown[] {
  const value = owner[key];
  if (!Array.isArray(value)) throw new OutputShapeError(`${key} is not an array`);
  return value;
}

function text(owner: JsonRecord, key: string): string {
  const value = owner[key];
  if (typeof value !== 'string') throw new OutputShapeError(`${key} is not a string`);
  return value;
}

function texts(owner: JsonRecord, key: string): readonly string[] {
  return list(owner, key).map((value, index) => {
    if (typeof value !== 'string') throw new OutputShapeError(`${key}[${index}] is not a string`);
    return value;
  });
}

function flag(owner: JsonRecord, key: string): boolean {
  const value = owner[key];
  if (typeof value !== 'boolean') throw new OutputShapeError(`${key} is not a boolean`);
  return value;
}
