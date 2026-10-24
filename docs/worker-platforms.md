# Initial worker platform contract

Scope selected by the owner on 2026-10-24: **Linux and macOS**. Neither worker is implemented or accepted yet. See [ADR 0002](decisions/0002-linux-macos-worker-scope.md).

## Shared contract

Both OS families use the same remote protocol and ownership rules, including when server and worker share a machine. Product-owned code remains TypeScript. Native capabilities are adapters behind explicit ports; OS observations cannot bypass central authorization or replace durable process evidence. No platform may claim a capability merely because the other one implements it.

Qualify exact supported OS/distribution releases, CPU architectures, Node binaries, native dependencies, and agent executables before freezing the support matrix. The current developer machine and GitHub runner labels are observations, not a complete support matrix.

## Native acceptance gates

| Area | Linux evidence required | macOS evidence required |
| --- | --- | --- |
| Service lifecycle | Qualify the containerized worker: a digest-pinned worker image (with its harnesses) run by a supervised container runtime, with systemd or an equivalent supervisor as a candidate; fresh install/start/stop/restart, reboot, dedicated account, environment, permissions, persistent volumes, and drain before upgrade. | Qualify a launchd adapter; distinguish per-user agent from system daemon. Test the chosen installation mode, logout/login if applicable, reboot, service account, and drain before upgrade. |
| Process ownership | Crash before/after child launch and handle persistence; prove stable process identity and adoption or report uncertainty, including PID reuse and supervisor restart. | Run the same crash/adoption tests using native macOS process evidence. A PID alone or passing Linux behavior cannot establish ownership. |
| Journal and storage | Test persistent local filesystem behavior, interrupted writes, flush failures, full disk, permissions, lock ownership, and corrupt/missing journals. | Test the same boundaries on qualified macOS filesystems, including case sensitivity and paths containing spaces. Do not assume atomic rename or flush alone proves the full protocol. |
| Cancellation | Race start/cancel/result; verify descendants and terminal evidence, including disconnected workers and stale generations. | Verify native process-tree behavior, descendants, and the same cancellation races; do not substitute UI disconnect or worker exit for execution termination evidence. |
| Resource budgets | Measure and qualify supported CPU/memory/disk/process controls; distinguish reservations from hard enforcement and fail admission for mandatory unsupported controls. | Independently qualify available controls; do not advertise Linux resource features as macOS guarantees. Explicitly reject work requiring unavailable enforcement. |
| Connectivity and recovery | Partition/reconnect, duplicate addressed commands, offline launch denial, credential rotation/revocation, epoch quarantine, and stale writes. | Run equivalent native worker tests; also test sleep/wake and network changes without automatically reassigning uncertain execution. |
| Real integrations | Execute the qualified first harness and SCM workflow, with evidence and restart-safe chat/approval behavior. | Prove that the same selected harness and dependencies work on the selected macOS/CPU target; unsupported provider binaries block acceptance. |

Linux workers ship as digest-pinned OCI images ([ADR 0004](decisions/0004-first-class-engineering-principles.md)); the container runtime and its supervision remain to be qualified. macOS workers run natively, and their service packaging is not selected by this document. The systemd [service documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html) and Apple's archived [launchd guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) inform the candidates; neither is evidence that Taskelith's lifecycle or recovery works. In particular, a user agent's login lifecycle must be evaluated before claiming unattended host operation.

## Evidence and release limits

Record OS/distribution version, CPU architecture, runtime/native dependency versions, filesystem, service mode, scenario inputs, and exact source revision with each result. Tests on a Linux VM/container cannot establish native macOS acceptance; a macOS host does not prove Linux recovery. Label tests as unit, integration, native worker, or fleet drills accurately. Keep unresolved scenarios visible before the G3 fresh-install and G6 operational gates.

No service installation, native package, worker enrollment, native acceptance result, or Windows support is introduced by recording this contract.
