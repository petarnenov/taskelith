import { err, failure, ok, type Result } from '@taskelith/kernel';

// A repository is named by GitHub's full name, `owner/name`.
export interface RepositoryName {
  readonly owner: string;
  readonly repo: string;
}

const FULL_NAME = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

export function parseRepository(repository: string): Result<RepositoryName> {
  const match = FULL_NAME.exec(repository);
  if (match === null || match[2] === '.' || match[2] === '..') {
    return err(failure('invalid', 'A repository must be a GitHub full name, owner/name'));
  }
  return ok({ owner: match[1]!, repo: match[2]! });
}
