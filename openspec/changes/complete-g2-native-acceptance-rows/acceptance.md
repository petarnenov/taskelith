# G2 native acceptance: Linux cancellation and connectivity rows on a native Linux host (G3 item 43)

**Native-host evidence, Linux x86_64 only.** This table records the Linux entry `linux-ubuntu-24.04-x86_64` on a native Linux host with Docker Engine, not Docker Desktop. It adds the system-level cancellation part and the connectivity part of the G2 rows that 25b, 25c, and `run-g2-native-acceptance-linux-host` left to 24c, now run through the worker's Linux cgroup supervisor ([design](design.md) decisions 2 and 8). It does not cover the macOS entries, race g, the `macos-26-arm64` re-run, or `linux-ubuntu-24.04-arm64`, and it does not replace the GitHub-hosted `ubuntu-24.04` runner record, which is re-dispatched after the merge.

Recorded 2026-10-28 on commit `c8e624d6` by two runs of `make native-acceptance ENTRIES=linux` into [results.jsonl](results.jsonl) ("line N" below):

- seed `20261026` (`TASKELITH_TEST_SEED=20261026`), 02:17:35 to 02:24:56 local, exit 0, `every proof passed`: lines 1 to 61;
- seed `7`, 02:24:56 to 02:32:16 local, exit 0, `every proof passed`: lines 62 to 122.

Each run wrote 61 records, all `passed`, all on commit `c8e624d606f93c6c69b033cec92e158dcadbea63`, each with an `acceptance` field naming its entry, row, command, and platform: 12 proofs and 49 own records of the scenarios they ran. The seeds are those of 24c's evidence. Below, "lines A; B" name the line in the first run and in the second (B is A plus 61). The rows are the G2 rows of the [native acceptance gates](/docs/worker-platforms.md#native-acceptance-gates); resource budgets and real integrations belong to later gates.

## Platform

| Entry | Host | OS in the containers | Architecture | Kernel | File system | Node.js | Docker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linux-ubuntu-24.04-x86_64` | native Ubuntu 26.04.1 LTS, cgroup v2 | Ubuntu 24.04.5 LTS, the digest-pinned base | x86_64 | Linux 7.0.0-38-generic (the host's own kernel) | ext4 on Docker volumes (worker data root, test `/tmp`), storage driver overlayfs | v24.22.1 | Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0 |

## Table

Outcome is that of the proofs that ran. A row is **met (G2 part)** only when every listed proof passed and nothing of its G2 part is open on this entry.

| Row | Proof (target) | Outcome | Records | Open or failed reason |
| --- | --- | --- | --- | --- |
| Cancellation | `make verify-linux-g2-scenarios FILES="test/g2-cancellation-races.test.ts test/g2-stale-generations.test.ts"` (`harness-composition`, new) | Passed in both runs: tests 12, pass 11, skipped 1 (race g, not applicable on Linux). Races a to f, h, and the rejected launch that frees its slot; the stale ownership generation, the stale recovery epoch, and the old-epoch exit kept as evidence. Every scenario worker launched through the cgroup supervisor as the execution account; a started process ended by the containment kill, `SIGKILL` (races c, e, and one granted round of f in each run: race c after the start with seed `20261026`, after W4 and before the start with seed `7`; lines 45, 48, 50; 106, 109, 111), and races c and h checked that their scripted process ran under the delegated cgroup | lines 43 to 54; 104 to 115 | Met (G2 part) on this entry, together with the earlier cancellation proofs of the same runs (lines 9, 10; 70, 71). Race g stays with item 43 on the macOS entries. |
| Connectivity (G2) | `make verify-linux-g2-scenarios FILES=test/g2-partition.test.ts` (`harness-composition`, new) | Passed in both runs: tests 6, pass 6. Worker to NATS: before the offer, the inventory exchange after a reconnect, while the process runs; control plane to PostgreSQL: during authorization, while the process runs, beyond the redelivery budget. Stale writes are the stale-epoch scenarios of the cancellation proof (lines 47, 49, 51; 108, 110, 112) | lines 55 to 61; 116 to 122 | Partly open: credential rotation (G3 item 26) and epoch quarantine (G6); sleep and wake has no Linux requirement. Partition, reconnect, stale writes, duplicate delivery (lines 41, 42; 102, 103), offline launch and worker contact (suites 25 of 25, lines 11; 72), and revocation (the disk loss, lines 7; 68) are proven on this entry. |
| Connectivity (G2) | duplicate delivery through `make verify-linux-crash-windows PATTERN=redelivered` (`harness-composition`) | Passed: one intent, one execution, one result (3 copies during and 1 after; 2 during and 3 after) | lines 41, 42; 102, 103 | See the row above. |
| Process ownership | crash windows through `make verify-linux-crash-windows SKIP_PATTERN=redelivered` (`harness-composition`); `make scenario-worker-kill`; `make verify-linux-cgroup` | Passed: crash windows 28 of 28 in each run; worker kill; privileged cgroup tests 17 of 17 | lines 3 to 5, 12 to 40; 64 to 66, 73 to 101 | Unchanged by this change; its disposition is that of `run-g2-crash-windows-on-linux` and #367. |
| Service lifecycle, Journal and storage | `make scenario-worker-lifecycle`; journal and data-root suites; `make scenario-worker-disk-loss` | Passed in both runs (journal suites 101 of 103, 2 skipped) | lines 1, 2, 6 to 8; 62, 63, 67 to 69 | Unchanged by this change. |

## Not applicable

- The Intel iMac (Docker Desktop) for the Docker-Engine evidence of the Linux worker image: Docker Desktop gives no host network outside its virtual machine, which the privileged runner needs. The hosted `ubuntu-24.04` runner of `.github/workflows/linux-acceptance.yml` gives that evidence, re-dispatched after the merge.
- `linux-ubuntu-24.04-arm64`: not run. GitHub offers the hosted `ubuntu-24.04-arm` runner to this public repository ([verification](verification.md#hosted-arm64-runner)); a dispatch on it is a follow-up.

## Summary

Every proof of both runs passed, 122 records in all, and no product defect was observed. On `linux-ubuntu-24.04-x86_64` on this native host the Cancellation row is met for its G2 part, and the Connectivity (G2) row keeps only the parts that later gates own. Item 43 stays open for the macOS entries, race g, the `macos-26-arm64` re-run, `linux-ubuntu-24.04-arm64`, and the hosted re-dispatch.
