# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

The coordinator's brief of 2026-10-25 under the agent task protocol, following G2 item 15 (`implement-process-supervisor`, archived). The branch was created from `origin/dev` at `e0db869`. Scope: `koffi` as an exact-pinned dependency of `@taskelith/worker-supervisor` only; the macOS `sysctl` (`KERN_PROC_PID`, `KERN_PROC_ALL`) and Mach clock readers behind the existing ports, in one adapter module; the C reference check of `kinfo_proc`; qualification steps 1 to 6 of [the proposal](../archive/2026-10-25-implement-process-supervisor/koffi-qualification.md); the dependency register row; the governance acceptance; and the macOS launch path with tests. Out of scope: other new dependencies and the Linux `CLOCK_BOOTTIME` cross-check, which the brief made optional.

## Owner decisions

- **D-A of item 15, 2026-10-25:** `koffi` approved. The governance risks, a single maintainer and no private reporting route, are accepted, mitigated by keeping `koffi` behind the `DeadlineClock` and `ProcessInspector` ports.
- **`KERN_PROC_ALL` race, 2026-10-25, option (b), relayed by the coordinator:** the author found in the XNU source that the listing is not fully a single-instant snapshot (design decision 6) and gave the coordinator three options. The owner chose (b): implement as briefed; prove macOS termination only by two consecutive empty listings; record the race in contract section 8 and here as a residual risk of the macOS proof, next to the reap-to-report signal risk, stating that the second listing narrows the race but does not close it; and test the two-listing rule.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: `darwin.ts` decodes and reads, `darwin-native.ts` binds; each read checks its preconditions in order and returns a `Result`; comments state constraints only.
- SOLID and hexagonal architecture: the supervisor still depends on the ports only; `DarwinNative` is the seam between the readers and the foreign function interface, so an adapter without `koffi` stays possible. The boundary check passes.
- Microkernel: no harness, provider, or vendor is named.
- Docker and Makefile: the Linux qualification ran in the digest-pinned Ubuntu 24.04 base; checks run through `make verify`.
- OpenAPI: no wire contract changes.
- OpenSpec: this change tracks the work; strict validation passes.
- Coverage: see the checks.
- Dependencies: `koffi@3.3.3` and four platform packages, all exact-pinned; nothing else.

Evidence check: offsets come from the C reference below; the listing behaviour from the XNU source at tag `xnu-12377.121.6` (`bsd/kern/kern_sysctl.c` `sysctl_prochandle`, `bsd/kern/kern_proc.c` `proc_iterate`, `bsd/kern/kern_sig.c` `killpg1`); the release notes from the `koffi/3.3.4` changelog upstream; the clock behaviour from measurements on this host.

## Qualification of the proposal's steps

Environment: macOS 26.6.2 (build 25G83) on arm64, Node v24.22.1, npm 12.2.1, Apple clang with the macOS 26.5 SDK, Docker Engine 29.6.1 on aarch64.

1. **Install.** `npm ci --ignore-scripts` (through `make dependency-inventory`) installed only `@koromix/koffi-darwin-arm64` on this host. The lockfile lists all 20 platform packages that `koffi@3.3.3` declares, among them the four supported ones with their `os`, `cpu`, and integrity. In an Ubuntu 24.04 container (`ubuntu:24.04@sha256:68ee2200…aff33ac`, glibc 2.39) with the official Node 24.22.1 tarball, checked against `SHASUMS256.txt`, `npm ci --ignore-scripts` with npm 12.2.1 on this repository's manifests and lockfile installed only `koffi-linux-arm64` on linux/arm64 and only `koffi-linux-x64` on linux/amd64 (manifest `sha256:a2d43bff…1b94dc`, emulated). Under Rosetta 2 with the official x64 Node 24.22.1 for macOS, `npm install --ignore-scripts koffi@3.3.3` in a scratch project installed only `koffi-darwin-x64`. Verified.
2. **Load.** `libSystem.B.dylib` loads on darwin-arm64, whose binary is ad-hoc and linker signed, and on darwin-x64 under Rosetta 2, whose binary is unsigned. `libc.so.6` loads on linux/arm64 and linux/amd64, where `getpid` matches `process.pid`. Verified, except native x86_64 hardware and native linux/amd64.
3. **`sysctl`.** A C reference built for both architectures ([source and output](../../../docs/qualification/koffi-3.3.3/)) printed `sizeof(struct kinfo_proc)` 648 and offsets `p_starttime` 0, `p_pid` 40, `e_ppid` 560, `e_pgid` 564, and `sizeof(struct timeval)` 16, the same on arm64 and on x86_64 under Rosetta 2. Through `koffi` on both, `KERN_PROC_PID` for the running process returned 648 bytes whose pid, parent, group, and start second match `ps`, and 0 bytes for a missing process; the size query of `KERN_PROC_ALL` returned whole entries plus slack; a fill into a 648-byte buffer returned `-1` with `errno` 12 (`ENOMEM`); a full fill returned whole entries. The adapter's retry on `ENOMEM` is covered with a fake, because a growing list cannot be forced. Verified on this host; native x86_64 hardware open.
4. **Mach clock.** `mach_timebase_info` returned 125/3 on arm64 and 1/1 under Rosetta 2. `mach_continuous_time` exceeded `mach_absolute_time` by 36,887 s on both, the time this host slept since boot, so the clock counts time asleep; the test suite checks that the deadline clock follows wall time since `kern.boottime` (4.3 s apart when measured). Verified.
5. **Linux `CLOCK_BOOTTIME`.** Not implemented, as the brief allows. Measured once: `clock_gettime(CLOCK_BOOTTIME)` through `koffi` equalled the first field of `/proc/uptime` to its two decimals on linux/arm64 and linux/amd64 (emulated).
6. **Packaging.** `make verify` runs `verify:package`, which inspects the published tarball; `@taskelith/worker-supervisor` is private, so `koffi` is not in it. The inventory records `koffi` with `LICENSE.txt` and the platform packages from the lockfile. The four supported platform tarballs were listed by hand: each has `index.js`, `package.json`, `README.md`, and the binaries (the Linux ones a glibc and a musl build), declares MIT, and has no license file. `koffi` vendors `node-addon-api` and `node-api-headers` with their licenses. `npm audit --omit=dev` reported nothing; the full `npm audit` reports only the two known findings in the release plugin's bundled npm ([dependency inventory](../../../docs/dependency-inventory.md#security-remediation-assessment)). osv.dev returned no advisory for `koffi@3.3.3` on 2026-10-25. Verified.
7. **Governance:** the owner's decision above.

## Checks

Environment as above; `make verify` runs with Docker for the services.

On `0dbc4aa`, before review: `make verify` passed: comment rule, workspace package contract and boundary checks, 718 tests including the darwin-only native and real-process tests, coverage 99.27% lines, 93.23% branches, 99.31% functions, contract compatibility, the dependency inventory (731 package paths), strict OpenSpec validation (48 items), the archive dry run, and package verification. An earlier run had failed type checking in `scripts/dependency-inventory.ts` and was fixed before the commit.

On `db3939f`, after the pass 1 fixes: `make verify` passed with 719 tests, coverage 99.28% lines, 93.31% branches, 99.31% functions; `darwin.js` 98.70% lines and 97.10% branches, `darwin-native.js` 95.74% and 77.78%, `process-set.js` 100% and 92.00%.

The two-listing test fails when `EMPTY_LISTINGS` is set to 1 and passes with 2. The worker-supervisor tests passed three runs in a row on this host.

## Independent review

Assigned reviewer: Claude Code with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt on stdin, run from the worktree; prompt and output files were kept outside the worktree.

- **Pass 1 — session `59c975d6-7df1-45a9-b579-b36208dd2660`, reviewed `0dbc4aa` (diff `e0db869...HEAD`).** A first invocation ended with `Error: No messages returned from query` and produced no session or review, so it is not counted; the same prompt was run again. `modelUsage` lists `claude-fable-5-1`. SHA-256 snapshots before and after were equal (`578c1bac…b3a2c2`). The reviewer ran the comment, strict validation, dependency, build, and boundary checks and the package and inventory tests on this host; its attempt to compile its own C reference was denied by its sandbox. Findings: 0 Critical, 0 High, 1 Medium, 6 Low. Resolutions, in `db3939f`:
  1. Medium: the fake-native tests ran only on darwin because the boot identity came from the `sysctl` command, so Linux CI never ran the `ENOMEM`, attempt bound, and clock logic. The boot identity reader is injected into `DarwinProcessInspector` and `darwinPlatform`, and those tests run on every platform; only the tests against the live kernel stay darwin-only.
  2. Low: every read started a `sysctl` process for the boot identity, also between the two listings. The inspector keeps the boot identity once read, since no process outlives its boot, and reads again after a failure; a test covers both.
  3. Low: the self-check claimed passing checks while this section was pending. Recorded above.
  4. Low: the two-listing rule was a one-line loop. It is `proveByConsecutiveListings`.
  5. Low: installed inventory records have no `inspected` or `platform` field. Documented in the dependency inventory description rather than adding the fields to every installed record.
  6. Low: a `koffi` call that throws escaped the `Result` path. `DarwinNative` returns `Result` from every call, and `darwin-native.ts` turns a throw into a failure; tests cover a failing `sysctl` and clock.
  7. Low: the register omitted `p_pid` and the C reference was not kept. `p_pid` is listed, and the source and output are in `docs/qualification/koffi-3.3.3/`.

## Limitations

- Native x86_64 macOS hardware was not available; x86_64 ran under Rosetta 2 on arm64. Native linux/amd64 was emulated.
- The `KERN_PROC_ALL` race and the reap-to-report signal race remain residual risks of the macOS proof (contract section 8).
- The binaries cannot be traced to the upstream tag, and the statically linked runtime in them was not audited.
- Real-process macOS tests are timing dependent, like the privileged Linux tests.

## Remaining gates

Independent review; integration into `dev` and archive by the coordinator; native x86_64 macOS and the macOS rows of item 25; promotion to `main`.
