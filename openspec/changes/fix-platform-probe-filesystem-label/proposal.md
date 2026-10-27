## Why

The native acceptance platform probe names an ext4 file system `ext2/ext3`. GNU `stat -f -c %T` maps the file system's magic number to a name, and ext2, ext3, and ext4 share the magic `0xEF53`, so `%T` prints `ext2/ext3`. Both probes use it: the Linux entry of `scripts/native-acceptance.ts` on a Docker volume, and the `platform` row of `scripts/installation-scenarios.sh` on the worker data root. A worker session saw the wrong label on an Ubuntu host.

## What Changes

- **Probe.** Both places run one shell probe in the container: `findmnt -no FSTYPE --target <path>`, which reads the type of the mount holding the path from the kernel's mount table, and `stat -f -c %T <path>` only when `findmnt` is missing or fails.
- **Spec.** The requirement "Platform facts of a proof" states that the Linux file system is the mount's type, with scenarios for ext4 and for the fallback.
- **Tests.** The Linux platform test expects `ext4` from the probe; the probe runs against stub `findmnt` and `stat` programs; the installation scenarios' `platform` row is tested with an ext4 stub and the fallback, and its probe is checked equal to the TypeScript one.

The macOS entry, which reads `diskutil`, does not change. No contract, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-worker-acceptance`: requirement "Platform facts of a proof".

## Impact

- `scripts/native-acceptance.ts` and `scripts/installation-scenarios.sh`.
- `test/native-acceptance.test.ts` and `test/installation-scenarios.test.ts`.
