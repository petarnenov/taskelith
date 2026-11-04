import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { ScmPluginDefectKind, ScmPluginOperation } from '../ports/scm-integrations.js';
import type { SourceControlProvider } from '../ports/source-control.js';
import { readResult, type Reading } from '../ports/untrusted-shapes.js';

export type ReportedDefect = (operation: ScmPluginOperation, kind: ScmPluginDefectKind) => Failure;
export type DefectOfCall = (kind: ScmPluginDefectKind) => Failure;

// Calls the plugin and reads its envelope and value once, inside one
// boundary; a throw or a broken shape is the plugin defect, never quoted.
export async function pluginAnswer<Value>(
  call: () => Result<unknown> | Promise<Result<unknown>>, read: (value: unknown) => Reading<Value>, defect: DefectOfCall,
): Promise<Result<Result<Value>>> {
  try {
    const envelope = readResult(await call());
    if (!envelope.ok) return err(defect('malformed-envelope'));
    if (!envelope.value.ok) return ok(err(envelope.value.error));
    const value = read(envelope.value.value);
    return value.ok ? ok(ok(value.value)) : err(defect('malformed-value'));
  } catch {
    return err(defect('threw'));
  }
}

export function pluginDefect(): Failure {
  return failure('internal', 'the SCM plugin answered outside its contract');
}

// A provider is an object whose operations are called in their own boundary.
export function asProvider(value: unknown): Reading<SourceControlProvider> {
  const isObject = typeof value === 'object' && value !== null;
  return isObject ? ok(value as SourceControlProvider) : err(['provider must be an object']);
}
