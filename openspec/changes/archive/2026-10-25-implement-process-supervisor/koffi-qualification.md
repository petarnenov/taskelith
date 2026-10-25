# Proposed qualification evidence: `koffi`

Status: the author's proposal for open owner decision D-A of this change, which a Claude Fable 5.1 subagent deferred to the owner on 2026-10-25 under the owner's delegation. Nothing here is installed or loaded. The format follows the G2 infrastructure evaluation ([g2-infrastructure](../../../docs/g2-infrastructure.md)) and the register's "G2 infrastructure" table. Observed on 2026-10-25 from the npm registry, the upstream repository, and a static review of the downloaded tarballs. Every runtime claim is **unverified**: no binary was loaded or run.

## Purpose

`koffi` is a Node-API foreign function interface. It would let the worker supervisor call from TypeScript, without product code in another language:

- on macOS: `sysctl` with `KERN_PROC_PID` and `KERN_PROC_ALL` for `kinfo_proc` (`p_starttime`, `e_pgid`, `e_ppid`) and a single-instant listing, and `mach_continuous_time` with `mach_timebase_info`;
- on Linux: `clock_gettime(CLOCK_BOOTTIME)`, as a cross-check of `/proc/uptime`.

## Evidence

| Field | Evidence |
| --- | --- |
| Exact version | `koffi@3.3.4`, published 2026-10-24T15:52:03Z; only dist-tag `latest`. |
| Integrity and provenance | `sha512-31Vr+LM+w1dEsNcOJtJWvYyUTjVc/SWOxNDZJxfhsBC6qZ5YVn98n5x1oBbDq5skxCbWD4SByJpNmq63fvg9Aw==`. No provenance attestation and no `gitHead`; published from the maintainer's local tarball. Sampled sources (`ffi.cc`, `call.cc`, `abi/arm64.cc`, `abi/x64sysv.cc`) are byte-identical to the tag; the binaries cannot be traced to it. |
| Source | Monorepo [Koromix/rygel, tag `koffi/3.3.4`](https://github.com/Koromix/rygel/tree/koffi/3.3.4/src/koffi), commit `9bca1fc25425ee9beacfcb9b6e8f65a53d77d1e0` (tag not signature-verified). |
| Maintenance | 28 stable releases in the 12 months before observation (3.3.3 on 2026-10-10, 3.3.2 on 2026-09-27, 3.3.0 on 2026-09-14). 3.0.0 on 2026-05-16 was a rewrite; 2.x still received fixes (2.16.3 on 2026-07-21). Several releases fix regressions of the previous one. |
| Maintainers | One (`koromix`); the next repository contributor has 4 commits. |
| License | MIT, bundling MIT `node-addon-api` and `node-api-headers`. The statically linked runtime in the `.node` files was not audited. |
| Node engine | No `engines` field; documentation states Node 16 or later; Node-API 8. No statement on Node 24 **(unverified for Node 24.22.1)**. |
| Prebuilt binaries | Per-platform optional packages `@koromix/koffi-<os>-<cpu>@3.3.4`, exact-pinned, without scripts or dependencies. `linux-x64` and `linux-arm64`: glibc and musl, glibc 2.25 or later (Ubuntu 24.04 has 2.39). `darwin-x64`: unsigned, macOS 11 or later. `darwin-arm64`: ad-hoc signed, cross-built and **not tested upstream**. |
| Install scripts | The install script only checks the prebuilt binary or rebuilds it with CMake; the loader requires the platform package first, so `npm ci --ignore-scripts` should suffice **(unverified)**. |
| Advisories | None on osv.dev, the GitHub advisory database, or the npm bulk advisory endpoint, queried 2026-10-25. The changelog has memory-safety fixes without advisories, for example a buffer overflow in 3.3.2. |
| Security reporting | No `SECURITY.md`; GitHub private vulnerability reporting is disabled; bugs go to public issues. |
| Transitive dependencies | None besides the optional platform package of the host. |
| Adoption | `edge-impulse-linux-cli` and `rticonnextdds-connector-js` use it, verified at pinned commits, but only on 2.x. |

## Draft register row

| Package | Role | License and runtime | Upstream | Status and remaining evidence |
| --- | --- | --- | --- | --- |
| `koffi@3.3.4` with `@koromix/koffi-{linux-x64,linux-arm64,darwin-x64,darwin-arm64}@3.3.4` | Native calls for the worker supervisor: `sysctl` `KERN_PROC_PID` and `KERN_PROC_ALL`, `mach_continuous_time`, and `mach_timebase_info` on macOS; `clock_gettime(CLOCK_BOOTTIME)` on Linux | MIT; Node-API 8 prebuilt binaries in per-platform optional packages | [koffi 3.3.4](https://github.com/Koromix/rygel/tree/koffi/3.3.4/src/koffi) | `candidate`, not installed. One maintainer, no provenance, no private reporting route, `darwin-arm64` untested upstream, no Node 24 statement. The open steps are below. |

## Open qualification steps

1. `npm ci --ignore-scripts` on every matrix entry. Confirm that only the matching platform package is installed and loads under Node 24.22.1. Check that a lockfile generated on one platform lists all optional platform packages.
2. Load `libSystem.B.dylib` on macOS and `libc.so.6` on Linux. On `darwin-arm64`, confirm that the ad-hoc signed binary loads.
3. On macOS, call `sysctl` for one process and for all processes with the size-query-then-fill pattern. Check `sizeof(struct kinfo_proc)` and the offsets of `p_starttime`, `e_ppid`, and `e_pgid` against a C reference built with the macOS 26 SDK on both architectures. Handle `ENOMEM` when the list grows between the two calls.
4. On macOS, call `mach_timebase_info` and `mach_continuous_time`, and show that the clock counts time asleep.
5. On Linux, compare `clock_gettime(CLOCK_BOOTTIME)` with `/proc/uptime` on both architectures.
6. Packaging: check the published package and the dependency inventory, review the licenses, and run `npm audit`.
7. Governance: the owner accepts or mitigates the single maintainer and the missing private reporting route. The FFI stays behind the `DeadlineClock` and `ProcessInspector` ports, so an adapter without `koffi` stays possible. The owner also decides whether to pin 3.3.4, one day old at observation, or 3.3.3.
