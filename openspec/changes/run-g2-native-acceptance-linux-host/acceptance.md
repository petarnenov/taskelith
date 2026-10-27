# G2 native acceptance: Linux entry on a native Linux host (item 25)

**Native-host evidence.** This table records the Linux entry `linux-ubuntu-24.04-x86_64` on a native Linux host with Docker Engine, not Docker Desktop. It is additional evidence of a native kernel and cgroup v2, and it does not replace the D11 `ubuntu-24.04` hosted-runner entry (design decision 1).

Status: skeleton. The evidence run of `make native-acceptance` (task 3.2) has not run yet; its commit, seed, and [results.jsonl](results.jsonl) lines ("line N" below) are filled in when it does. Each line will carry an `acceptance` field with its matrix entry, row, command, and platform. The rows are the G2 rows of the [native acceptance gates](../../../docs/worker-platforms.md#native-acceptance-gates); resource budgets and real integrations belong to later gates and are not listed.

## Platform

The platform record of the dry run on `4a2b45a` ([verification.md](verification.md)); the evidence run records its own.

| Entry | Host | OS in the containers | Architecture | Kernel | File system | Node.js | Docker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linux-ubuntu-24.04-x86_64` | native Ubuntu 26.04.1 LTS, cgroup v2 | Ubuntu 24.04.5 LTS, the digest-pinned Ubuntu 24.04 base (`Makefile:11`) | x86_64 | Linux 7.0.0-38-generic (the host's own kernel) | ext2/ext3 as reported by `stat -f` on Docker volumes (worker data root, test `/tmp`); storage driver overlayfs | v24.22.1 | Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0 |

## Table

Outcome is that of the proofs that ran; a row is **met (G2 part)** only when every listed proof passed and nothing of its G2 part is open.

| Row | Proof (target) | Outcome | Records | Open or failed reason |
| --- | --- | --- | --- | --- |
| Service lifecycle | `make scenario-worker-lifecycle` (`compose-installation`) | Pending evidence run | TODO | TODO |
| Process ownership | `make scenario-worker-kill` (`compose-installation`) | Pending evidence run | TODO | TODO |
| Process ownership | `make verify-linux-cgroup` (`linux-test-container`) | Pending evidence run | TODO | TODO |
| Process ownership | `make scenario-worker-namespace-confinement` (`compose-installation`, task 3.3) | Held, not run | None | Held: its inputs overlap `report-all-unconfirmed-sealed-executions`, which is not on `dev` yet (see [verification.md](verification.md)); runs after that change merges. |
| Journal and storage | journal and data-root suites in the test image (`linux-test-container`) | Pending evidence run | TODO | TODO |
| Journal and storage | `make scenario-worker-disk-loss` (`compose-installation`) | Pending evidence run | TODO | TODO |
| Cancellation | `make verify-linux-cgroup PATTERN='cancel\|descendant'` (`linux-test-container`) | Pending evidence run | TODO | TODO |
| Cancellation | supervisor and command intake suites, tests named `cancel` or `descendant`, in the test image (`linux-test-container`) | Pending evidence run | TODO | TODO |
| Connectivity (G2) | offline launch and worker contact suites in the test image (`linux-test-container`) | Pending evidence run | TODO | TODO |
| Process ownership | 24b crash windows W1 to W6 and CP1 to CP12 in a Linux composition (`harness-composition`) | Not run | None | Open: `apps/control-plane/test/crash-windows.integration.test.ts` skips them off Darwin; the composed Linux worker needs a delegated cgroup and an execution account, which only the privileged `verify-linux-cgroup` container provides, and it has no network to the services (design decision 4). Carried to `close-g2`. |
| Connectivity (G2) | 24b duplicate delivery in a Linux composition (`harness-composition`) | Not run | None | Open: same composition as the crash windows (design decision 4). Carried to `close-g2`. |
| All rows | D11 `ubuntu-24.04` GitHub-hosted runner entry | Not run | None | Open: this host runs Ubuntu 26.04.1 LTS, not the pinned `ubuntu-24.04` hosted runner (design decision 1). |

## Summary

TODO after the evidence run.
