import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { CodeHeadIdentity as SdlcCodeHead, CodeObjectId } from '@taskelith/sdlc';

export { isSameCodeHead, type RepositoryId } from '@taskelith/sdlc';

declare const gitObjectIdBrand: unique symbol;

// A full lowercase Git object name: SHA-1 or SHA-256.
export type GitObjectId = CodeObjectId & { readonly [gitObjectIdBrand]: true };

const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// What head-bound verification and review record (contract section 5):
// the SDLC module's code head with Git object names.
export interface CodeHeadIdentity extends SdlcCodeHead {
  readonly commit: GitObjectId;
  readonly tree: GitObjectId;
}

export interface CodeHeadInput {
  readonly repository: string;
  readonly commit: string;
  readonly tree: string;
}

export function parseGitObjectId(text: string): Result<GitObjectId> {
  if (!GIT_OBJECT_ID.test(text)) {
    return err(failure('invalid', 'a Git object name must be 40 or 64 lowercase hexadecimal characters'));
  }
  return ok(text as GitObjectId);
}

export function parseCodeHeadIdentity(input: CodeHeadInput): Result<CodeHeadIdentity> {
  const repository = parseIdentifier('RepositoryId', input.repository);
  if (!repository.ok) return fieldError('repository', repository.error.message);
  const commit = parseGitObjectId(input.commit);
  if (!commit.ok) return fieldError('commit', commit.error.message);
  const tree = parseGitObjectId(input.tree);
  if (!tree.ok) return fieldError('tree', tree.error.message);
  if (commit.value.length !== tree.value.length) {
    return fieldError('tree', 'the commit and the tree must use one object format');
  }
  return ok(Object.freeze({ repository: repository.value, commit: commit.value, tree: tree.value }));
}

function fieldError(field: string, message: string): Result<never> {
  return err(failure('invalid', `${field}: ${message}`, { field }));
}
