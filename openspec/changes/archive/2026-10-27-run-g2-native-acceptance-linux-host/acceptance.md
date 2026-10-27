# G2 native acceptance: Linux entry on a native Linux host (item 25)

**Native-host evidence.** This table records the Linux entry `linux-ubuntu-24.04-x86_64` on a native Linux host with Docker Engine, not Docker Desktop. It is additional evidence of a native kernel and cgroup v2. It does not replace the GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 that the coordinator's brief of 2026-10-27 keeps open (design decision 1).

Recorded 2026-10-27 on commit `9a5ef14`. At that commit `results.jsonl` did not exist yet; the runs created it untracked, and the later commits add it and edit only this change's tracked records, so the runtime evidence stays fresh:

- `make native-acceptance ENTRIES=linux` ran with seed `1140438646` and wrote lines 1 to 11 of [results.jsonl](results.jsonl) ("line N" below). Each of these lines carries an `acceptance` field with its matrix entry, row, command, and platform.
- `make scenario-worker-namespace-confinement` (task 3.3) ran with seed `2677284533` and wrote line 12. It ran outside the runner, so line 12 has no `acceptance` field.

The rows are the G2 rows of the [native acceptance gates](../../../docs/worker-platforms.md#native-acceptance-gates). Resource budgets and real integrations belong to later gates and are not listed.

## Platform

| Entry | Host | OS in the containers | Architecture | Kernel | File system | Node.js | Docker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linux-ubuntu-24.04-x86_64` | native Ubuntu 26.04.1 LTS, cgroup v2 | Ubuntu 24.04.5 LTS, the digest-pinned Ubuntu 24.04 base (`Makefile:11`) | x86_64 | Linux 7.0.0-38-generic (the host's own kernel) | ext2/ext3 as reported by `stat -f` on Docker volumes (worker data root, test `/tmp`); storage driver overlayfs | v24.22.1 | Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0 |

## Table

Outcome is that of the proofs that ran. A row is **met (G2 part)** only when every listed proof passed and nothing of its G2 part is open.

| Row | Proof (target) | Outcome | Records | Open or failed reason |
| --- | --- | --- | --- | --- |
| Service lifecycle | `make scenario-worker-lifecycle` (`compose-installation`) | Passed: a fresh installation enrolled a worker, and its task ran as uid 10003 in `executions/` and exited 0. `installation-stop` and `installation-start` kept the same identity file on the volume with no new enrollment. The new process reconciled, reached the broker, and kept KILL, SETGID, and SETUID only. A second task ran as uid 10003 and exited 0 | lines 1, 2 | Partly open: reboot, a host supervisor (systemd or equivalent), and drain before upgrade are G6. |
| Process ownership | `make scenario-worker-kill` (`compose-installation`) | Passed: untimed `SIGKILL` after a planned pause of 13646 ms (13804 ms measured). The restarted worker reconciled and stayed up. The control plane held the execution `started+uncertain` and the result `pending`, as the worker journal did | lines 3, 4 | See the composed crash-windows row below. |
| Process ownership | `make verify-linux-cgroup` (`linux-test-container`) | Passed: 14 of 14 privileged cgroup tests | line 5 | See the composed crash-windows row below. |
| Process ownership | `make scenario-worker-namespace-confinement` (`compose-installation`, task 3.3) | Passed: the applied seccomp profile (sha256 `4c5d107d…aed1`) equals `infra/installation/seccomp/worker.json`. The execution ran as uid 10003 in `executions/<id>` with `CapEff: 0000000000000000`, `NoNewPrivs: 1`, and `Seccomp: 2`, and exited 0. As the execution account, `unshare -U`, `unshare -Urm` with a tmpfs mount, `clone` with `CLONE_NEWUSER`, and `setns` were refused with EPERM, and `clone3` answered ENOSYS. The worker kept KILL, SETGID, and SETUID only, and `executions/` took a cgroup write | line 12 | Met for this host. The profile ran under this host's own kernel. AppArmor is `unconfined` for the worker, so no AppArmor confinement is claimed. |
| Journal and storage | journal and data-root suites in the test image (`linux-test-container`) | Passed: 95 of 97, with 2 skipped (the case-insensitive and macOS-only tests that 25b names) | line 6 | Met (G2 part) together with the next row. |
| Journal and storage | `make scenario-worker-disk-loss` (`compose-installation`) | Passed: with the journal gone, the worker refused journal loss and created no journal. After data-root loss and revocation, a new worker enrolled. The old execution stayed `started` with uncertain evidence and its reservation held. A new task exited 0 | lines 7, 8 | Met (G2 part). |
| Cancellation | `make verify-linux-cgroup PATTERN='cancel\|descendant'` (`linux-test-container`) | Passed: 2 of 2 privileged tests | line 9 | Open: start, cancel, and result races, disconnected workers, and stale generations at system level are 24c. |
| Cancellation | supervisor and command intake suites, tests named `cancel` or `descendant`, in the test image (`linux-test-container`) | Passed: 17 of 19, with 2 macOS-only tests skipped | line 10 | Open: as above, 24c. |
| Connectivity (G2) | offline launch and worker contact suites in the test image (`linux-test-container`) | Passed: 25 of 25 | line 11 | Open: partition, reconnect, and stale writes (24c); credential rotation (G3); epoch quarantine (G6). Revocation was exercised by the disk loss (line 7). |
| Process ownership | 24b crash windows W1 to W6 and CP1 to CP12 in a Linux composition (`harness-composition`) | Not run | None | Open: `apps/control-plane/test/crash-windows.integration.test.ts` skips them off Darwin. The composed Linux worker needs a delegated cgroup and an execution account. Only the privileged `verify-linux-cgroup` container provides them, and it has no network to the services (design decision 4). Carried to `close-g2`. |
| Connectivity (G2) | 24b duplicate delivery in a Linux composition (`harness-composition`) | Not run | None | Open: same composition as the crash windows (design decision 4). Carried to `close-g2`. |
| All rows | GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 (coordinator's brief of 2026-10-27) | Not run | None | Open: this host runs Ubuntu 26.04.1 LTS, not a GitHub-hosted `ubuntu-24.04` runner (design decision 1). D11 requires all four matrix entries and records any entry not established as open in the closure ADR. |

## Summary

All eight proofs of the Linux entry and the namespace-confinement scenario passed on a native x86_64 Linux kernel with cgroup v2 and Docker Engine. No proof failed, and none was skipped or retried. No product defect was observed.

Journal and storage is met in its G2 part on this host. Namespace confinement is met for this host. No row is fully accepted for the matrix entry:

- The composed crash windows and duplicate delivery on Linux stay open (design decision 4).
- The hosted-runner Linux x86_64 check of the coordinator's brief stays open.
- Every other row keeps an open part that 24c or later gates (G3, G6) own.
