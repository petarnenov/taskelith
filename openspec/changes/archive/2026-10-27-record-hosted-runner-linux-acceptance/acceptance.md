# G2 native acceptance: Linux x86_64 entry on a GitHub-hosted runner

**Hosted-runner evidence.** This table records the Linux entry `linux-ubuntu-24.04-x86_64` on one GitHub-hosted `ubuntu-24.04` x86_64 runner with Docker Engine. It is the hosted-runner Linux x86_64 check that the Linux-host run kept open ([its acceptance](/openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/acceptance.md), last table line) and that [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 left open as a non-blocking follow-up.

## The run

- GitHub Actions run 40534340382 of the workflow "Linux acceptance" (`.github/workflows/linux-acceptance.yml`), event `workflow_dispatch` on branch `dev`, conclusion `success`: <https://github.com/petarnenov/taskelith/actions/runs/40534340382>.
- One job, `linux-x86_64` (ID 122295371633), on `ubuntu-24.04`, started 2026-10-27T15:46:44Z and completed 15:54:27Z (7 min 43 s); every step succeeded.
- Head commit `4fe094562e6ccb9e568dee91be24ff2c93108004`, the merge of #355 (`run-hosted-runner-linux-check`) into `dev` (design decision 1).
- `make native-acceptance ENTRIES=linux` with seed `3469395170` wrote the 42 lines of [results.jsonl](results.jsonl) ("line N" below), recorded from 15:51:10Z to 15:54:22Z. Every line has outcome `passed`, commit `4fe09456`, and an `acceptance` field with entry `linux-ubuntu-24.04-x86_64`, its row, its proof, and the same platform. `run.log` ends with "native-acceptance.sh: every proof passed; see /home/runner/work/_temp/acceptance/results.jsonl".
- The artifact `linux-x86_64-acceptance`, kept for 90 days, also holds `run.log`, `environment.txt`, `disk-before.txt`, and `disk-after.txt`; they are not copied here (design decision 2).

## Platform

| Entry | Host | OS in the containers | Architecture | Kernel | File system | Node.js | Docker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linux-ubuntu-24.04-x86_64` | GitHub-hosted runner image `ubuntu-24.04`: Ubuntu 24.04.5 LTS, 4 CPUs, 15.61 GiB memory, cgroup v2 (`cgroup2fs`), cgroup driver `systemd`, engine security options `apparmor`, `seccomp` (builtin profile), and `cgroupns` | Ubuntu 24.04.5 LTS, the digest-pinned Ubuntu 24.04 base | x86_64 (records: `x64`) | Linux 6.17.0-1022-azure (the runner's own kernel) | ext4 on Docker volumes (worker data root, test container's temporary directory); storage driver overlay2 on extfs | v24.22.1 | Docker Engine - Community 28.0.4 (not Docker Desktop), Docker Compose 2.38.2, containerd v2.4.1, runc 1.5.2 |

The root file system had 86 GiB free before the cleanup step and 103 GiB after it (`df -h /`, 145 GiB).

## Table

Outcome is that of the proofs that ran. A row is **met (G2 part)** only when every listed proof passed and nothing of its G2 part is open.

| Row | Proof (target) | Outcome | Records | Open or failed reason |
| --- | --- | --- | --- | --- |
| Service lifecycle | `make scenario-worker-lifecycle` (`compose-installation`) | Passed: a fresh installation enrolled a worker whose task ran as uid 10003 in `executions/` and exited 0. `installation-stop` and `installation-start` kept the same identity file on the volume with no new enrollment. The new process reconciled, reached the broker, and kept KILL, SETGID, and SETUID only. A second task ran as uid 10003 and exited 0 | lines 1, 2 | Partly open: reboot, a host supervisor (systemd or equivalent), and drain before upgrade are G6. |
| Process ownership | `make scenario-worker-kill` (`compose-installation`) | Passed: `SIGKILL` after a planned pause of 20170 ms (20288 ms measured from the submission's answer). Executions were `exited` just after the kill. The restarted worker reconciled and stayed up. The control plane then held the execution `exited` and the result "ended exited code 0 start-proven", as the worker journal did | lines 3, 4 | The kill came after the task had exited, so this proof does not show a restart with a kept journal after a kill during a running execution (design, "Risks and limitations"). |
| Process ownership | `make verify-linux-cgroup` (`linux-test-container`) | Passed: 14 of 14 privileged cgroup tests | line 5 | None for this proof. |
| Process ownership | `make verify-linux-crash-windows SKIP_PATTERN=redelivered` (`harness-composition`) | Passed: 28 of 28. W1 to W6 before and after (W5 as W5s and W5e), CP1 to CP12, and the two sequence cases each recovered with at most one spawn: to `exited-code-0`, and CP7, CP8, and CP9 to `exited-unknown` | lines 12 to 40 (line 40 is the proof, lines 12 to 39 its windows) | Not marked met: every process ownership proof passed, crash windows included, but the `scenario-worker-kill` proof killed the worker after the task had exited (design decision 4). ADR 0015 decision 5 keeps, before Linux worker support is claimed: the arm64 Linux entry, and a root test process in the privileged test image rather than the worker image with its seccomp profile. |
| Journal and storage | journal and data-root suites in the test image (`linux-test-container`) | Passed: 97 of 99, with 2 skipped (the case-insensitive test on a case-sensitive volume, and a macOS-only test) | line 6 | Met (G2 part) together with the next row. |
| Journal and storage | `make scenario-worker-disk-loss` (`compose-installation`) | Passed: with the journal gone and the identity kept, the worker refused journal loss and created no journal. After data-root loss and revocation, a new worker enrolled. The old execution stayed `started` with uncertain evidence and its reservation held. A new task exited 0 on the new worker | lines 7, 8 | Met (G2 part). |
| Cancellation | `make verify-linux-cgroup PATTERN='cancel\|descendant'` (`linux-test-container`) | Passed: 2 of 2 privileged tests | line 9 | Open: start, cancel, and result races, disconnected workers, and stale generations at system level, left to 24c, are deferred to G3 (ADR 0015 decision 5, "Cancellation race g and the 24c-dependent rows on macOS and Linux"). |
| Cancellation | supervisor and command intake suites, tests named `cancel` or `descendant`, in the test image (`linux-test-container`) | Passed: 17 of 19, with 2 macOS-only tests skipped | line 10 | Open: as above. |
| Connectivity (G2) | offline launch and worker contact suites in the test image (`linux-test-container`) | Passed: 25 of 25 | line 11 | Open: partition, reconnect, and stale writes (left to 24c, deferred to G3); credential rotation (G3); epoch quarantine (G6). Revocation was exercised by the disk loss (line 7). |
| Connectivity (G2) | `make verify-linux-crash-windows PATTERN=redelivered` (`harness-composition`) | Passed: 1 of 1. Duplicate delivery: 1 copy during and 3 after the execution; one intent, one execution, one result | lines 41, 42 (line 42 is the proof) | Open: as above. |

## Summary

All ten proofs of the Linux entry passed on a GitHub-hosted `ubuntu-24.04` x86_64 runner: 42 records, all `passed`, of commit `4fe09456`, by row process ownership 32, journal and storage 3, connectivity 3, service lifecycle 2, and cancellation 2. No proof failed, each ran once (`run.log`), and no product defect was observed.

On this runner, journal and storage is met in its G2 part. Every process ownership proof passed, crash windows included, but the `scenario-worker-kill` proof killed the worker after the task had exited, so process ownership is not marked met. No row is fully accepted for the matrix entry.

## What this run does not show

- Other entries: `linux-ubuntu-24.04-arm64`, `macos-26-arm64`, and `macos-26-x86_64` did not run; nor did other runner images or a Docker Desktop VM.
- Later revisions: the records are of `4fe09456`, not of later `dev` commits (design decision 1).
- The cancellation and connectivity parts left to 24c, credential rotation, epoch quarantine, and the service lifecycle beyond G2 (reboot, host supervisor, drain): no proof of this run covers them, and their deferrals stand.
- The worker image under the crash windows: they ran as root in the privileged test image, not in the installation's worker image with its seccomp profile and capability set.
- Namespace confinement and AppArmor: `scenario-worker-namespace-confinement` did not run (design decision 5). The engine lists AppArmor as a security option, but the worker's AppArmor profile was not recorded, so no AppArmor or SELinux confinement is claimed.
- A restart with a kept journal after a kill of the worker during a running execution: the `scenario-worker-kill` proof killed after the task had exited. The disk-loss proof killed the worker with its attempt started (line 7), but then removed the journal.
- Resource budgets and real integrations, which belong to later gates.
