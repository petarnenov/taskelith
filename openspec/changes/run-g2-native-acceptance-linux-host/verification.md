# Verification: run-g2-native-acceptance-linux-host (25, native Linux host)

Date: 2026-10-27. The author's verification so far is recorded below; the evidence, the independent review, and the archive are still open.

## Scope and source

G2 work item 25, the Linux entry on a native Linux host, `run-g2-native-acceptance-linux-host`, assigned by the coordinating session (Niki) in its brief of 2026-10-27 and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archives of 25a ([harden-worker-container-seccomp](../archive/2026-10-26-harden-worker-container-seccomp/design.md)), 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), and 24b ([run-g2-crash-windows](../archive/2026-10-26-run-g2-crash-windows/design.md), decision 8).

- **In scope:** the eight Linux proofs of `make native-acceptance`, `make scenario-worker-namespace-confinement` on `x86_64`, `results.jsonl`, and the acceptance table ([acceptance.md](acceptance.md)).
- **Out of scope:** product, runner, and test code; the macOS x86_64 entry (25c); the D11 `ubuntu-24.04` hosted-runner entry; fixes of any defect found.

## Revision and environment

- Base: `dev` at `0d317f8`. Branch `run-g2-native-acceptance-linux-host`.
- Host: native Ubuntu 26.04.1 LTS, `x86_64`, kernel 7.0.0-38-generic, cgroup v2; Node.js 24.22.1 from `.nvmrc` via `nvm use`.
- Engine: Docker Engine 29.8.2 (not Docker Desktop), storage driver overlayfs. Worker and test images: the digest-pinned Ubuntu 24.04 base (`Makefile:11`).
- `/tmp`: a 31 GiB `tmpfs` with `usrquota`, 85 % full with other projects' caches; every run sets `TMPDIR=/home/petar/.cache/taskelith-tmp`, on disk (design decision 6). Other projects' files were not deleted.

## Author self-check and evidence check

TODO: AGENTS.md, comment rule, ADR 0004, Docker hygiene, OpenSpec validation, and links.

## Checks and results

| Check | Result |
| --- | --- |
| `make setup` | Passed |
| `make verify` on `dev` `0d317f8`, first run | Failed with "Unknown system error -122" (`EDQUOT`) while writing Node.js coverage to `/tmp`; a host condition (design decision 6), not a defect |
| `make verify` on `dev` `0d317f8` with `TMPDIR` on disk | Exit 0: tests 1952, pass 1908, fail 0, skipped 44, cancelled 0; coverage of all files: lines 99.18 %, branches 91.82 %, functions 98.79 %; the packed allowlist and the installed CLI verification passed |
| Dry run of the Linux entry | TODO |
| Evidence run of the Linux entry (`results.jsonl`) | TODO |
| `make scenario-worker-namespace-confinement` on `x86_64` | TODO |
| `npm run openspec -- validate run-g2-native-acceptance-linux-host --strict` | TODO |

## Independent review

TODO: Codex CLI, `gpt-6-astra`, medium effort, read-only; invocation, model confirmation, reviewed head, snapshot, findings, and fixes.

## Candidate product defects

TODO.

## Limitations

- The host runs Ubuntu 26.04.1 LTS, not the pinned `ubuntu-24.04` hosted runner of D11; only the containers run the Ubuntu 24.04 base. The D11 `ubuntu-24.04` row stays open.
- The 24b crash windows and the duplicate delivery in a Linux composition are not run (design decision 4).
- TODO: limitations observed during the runs.

## Remaining gates

- The evidence run, the namespace-confinement run, `acceptance.md`, and the independent review.
- The D11 `ubuntu-24.04` hosted-runner entry; 25c (`macos-26-x86_64`).
- The Linux composed crash windows and duplicate delivery, carried by the coordinator to `close-g2` as a candidate deferral or follow-up.
- Integration into `dev` by the coordinator (single pull request).
- Archive of the change.
