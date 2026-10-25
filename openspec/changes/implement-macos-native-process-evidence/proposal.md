## Why

G2 item 15 (`implement-process-supervisor`) left the macOS adapter failing closed, so a macOS supervisor sealed every launch: reading `kinfo_proc` and `mach_continuous_time` needs a native mechanism, decision D-A, which it deferred to the owner with a `koffi` qualification proposal ([koffi-qualification.md](../archive/2026-10-25-implement-process-supervisor/koffi-qualification.md)). On 2026-10-25 the owner approved `koffi` (decision D-A of item 15) and accepted its governance risks, mitigated by keeping it behind the ports. The coordinator assigned this change to implement the macOS native process evidence and enable the macOS launch path.

## What Changes

- Install `koffi@3.3.3` as an exact-pinned dependency of `@taskelith/worker-supervisor` only, with the exact-pinned optional platform packages `@koromix/koffi-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}@3.3.3`.
- `darwin-native.ts`, the only module that loads `koffi`: it binds `sysctl`, `mach_continuous_time`, and `mach_timebase_info` from `libSystem` behind a `DarwinNative` interface, and returns a failure instead of throwing when it cannot load.
- `darwin.ts`: the macOS `ProcessInspector` decodes `kinfo_proc` at offsets checked against a C reference, with `KERN_PROC_PID` for one process and `KERN_PROC_ALL` for the listing (size query, fill, retry on `ENOMEM`), and the `DeadlineClock` converts continuous ticks with the timebase. Without the native calls, every read fails and the supervisor seals.
- `process-set.ts`: the macOS termination proof needs two consecutive empty listings, by the owner's decision of 2026-10-25 on the `KERN_PROC_ALL` race.
- Tests: fake-native unit tests, native tests and real-process supervisor tests on darwin only, and a test of the two-listing rule.
- The dependency inventory records per-platform optional packages from the lockfile, so that it stays the same on every host.
- Docs: the `koffi` row in the dependency register, the supervisor identity contract sections 4, 8, and 10, and the inventory description.

## Capabilities

### New Capabilities

### Modified Capabilities
- `worker-supervisor`: macOS native readers replace the fail-closed macOS requirement, and the macOS proof needs two consecutive listings.

## Impact

`@taskelith/worker-supervisor` gains its first native dependency; the published `taskelith` package is unchanged. The macOS launch path runs instead of sealing. The inventory script gains a branch for platform-specific packages. Items 20, 24, and 25 can run the macOS supervisor.
