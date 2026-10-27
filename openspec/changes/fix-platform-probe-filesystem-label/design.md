## Context

`linuxPlatform` in `scripts/native-acceptance.ts` ran `stat -f -c %T /probe` in a container of the pinned Ubuntu base with an anonymous volume, and `platform` in `scripts/installation-scenarios.sh` ran `stat -f -c %T /var/lib/taskelith` in the worker container. GNU `stat` names a file system by its `statfs` magic number, and ext2, ext3, and ext4 share `0xEF53`, which `stat` prints as `ext2/ext3`. The kernel's mount table holds the real type.

## Decisions

- **D1: `findmnt` with a `stat` fallback.** `findmnt -no FSTYPE --target <path>` prints the type of the mount that holds the path. It is part of `util-linux`, an essential package of the pinned Ubuntu base and so of the worker image. The probe is `findmnt -no FSTYPE --target "$1" 2>/dev/null || stat -f -c %T "$1"`, run with `sh -c` and the path as `$1`, so a missing or failing `findmnt` keeps the earlier label instead of failing the probe.
- **D2: one probe in both places.** The TypeScript module exports it as `FILE_SYSTEM_PROBE`, and the shell library keeps the same text in a variable of the same name; a test checks that both are equal, because the shell library is sourced without Node.js.
- **D3: macOS unchanged.** The macOS entry reads the file system personality from `diskutil` and never used `stat -f`.

## Rejected alternatives

- **Parsing `/proc/self/mounts`.** It needs the longest mount point that prefixes the path and the octal escapes of mount points, which `findmnt` already handles.
- **Running the probe on the host.** The facts belong to the container's view of the volume, which can differ from the host's, for example under Docker Desktop.

## Risks / Trade-offs

- An image without `findmnt` keeps the `ext2/ext3` label for ext4; the fallback scenario states it.
