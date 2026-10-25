import { isAbsolute, join, resolve } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// Where a process looks for its `dataRoot` (storage contract, "Root
// selection"); `explicit` is the command or programmatic configuration.
export interface DataRootSources {
  readonly explicit?: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
}

// Explicit configuration wins, then a nonempty TASKELITH_DATA_DIR, then the
// OS default; an invalid configured value fails instead of falling back.
export function resolveDataRoot({ explicit, environment, platform }: DataRootSources): Result<string> {
  if (explicit !== undefined) return absoluteRoot(explicit, 'the configured data root');
  const configured = environment.TASKELITH_DATA_DIR;
  if (configured !== undefined && configured !== '') return absoluteRoot(configured, 'TASKELITH_DATA_DIR');
  return defaultRoot(environment, platform);
}

function defaultRoot(environment: DataRootSources['environment'], platform: NodeJS.Platform): Result<string> {
  const xdgDataHome = environment.XDG_DATA_HOME;
  if (platform === 'linux' && xdgDataHome !== undefined && isAbsolute(xdgDataHome)) {
    return ok(join(resolve(xdgDataHome), 'taskelith'));
  }
  const home = environment.HOME;
  if (home === undefined || !isAbsolute(home)) {
    return err(failure('invalid', 'HOME must be an absolute path to derive the default data root'));
  }
  if (platform === 'linux') return ok(join(resolve(home), '.local', 'share', 'taskelith'));
  if (platform === 'darwin') return ok(join(resolve(home), 'Library', 'Application Support', 'Taskelith'));
  return err(failure('invalid', `no default data root for platform ${platform}`, { platform }));
}

// A tilde is never expanded: `~/data` is a relative path and fails.
function absoluteRoot(path: string, source: string): Result<string> {
  if (!isAbsolute(path)) return err(failure('invalid', `${source} must be an absolute path`, { path }));
  return ok(resolve(path));
}
