export type ObjectFormat = 'sha1' | 'sha256';

export function repositoryConfigText(_format: ObjectFormat): string {
  throw new Error('not implemented');
}

export function writeRepositoryConfig(_checkout: string, _format: ObjectFormat): Promise<void> {
  throw new Error('not implemented');
}
