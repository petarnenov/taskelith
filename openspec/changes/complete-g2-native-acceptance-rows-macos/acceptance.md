# G2 native acceptance: macOS x86_64 cancellation and connectivity rows and race g (G3 item 43)

**Native-host evidence, `macos-26-x86_64` only.** This table records the macOS entry on the coordinator's 2020 Intel iMac, natively. It adds the system-level cancellation part and the connectivity part of the G2 rows that 25c left to 24c on this entry, now run through the worker's own macOS supervisor ([design](design.md) decisions 1, 2, and 6), and cancellation race g, an adopting macOS supervisor that does not apply a cancel (decision 5). It does not cover `macos-26-arm64` or its process ownership re-run, `linux-ubuntu-24.04-arm64`, or the hosted `ubuntu-24.04` re-dispatch, which stay open under item 43.

Recorded 2026-10-28 on commit `8796da32`, after review pass 1, by two runs of `make native-acceptance ENTRIES=macos`, each under the host-wide Docker slot, into [results.jsonl](results.jsonl) ("line N" below):

- seed `20261026` (`TASKELITH_TEST_SEED=20261026`), 11:04:10 to 11:10:52 local, exit 0, `every proof passed`: lines 1 to 57;
- seed `7`, 11:10:58 to 11:21:08 local, exit 0, `every proof passed`: lines 58 to 114.

Each run wrote 57 records, all `passed`, all on commit `8796da326597c19faf215cc5742cdf0d15c5bc60`, host `Darwin 25.6.0`, arch `x64`, each with an `acceptance` field naming the entry `macos-26-x86_64`, its row, command, and platform: 9 proofs and 48 own records of the scenarios and harness compositions they ran. The seeds are those of 24c's and the Linux part's evidence. Identifiers, process IDs, and the order of records within a proof differ between the runs. Below, "lines A; B" name the line in the first run and in the second. The rows are the G2 rows of the [native acceptance gates](/docs/worker-platforms.md#native-acceptance-gates); resource budgets and real integrations belong to later gates.

## Platform

| Entry | Host | Architecture | Kernel | File system | Node.js | Docker |
| --- | --- | --- | --- | --- | --- | --- |
| `macos-26-x86_64` | macOS 26.6.2 (25G83), natively, on a 2020 Intel iMac | x86_64 (records: `x64`) | Darwin 25.6.0 | APFS at `/System/Volumes/Data`, which holds the temporary directory of the scenarios and their data roots | v24.22.1 | Docker Desktop 4.75.0 (227598), Engine 29.5.2, Compose 5.1.3 (services and installation only) |

## Table

Outcome is that of the proofs that ran. A row is **met (G2 part)** only when every listed proof passed and nothing of its G2 part is open on this entry.

| Row | Proof (target) | Outcome | Records | Open or failed reason |
| --- | --- | --- | --- | --- |
| Cancellation | `make verify-macos-g2-scenarios FILES="test/g2-cancellation-races.test.ts test/g2-stale-generations.test.ts"` (`harness-composition`, new) | Passed in both runs: tests 12, pass 12, none skipped. Races a to h, race g included, and the rejected launch that frees its slot; the stale ownership generation, the stale recovery epoch, and the old-epoch exit kept as evidence. Every scenario worker launched through the worker's own macOS supervisor; a started process ended by the supervisor's `SIGTERM` (races c and e in each run, race c after the start with seed `20261026` and after W4 and before the start with seed `7`, and the one granted round of race f with seed `7`, whose three rounds with seed `20261026` were all rejected; lines 40, 45; 98, 102, 103). The guard checked that the scripted process was a child of its worker's launch supervisor in race h in both runs, in race c in the `20261026` run, and in race g in both runs | lines 38 to 50; 95 to 107 (the second run orders the scenario records differently) | Met (G2 part) on this entry, together with the cancellation suites of the same runs (lines 36; 93). |
| Cancellation, race g | the same proof, scenario `adopting-supervisor-ignores-cancel` | Passed in both runs: the worker's liveness check was held, the launching supervisor was killed, and the cancel, committed while the hold kept any adopter from starting (seed `20261026`) or after the held recovery was released and had adopted the child with one adopting supervisor running (seed `7`), was recorded as `cancellation-not-applied` while the child kept running; released, the child exited and the execution stayed `started` with the evidence `cancellation-not-applied` then `uncertain`, the result `pending`, as supervisor identity sections 6 and 8 state | lines 48; 105 | Met on this entry. The reconciliation of the `uncertain` execution is not part of the G2 row. |
| Connectivity (G2) | `make verify-macos-g2-scenarios FILES=test/g2-partition.test.ts` (`harness-composition`, new) | Passed in both runs: tests 6, pass 6. Worker to NATS: before the offer, the inventory exchange after a reconnect, while the process runs; control plane to PostgreSQL: during authorization, while the process runs, beyond the redelivery budget. Stale writes are scenarios of the cancellation proof: the stale ownership generation (lines 41; 97) and the stale recovery epoch with the old-epoch start and exit kept as evidence (lines 43, 44; 100, 101) | lines 51 to 57; 108 to 114 | Partly open: sleep and wake and network changes (no G2 procedure), credential rotation (G3 item 26), and epoch quarantine (G6). Partition, reconnect, stale writes, duplicate delivery (lines 33, 34; 90, 91), and offline launch and worker contact (suites 25 of 25, lines 37; 94) are proven on this entry. |
| Process ownership | supervisor suites (`host-test-suite`); crash windows (`harness-composition`) | Passed: supervisor suites 113 of 113; crash windows 28 of 28 in each run | lines 3 to 32; 60 to 89 | Unchanged by this change; its disposition is that of 25c. |
| Service lifecycle, Journal and storage | `make scenario-native-worker-lifecycle`; journal and data-root suites | Passed in both runs (journal suites 104 of 104) | lines 1, 2, 35; 58, 59, 92 | Unchanged by this change. |

## Not run

- `macos-26-arm64`, with race g and these rows and its process ownership re-run after `fix-launch-recovery-reauthorization`: it needs the owner's physical access to the MacBook Air.
- `linux-ubuntu-24.04-arm64` and the hosted `ubuntu-24.04` re-dispatch: not part of this change. The Linux entry was not run here (`ENTRIES=macos`); on this host it would report the Linux scenario proofs as not applicable (`complete-g2-native-acceptance-rows`).

## Summary

Every proof of both runs passed, 114 records in all, and no product defect was observed. On `macos-26-x86_64` the Cancellation row is met for its G2 part, race g included, and the Connectivity (G2) row keeps only the parts that later gates own. Item 43 stays open for `macos-26-arm64` and its re-run, `linux-ubuntu-24.04-arm64`, and the hosted re-dispatch.
