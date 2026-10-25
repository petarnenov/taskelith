## 1. Dependency

- [x] 1.1 Add `koffi@3.3.3` and its four platform packages, exact-pinned, to `@taskelith/worker-supervisor`; check the lockfile and `npm ci --ignore-scripts`.
- [x] 1.2 Record platform-specific packages in the dependency inventory from the lockfile.

## 2. macOS adapter

- [x] 2.1 Confine `koffi` to `darwin-native.ts` behind a `DarwinNative` interface that fails closed.
- [x] 2.2 Read `kinfo_proc` through `KERN_PROC_PID` and `KERN_PROC_ALL` with retry on `ENOMEM`, and the deadline clock through `mach_continuous_time` and `mach_timebase_info`.
- [x] 2.3 Check `sizeof(struct kinfo_proc)` and the field offsets against a C reference on arm64 and x86_64.
- [x] 2.4 Require two consecutive empty listings in the macOS termination proof (owner decision of 2026-10-25).
- [x] 2.5 Enable the macOS launch path with unit tests and darwin-only native and real-process tests.

## 3. Records and verification

- [x] 3.1 Run qualification steps 1 to 6 of the `koffi` proposal and record the results.
- [x] 3.2 Add the `koffi` row to the dependency register with the owner's governance acceptance.
- [x] 3.3 Amend the supervisor identity contract sections 4, 8, and 10.
- [x] 3.4 Run `make verify` and record the results.
- [ ] 3.5 Obtain independent review (Claude Code, `claude-fable-5-1`, medium) and record results.
