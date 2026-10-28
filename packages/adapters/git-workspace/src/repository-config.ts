import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export type ObjectFormat = 'sha1' | 'sha256';

// Only the repository format and object format of the clone (section 7);
// no setting that an agent wrote survives.
export function repositoryConfigText(format: ObjectFormat): string {
  if (format === 'sha1') return '[core]\n\trepositoryformatversion = 0\n';
  return '[core]\n\trepositoryformatversion = 1\n[extensions]\n\tobjectformat = sha256\n';
}

// A new file, created exclusively without following a link, renamed over
// `.git/config`, so no link the agent left there is written through.
export async function writeRepositoryConfig(checkout: string, format: ObjectFormat): Promise<void> {
  const gitDirectory = join(checkout, '.git');
  const temporary = join(gitDirectory, `config.taskelith-${randomBytes(8).toString('hex')}`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  const handle = await open(temporary, flags, 0o600);
  try {
    await handle.writeFile(repositoryConfigText(format));
  } finally {
    await handle.close();
  }
  await rename(temporary, join(gitDirectory, 'config')).catch(async (error: unknown) => {
    await rm(temporary, { force: true });
    throw error;
  });
}

// `.git/info` holds ignore, attribute, and graft rules that Git reads
// beside the tracked ones, so none that the agent wrote survives.
export async function resetRepositoryFiles(checkout: string, format: ObjectFormat): Promise<void> {
  await writeRepositoryConfig(checkout, format);
  await rm(join(checkout, '.git', 'info'), { recursive: true, force: true });
}
