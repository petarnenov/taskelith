import { execFileSync } from 'node:child_process';
import { realpathSync, statSync, statfsSync } from 'node:fs';
import { dirname } from 'node:path';
import { err, ok, type Result } from '@taskelith/kernel';
import { rootFailure } from './journal-failure.js';

// What the startup check learns about the volume that holds `dataRoot`.
export type VolumeDescription =
  | { readonly platform: 'darwin'; readonly filesystem: string; readonly local: boolean }
  | { readonly platform: 'linux'; readonly magic: bigint };

export type VolumeProbe = (path: string) => Result<VolumeDescription>;

// Linux filesystems that are remote, not persistent, or a container layer
// (section 2); identified by their statfs magic numbers.
const REFUSED_LINUX_FILESYSTEMS: ReadonlyMap<bigint, string> = new Map([
  [0x6969n, 'nfs'],
  [0x517bn, 'smb'],
  [0xff534d42n, 'cifs'],
  [0xfe534d42n, 'smb2'],
  [0x73757245n, 'coda'],
  [0x5346414fn, 'afs'],
  [0x01021997n, '9p'],
  [0x65735546n, 'fuse'],
  [0x00c36400n, 'ceph'],
  [0x794c7630n, 'overlayfs'],
  [0x01021994n, 'tmpfs'],
  [0x858458f6n, 'ramfs'],
]);

// On macOS only local APFS supports F_FULLFSYNC (contract section 3); on
// Linux remote, volatile, and overlay filesystems are refused.
export function checkVolume(path: string, probe: VolumeProbe): Result<void> {
  const described = probe(path);
  if (!described.ok) return described;
  const volume = described.value;
  if (volume.platform === 'darwin') {
    if (volume.filesystem === 'apfs' && volume.local) return ok(undefined);
    return err(rootFailure('unsupported-volume', `${path} is on ${volume.filesystem}, not local APFS`, {
      filesystem: volume.filesystem,
    }));
  }
  const refused = REFUSED_LINUX_FILESYSTEMS.get(volume.magic);
  if (refused === undefined) return ok(undefined);
  return err(rootFailure('unsupported-volume', `${path} is on ${refused}, which cannot hold the journal`, { filesystem: refused }));
}

export function probeVolume(path: string): Result<VolumeDescription> {
  if (process.platform === 'linux') return ok({ platform: 'linux', magic: statfsSync(path, { bigint: true }).type });
  if (process.platform === 'darwin') return describeMacVolume(path);
  return err(rootFailure('unsupported-volume', `platform ${process.platform} has no qualified journal volume`));
}

function describeMacVolume(path: string): Result<VolumeDescription> {
  const mountPoint = mountPointOf(realpathSync(path));
  const mounts = execFileSync('/sbin/mount', { encoding: 'utf8' });
  const options = parseMacMountOptions(mounts, mountPoint);
  if (options === undefined) {
    return err(rootFailure('unsupported-volume', `no mount entry for ${mountPoint}`, { mountPoint }));
  }
  return ok({ platform: 'darwin', filesystem: options[0] ?? '', local: options.includes('local') });
}

// The highest directory on the same device as `path`.
function mountPointOf(path: string): string {
  const device = statSync(path).dev;
  let current = path;
  while (dirname(current) !== current && statSync(dirname(current)).dev === device) current = dirname(current);
  return current;
}

// `mount` prints `<device> on <mount point> (<type>, <option>, ...)`.
export function parseMacMountOptions(mounts: string, mountPoint: string): readonly string[] | undefined {
  const marker = ` on ${mountPoint} (`;
  const line = mounts.split('\n').find((entry) => entry.includes(marker) && entry.endsWith(')'));
  if (line === undefined) return undefined;
  return line.slice(line.indexOf(marker) + marker.length, -1).split(', ');
}
