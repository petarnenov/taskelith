## Context

G2 item 15 built the supervisor against the `DeadlineClock` and `ProcessInspector` ports and left the macOS platform failing closed until decision D-A. On 2026-10-25 the owner approved `koffi`, accepted its single maintainer and missing private reporting route as mitigated by the ports, and, on the coordinator's question, decided how to treat the `KERN_PROC_ALL` race (below). The contract is [the supervisor identity contract](../../../docs/contracts/supervisor-identity.md); the qualification proposal is [koffi-qualification.md](../archive/2026-10-25-implement-process-supervisor/koffi-qualification.md).

## Goals / Non-Goals

**Goals:** read process identities, parents, groups, and a full listing, and the suspend-counting clock, on macOS from TypeScript; keep `koffi` replaceable; fail closed without it; enable the macOS launch path.

**Non-Goals:** the Linux `CLOCK_BOOTTIME` cross-check (optional in the brief; measured once in the qualification, not implemented); reading `kern.bootsessionuuid` natively (it stays the `sysctl` command); the native acceptance of item 25.

## Decisions

1. **`koffi@3.3.3`, not 3.3.4.** 3.3.4 changed asynchronous calls, configuration errors after loading, and a GCC build; this use makes synchronous calls only. 3.3.4 was one day old, and 3.3.3 fixes a crash under Rosetta, which the x86_64 check uses. The four supported platform packages are also exact-pinned optional dependencies of the package, as the brief asks; the lockfile lists all 20 that `koffi` declares.
2. **One module loads `koffi`.** `darwin-native.ts` loads it through `createRequire` on first use and returns a `Result<DarwinNative>`. `darwin.ts` depends only on the `DarwinNative` interface: raw `sysctl` with a buffer, continuous ticks, and the timebase. Another binding, or a test fake, can implement it. A load that throws becomes a failure, and the clock, identities, and listing return it, so the supervisor seals as before. `hostPlatform` loads the native calls only on macOS, so Linux never loads `koffi`.
3. **Decode bytes at fixed offsets.** Rather than describe all of `struct kinfo_proc` to `koffi`, the adapter passes a buffer and reads `p_starttime` (seconds at 0, microseconds at 8), `p_pid` (40), `e_ppid` (560), and `e_pgid` (564) of a 648-byte entry. A C reference built with the macOS 26.5 SDK printed the same size and offsets for arm64 and x86_64. The start time is microseconds since the epoch, a safe integer, as section 10 of the contract states.
4. **Listing.** `KERN_PROC_ALL` is called with a size query and a fill. The kernel adds slack to the size; when the fill still reports `ENOMEM`, the list grew, and the adapter queries again, up to five attempts, then fails. A fill length that is not a multiple of the entry size is invalid. `KERN_PROC_PID` returns length 0 for a missing process, which is `undefined`.
5. **Clock.** Milliseconds are `mach_continuous_time × numer ÷ denom ÷ 10^6` in `bigint`, so no precision is lost before the division. The boot identity of a reading comes from the inspector, as on Linux.
6. **Two consecutive empty listings (owner decision, 2026-10-25, option b).** XNU's `sysctl_prochandle` takes the process IDs under `proc_list_lock` through `proc_iterate`, skipping processes in `SIDL`, then copies each entry without the lock; a process reaped between the two steps is dropped. A group member that forks after the IDs were taken and is reaped before its entry is copied hides its child from that listing. `killpg(pgid, 0)` iterates the group the same way, so it does not close the race either. The proof therefore takes a second listing right after an empty one and proves termination only when both are empty. This narrows the race to two coinciding windows but does not close it; the remainder is a residual risk recorded in contract section 8 next to the reap-to-report signal risk.
7. **Inventory of platform packages, a necessary extension of scope accepted by the coordinator on 2026-10-25.** The inventory read every locked package from `node_modules`, but a platform package is installed only on its platform, so the retained evidence would differ between macOS and Linux. A package that the lockfile restricts by `os` or `cpu` is now recorded from the lockfile alone, with `"inspected": false` and its platform; a missing license declaration is still a gap. The supported platforms' tarballs were inspected by hand.

## Risks / Trade-offs

- The listing race of decision 6 and the reap-to-report signal risk of the contract remain residual risks of the macOS proof.
- `koffi` has one maintainer, no provenance attestation, and no private reporting route; the owner accepted this with the port boundary as mitigation.
- The `darwin-x64` binary is unsigned and was checked only under Rosetta 2 on an arm64 host; linux/amd64 only emulated.
- Real-process macOS tests depend on timing (50 ms polls in the scenario fixture), like the privileged Linux tests.
