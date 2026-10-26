import { err, failure, ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';

// The SCM port's opaque repository name, compared exactly, never parsed.
export type RepositoryId = Identifier<'RepositoryId'>;

declare const gitObjectIdBrand: unique symbol;

// A full lowercase Git object name: SHA-1 or SHA-256.
export type GitObjectId = string & { readonly [gitObjectIdBrand]: true };

const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// What head-bound verification and review record (contract section 5).
export interface CodeHeadIdentity {
  readonly repository: RepositoryId;
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

// One head is another only when all three parts match; a new commit with
// an unchanged tree is still a new head.
export function isSameCodeHead(left: CodeHeadIdentity, right: CodeHeadIdentity): boolean {
  return left.repository === right.repository && left.commit === right.commit && left.tree === right.tree;
}

function fieldError(field: string, message: string): Result<never> {
  return err(failure('invalid', `${field}: ${message}`, { field }));
}
