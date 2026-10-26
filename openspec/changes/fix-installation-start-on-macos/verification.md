## Scope and source

G2 item 23 follow-up, `fix-installation-start-on-macos`, assigned by the coordinator on 2026-10-26. The scope: find and fix why `make verify-installation` fails at the first start on Desi's host, a 2020 Intel iMac (macOS 26.6.2 x86_64, Docker Desktop engine 29.5.2, Compose 5.1.3), also on unchanged `dev` `aba18f5`; add a cheap deterministic check to `make verify`; no new tool or image. The failure was recorded in the archived `2026-10-26-qualify-harnesses-in-worker-image` verification.

Root cause, from Desi's diagnostics on `85797b8` relayed by the coordinator and from a reproduction here: the control plane restarted in a loop with `the broker could not ensure the streams`, cause `insufficient storage resources available`. JetStream reserves each stream's `max_bytes`; the five streams took 10 GiB each, and NATS, without `max_file_store`, had sized its file store to `18.48 GB` from the 24.7 GB free of the Docker Desktop disk. The volume ownership (uid 10001, mode 0700), the architecture, the healthcheck, and the port binding were not involved.

Decisions:

- **Owner, 2026-10-26, relayed by the coordinator:** the local installation uses 1 GiB per stream and a fixed 8 GiB JetStream `max_file_store`; the 10 GiB general target stays and is configurable through `TASKELITH_STREAM_MAX_BYTES`. The local values are recorded in `docs/operational-targets.md` as provisional for G6.
- **Owner, 2026-10-26, relayed by the coordinator:** `installation-start` stops the control plane and prints its last error when `compose up --wait` fails; `restart: unless-stopped` stays.
- **Coordinator, 2026-10-26:** `verify-installation` prints the control-plane log before its cleanup on failure. The commit type is `build`, because `@taskelith/control-plane` and `@taskelith/nats` are private.

## Revision and environment

- Base: `origin/dev` at `85797b8`. Branch `fix-installation-start-on-macos`. The fix is in `fbce516`, which pass 1 reviewed. The pass 1 fixes and this record are in `96874d8` and `5295b81`, which pass 2 reviewed. The record of pass 2 is in the next commit, unreviewed.
- Host: Linux 6.8.0 x86_64 with Docker Engine and Compose; Node.js 24.22.1 from `.nvmrc`. Bash 5.2; no Bash 3.2 was available.

## Author self-check and evidence check

- The diagnosis rests on Desi's log line and NATS `Max Storage` line, and on a reproduction here: with a temporary `max_file_store: 40GB` on unchanged code, `make verify-installation` failed with `control-plane-1 is unhealthy` like on the iMac. The temporary edit was reverted.
- The NATS image parses `8GiB` as 8 GiB: a server started from the pinned image with that configuration logged `Max Storage: 8.00 GB` (NATS prints binary units).
- The error code 10047 is the server's `JSStorageResourcesExceededErr`; the integration test against the integration NATS server checks that a refused reservation maps to the new failure, so the code is confirmed against the pinned server, not only by name.
- The failure path was checked end to end: with a temporary `max_file_store: 4GiB` (below the 5 GiB reservation), `make verify-installation` printed the control plane's error with `reservedBytes` `5368709120`, stopped it, printed its log in the exit trap, and removed the project. The temporary edit was reverted.
- The script tests were mutation-checked: removing the `compose stop` of the failed start and the log of the exit trap made two of the three tests fail; the script was restored.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate fix-installation-start-on-macos --strict` | valid |
| `make verify` at `fbce516`, before pass 1 | passed; 1368 tests, 1353 passed, 0 failed, 15 skipped (macOS-only); coverage 99.08 % lines, 91.39 % branches, 98.44 % functions; archive dry run valid |
| `make verify-installation` at the `fbce516` content | passed: built, bootstrapped, started, enrolled, restarted, removed |
| `make verify-installation` with a temporary `max_file_store: 4GiB` | failed as designed at the start, with the reservation error printed, the control plane stopped, and the project removed |
| `make verify` after the pass 1 fixes, before this record | passed; 1371 tests, 1356 passed, 0 failed, 15 skipped; coverage 99.07 % lines, 91.38 % branches, 98.44 % functions; archive dry run valid |

## Independent review

Reviewer assigned by the coordinator: Codex CLI, `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. Invocation of every pass, from the worktree, with the prompt and log in the session's scratch directory outside it:

```bash
codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only \
  -C <worktree> - < <scratch>/reviewN.md > <scratch>/reviewN.log
```

### Pass 1

- Session `01a1758f-38ec-7c22-9d2d-2002adf03da3`, 2026-10-26, on `fbce516`. The output header shows model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`.
- Snapshot before and after: `20825c0a…` both times, unchanged.
- Findings: Critical 0, High 0, Medium 2, Low 1.
  1. Medium: no test exercised the failed-start and exit-trap paths of `scripts/installation.sh`. Fixed: `test/installation-script.test.ts` runs the script with a recording fake `docker` and checks the stop, the last error line, the 20-line fallback, and the log before the last removal; mutation-checked.
  2. Medium: `verification.md` was missing. Fixed: this record.
  3. Low: `docs/local-installation.md` said that with less than 8 GiB of free disk the start fails; the broker checks the fixed store, not the disk. Fixed: the section now says the installation starts and broker writes fail later when the disk fills.

### Pass 2

- Session `01a17595-2fa1-7772-96af-54cfca443a7b`, 2026-10-26, on `5295b81`. The output header shows model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`.
- Snapshot before and after: `4fa5f61e…` both times, unchanged.
- The reviewer confirmed the resolution of the three pass 1 findings and found no new problem in the whole change.
- Findings: Critical 0, High 0, Medium 0, Low 0.

## Limitations

- The fix has not yet run on the reporting iMac; the coordinator has Desi re-run `make verify-installation` on this branch before integration.
- Bash 3.2, the macOS default, was not available here; the script uses no newer syntax, which the reviewer also checked, but it ran only under Bash 5.2.
- The control-plane error does not state the broker's available storage: the account is unlimited, so the client cannot see the server's file-store limit; the NATS log line `Max Storage` shows it.

## Remaining gates

- Desi's run of `make verify-installation` on the iMac against this branch.
- Integration and archive by the coordinator.
