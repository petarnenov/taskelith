import type { Identifier } from '@taskelith/kernel';

// The SCM port's opaque repository name, compared exactly, never parsed.
export type RepositoryId = Identifier<'RepositoryId'>;

declare const codeObjectIdBrand: unique symbol;

// A full object name of a commit or tree; the workspace module validates
// its format, and the SDLC module only compares it.
export type CodeObjectId = string & { readonly [codeObjectIdBrand]: true };

// The code head that head-bound evidence names (workspace contract
// section 5); the workspace's `CodeHeadIdentity` refines it.
export interface CodeHeadIdentity {
  readonly repository: RepositoryId;
  readonly commit: CodeObjectId;
  readonly tree: CodeObjectId;
}

// One head is another only when all three parts match; a new commit with
// an unchanged tree is still a new head.
export function isSameCodeHead(left: CodeHeadIdentity, right: CodeHeadIdentity): boolean {
  return left.repository === right.repository && left.commit === right.commit && left.tree === right.tree;
}

// The optional `codeHead` field of a value, as a frozen copy of the head.
export function codeHeadField(head: CodeHeadIdentity | undefined): { readonly codeHead?: CodeHeadIdentity } {
  if (head === undefined) return {};
  return { codeHead: Object.freeze({ repository: head.repository, commit: head.commit, tree: head.tree }) };
}
