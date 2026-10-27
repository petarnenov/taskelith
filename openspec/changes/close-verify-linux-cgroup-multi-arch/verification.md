# Verification: close-verify-linux-cgroup-multi-arch

## Scope and source

Coordinator Niki's decision of 2026-10-27, option A: close the ADR 0015 decision 5 follow-up "Multi-architecture `make verify-linux-cgroup`" with documentation only. Briefed by the coordinator and developed by a subagent briefed by the worker session, under [subagent execution](/docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/close-verify-linux-cgroup-multi-arch` on branch `close-verify-linux-cgroup-multi-arch`, created from `origin/dev` at `af558eb0`. Scope: the bullet at `docs/decisions/0015-g2-closure.md:150` only, the row at `docs/foundation.md:87` only (found by searching `docs/`, `openspec/specs/`, `README.md`, and `AGENTS.md` for the follow-up; no other document lists it as open), and this change with empty `findings.jsonl` and `passes.jsonl`. Exclusions: no other line of ADR 0015 (another worker edits line 133) or `docs/foundation.md`, no code, Makefile, image, or spec change, and no cross-architecture run through QEMU emulation. `.openspec.yaml` sets `skip_specs: true` (proposal, "Capabilities").

## Revision

Base `af558eb0`. The change and its records, the ADR 0015 note, and the foundation ledger note are in the commit that adds this record.

## Environment

Linux 7.0.0-38-generic x86_64 (Ubuntu 26.04.1 LTS), Node.js v24.22.1 from `.nvmrc`, npm 12.2.1, dependencies from `npm ci --ignore-scripts`. Docker Engine 29.8.2, client and server `amd64`, `docker info` Architecture `x86_64`, cgroup v2. This host has an empty `/tmp/.git` that breaks tests that create git repositories under the temporary directory, so every check below ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check and evidence check

Each citation of the ADR note was checked against the files on `af558eb0`:

- The source: `openspec/changes/archive/2026-10-26-run-g2-failure-scenarios-composition/verification.md:83` and `design.md:31` name multi-arch tooling for `make verify-linux-cgroup` as a follow-up.
- `git show -s 73c0b2f7`: `2026-10-26 21:24:02 +0200`, "build: run the Linux test image on the Docker host's architecture", changing `Makefile`, `tools/linux-cgroup/Dockerfile`, and `tools/linux-cgroup/run.sh`. `git merge-base --is-ancestor` confirms that it is an ancestor of the 25b evidence revision `4b3d693` and of the 25c evidence revision `b82ad2f`.
- `Makefile` target `linux-test-image`: `x86_64|amd64|x86-64` take the x64 tarball with `NODE_LINUX_X64_SHA256`, `aarch64|arm64` the arm64 tarball with `NODE_LINUX_ARM64_SHA256` (both pinned at `Makefile:12-13`), and any other architecture fails with "no pinned Node.js for this Docker host".
- `docs/dependencies.md:127`: the Ubuntu 24.04 row pins the multi-arch index digest with the linux/amd64 and linux/arm64 manifests and both Node.js checksums; line 113 states that images are pinned by multi-arch index digest.
- `openspec/specs/native-worker-acceptance/spec.md:87`: requirement "Linux test image per architecture", with the scenario "arm64 Docker host" at lines 90 to 92.
- 25b, `openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/`: `acceptance.md` records the run of 2026-10-26 on `4b3d693`, and its Process ownership row (line 21) gives privileged cgroup tests 14 of 14 for `linux-ubuntu-24.04-arm64` (Docker Desktop, aarch64); `verification.md:41` records development runs of 14 of 14 on Docker Desktop aarch64.
- 25c, `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/`: `verification.md:83` records `make native-acceptance` on `b82ad2f` on 2026-10-27 with cgroup 14 of 14 for `linux-ubuntu-24.04-x86_64`, and its `acceptance.md` Process ownership row (line 21) gives 14 of 14; `verification.md:22` names Docker Desktop with server architecture `x86_64`.
- The ADR and ledger notes claim no QEMU cross-architecture run.

## Checks and results

| Check | Result |
| --- | --- |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-cgroup` on `af558eb0` (the tree that the target builds and mounts; this change touches no file it reads), 2026-10-27 14:41:54 UTC | Exit 0 in 36.5 s: the image built with the linux-x64 tarball (image architecture `amd64`, `node -p process.arch` in it gives `x64`, Node.js v24.22.1); `tests 14`, `pass 14`, `fail 0`, `cancelled 0`, `skipped 0`, duration 10045 ms; Docker Engine 29.8.2, `docker info` Architecture `x86_64` |
| `npm run openspec -- validate close-verify-linux-cgroup-multi-arch --strict` | `Change 'close-verify-linux-cgroup-multi-arch' is valid` |
| `npm run verify:links` | `Every checked link conforms.` |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on the final tree | Exit 0: 2182 tests, 2135 passed, 0 failed, 47 skipped; coverage 99.24 % lines, 92.19 % branches, 98.92 % functions; comment rule, findings files, contract compatibility (0 breaking changes against `af558eb0`), dependency inventory, `openspec validate --all --strict` (70 of 70), `verify:links`, archive dry run, and package verification passed |

## Independent review

Pass 1, reviewer A: OpenCode CLI, invoked as `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title close-verify-linux-cgroup-multi-arch "$(cat <prompt-file>)" < /dev/null > <log>` on `b904a018` (`af558eb0..b904a018`). Session `ses_e822b620effebvx0Xnyq1Pykdp`. Model confirmation from the stored assistant messages of the session (`session_message`): provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`, agent `reviewer`. The `opencode run` process exited with status 0. The SHA-256 snapshot of the worktree before and after the review was equal: `10dc5ef9ba6d1122ed780a63bc4643c4ba5afa249d70793456952758e42aecc6`. Findings: Critical 0, High 0, Medium 0, Low 0, as in `passes.jsonl`. The reviewer checked `73c0b2f7` and its ancestry to `4b3d693` and `b82ad2f`, the 25b and 25c records, `Makefile:95-111`, `docs/dependencies.md:127`, the requirement at `openspec/specs/native-worker-acceptance/spec.md:87-92`, the fresh amd64 result, and that only the allowed ADR 0015 and `docs/foundation.md` lines changed. With no finding above Low, reviewer B did not run, as the coordinator's brief and the [review process](/docs/governance.md#independent-review-process) set.

## Limitations

- The fresh run is on one Linux x86_64 host; arm64 rests on 25b's Docker Desktop run. No run on a native Linux arm64 host and no QEMU cross-architecture run exists, and neither is planned.
- The hosted-runner Linux x86_64 check, which shares the foundation ledger row, stays open.

## Remaining gates

- Integration into dev by the coordinator (single pull request)
