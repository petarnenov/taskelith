## Scope and source

G2 work item 23, first part (23a), assigned by the coordinator on 2026-10-25: digest-pinned control-plane and Linux worker images on Ubuntu 24.04, a Docker Compose composition with PostgreSQL and NATS on named volumes, and `make` targets to build, start, stop, bootstrap, and enroll, with `apps/control-plane/src/main.ts` and `apps/worker/src/main.ts` as they are. The coordinator split item 23: the end-to-end smoke (submit, assign, execute) is 23b, after items 20 and 21 ([proposal](proposal.md)). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 23, D5, and D8; the [installation and enrollment contract](../../../docs/contracts/installation-and-enrollment.md); the archived changes of items 13, 16, and 20a.

Obligations of earlier items addressed here: the `make` targets that run the administrative entry and deploy `nats-authority.conf` (item 13, contract section 9), and the images that run the two `main.ts` entries (items 16 and 20a).

## Revision and environment

- Base: `origin/dev` at `4968758`. Branch `compose-minimal-local-installation-images`; first review of `152c35b`, fixes in `e00debc` and the record in `bb2af6b`; second review of `bb2af6b`, fixes in `69c0046` and the record in `e7cb71b`; third review of `e7cb71b`, and its Low fix after it, unreviewed.
- Host: Ubuntu 24.04.5 LTS, kernel 6.8.0-147-generic, x86_64; Docker 27.3.1 with Compose v2.29.7; Node.js 24.22.1 from `.nvmrc`.

## Author self-check and evidence check

- The base image, the PostgreSQL and NATS images, and both Node.js checksums are pinned. The Ubuntu index digest was inspected with `docker buildx imagetools inspect` (linux/amd64 manifest `sha256:a2d43bff…`, as in `docs/dependencies.md`). The linux-arm64 Node.js checksum `33c37be2…` comes from `https://nodejs.org/dist/v24.22.1/SHASUMS256.txt`, fetched on 2026-10-25, which lists the already pinned linux-x64 checksum `eb6728e7…` too.
- No new npm dependency, tool, or image: Ubuntu 24.04, PostgreSQL, and NATS only. The NATS image is reused for the one-shot `nats-setup` step.
- Settings and data-root rules were checked against the code: `TASKELITH_API_HOST` defaults to loopback, so the image sets `0.0.0.0`; the worker refuses overlayfs and tmpfs, so the data roots are named volumes; `init` migrates and writes `nats-authority.conf`, and the service start requires both.
- No secret reached a log: the opt-in check's logs contain no `tkop_` or `tken_` value.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate compose-minimal-local-installation-images --strict` | valid |
| `make verify` at `152c35b`, before the first review | passed; 1095 tests, 1080 passed, 15 skipped, 0 failed; coverage 99.06 % lines, 91.64 % branches, 98.65 % functions |
| `make verify-installation` at `152c35b` | passed: built, bootstrapped, started, enrolled, restarted |
| `make verify` after the first-review fixes (`e00debc`) | passed; 1096 tests, 1081 passed, 15 skipped, 0 failed; coverage 99.07 % lines, 91.66 % branches, 98.65 % functions |
| `make verify-installation` after the first-review fixes | passed on 2026-10-25 with the same steps; containers, volumes, images, and the sentinel file were removed afterwards. Two earlier attempts during the fixes failed in the script's own clean-up (an unbound variable in the EXIT trap, then volumes left behind by it); the check now removes the project before and after. |
| `make verify-installation` after the second-review fixes (`69c0046`) | passed on 2026-10-25: built, bootstrapped, started, enrolled, restarted, removed; no container, volume, image, or sentinel file left |
| `make verify` after the second-review fixes (`69c0046`) | passed; 1096 tests, 1081 passed, 15 skipped, 0 failed; coverage 99.06 % lines, 91.65 % branches, 98.65 % functions |
| `make verify-installation` after the third-review fix | passed on 2026-10-25: built, bootstrapped, started, enrolled, restarted, removed; nothing left |
| `make verify` after the third-review fix | run by the `pre-push` hook on the pushed head; the handoff reports its result |

`make verify-installation` builds both images from a `git archive` of the tracked files, checks that they run as `taskelith`, have an empty data root, and lack an untracked sentinel file, then bootstraps with a random database password, repeats the broker configuration step, starts the composition, enrolls the Linux worker container until it stores its identity, stops and starts the composition, which recreates the enrolled worker without its token, checks that PostgreSQL, NATS, the control plane, and the worker run, and fails unless it then removes the project, its volumes, and its images. Docker reused cached layers from the earlier runs. Docker reports two `InvalidDefaultArgInFrom` warnings, because `BASE` has no default; the build always passes it.

## Independent review

Reviewer assigned by the coordinator: Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only.

### Pass 1

- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, prompt and log outside the worktree.
- Confirmation: the header showed model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a174a0-adea-7721-8a6b-f3afc3106637`.
- Snapshot: `305a3e7e938167d4a99a463bcf3b8ff448038a3e09b02f0e9b00be5660fd96b7` before and after; unchanged.
- Reviewed: `4968758...152c35b`. The reviewer could not run Docker or the Node.js tests in its sandbox.
- Findings: Critical 0, High 1, Medium 6, Low 1.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | `COPY . .` with an ignore list lets untracked local files, such as credentials, into both images. | The script builds from a `git archive` of `git stash create` (or `HEAD`), so the context holds only tracked files; the ignore file is gone; the opt-in check asserts that an untracked sentinel file is absent from both images. |
| 2 | Medium | The Makefile interpolated `ACTOR`, `REASON`, `PLATFORM`, `ARCHITECTURE`, and `WORKER_HOSTNAME` into shell text. | The recipes pass them through the environment (`"$$ACTOR"`); a value such as `O'Brien; echo x` arrives literally. `make` still expands `$(...)`, which is documented. |
| 3 | Medium | A failed copy of the broker configuration after a successful `init` had no recovery, since a second `init` fails with `conflict`. | `make installation-broker-config` repeats only the copy; documented; the opt-in check runs it a second time. |
| 4 | Medium | The `:local` image tags were shared across worktree projects. | Images are tagged with the project name, and Compose runs them with `pull_policy: never`. |
| 5 | Medium | `installation-enroll` could succeed before the worker enrolled. | `enroll` waits up to a minute for `worker/identity` and fails with the worker's log otherwise. |
| 6 | Medium | The test did not protect the non-root contract for the control-plane, admin, and worker services. | The test resolves the effective `USER` of the `control-plane` and `worker` stages through their parents, rejects any Compose `user` on the Taskelith images and a root NATS user, and covers the resolution with a root-override sample. |
| 7 | Medium | No `verification.md` before the first pass, while the dependency record cited one. | This record; the dependency record now cites it with the date. |
| 8 | Low | The dependency record still called the Ubuntu base test infrastructure only. | The row names both uses: item 15 test infrastructure and the runtime base of the installation images. |

### Pass 2

- Invocation and prompt as in pass 1, plus the pass 1 session and findings, asking the reviewer to confirm each resolution (`152c35b..HEAD`) and then review `4968758...bb2af6b` again.
- Confirmation: model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a174ae-fe31-7231-8ddc-5de801f27423`.
- Snapshot: `1f780ef579c000ae553a70ae995fe36bc91f8d1029d25cda950afb2205560783` before and after; unchanged.
- The reviewer confirmed all eight pass 1 findings resolved. It again could not run Docker or the Node.js tests in its sandbox.
- New findings: Critical 0, High 0, Medium 2, Low 2.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | `installation-start` ran `compose start worker`, so a rebuilt worker image was not used. | An existing worker is brought up with `compose up --no-deps --wait`, which recreates it from the current image and keeps its volume; a never-enrolled worker is still not created. |
| 2 | Medium | The opt-in check reported success even when removing the throwaway project failed. | Removal before the run and in the EXIT trap stays best effort; the final removal must succeed, or the check fails. |
| 3 | Low | `check_image` accepted a failed `find` or a Docker error as proof. | The `find` result is assigned, so a failure stops the script; the sentinel check runs `test ! -e` and requires success. |
| 4 | Low | The volume test accepted anonymous volumes. | The test requires the expected volume name as the mount source, its top-level declaration, and the admin entry's `control-plane-data` mount. |

### Pass 3

- Invocation and prompt as in pass 2, naming both earlier sessions, asking for confirmation of the pass 2 resolutions (`bb2af6b..HEAD`) and a review of `4968758...e7cb71b`.
- Confirmation: model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a174b6-6ee3-7a42-a4ff-7a728bb92b42`.
- Snapshot: `cc06318800da1a35240c6757278d800c04897c3cee21791ef1ed6a92fa71aa24` before and after; unchanged.
- The reviewer confirmed all four pass 2 findings resolved and found the deferrals (execution smoke, TLS, arm64 run) honestly recorded. It could not run Docker or the Node.js tests in its sandbox.
- New findings: Critical 0, High 0, Medium 0, Low 1.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Low | `installation-start` lost the exit status of `compose ps` inside the `if` test, so a failed query skipped the worker and succeeded. | The result is assigned first, so `set -e` stops on a failure. Unreviewed fix: a Low-only pass is fixed without another review. |

## Limitations

- Only linux/amd64 was built and run. The linux/arm64 path (the `node-arm64` stage and checksum) is not built or run yet.
- Task execution is not covered: no workflow is installed, and submit, assign, and execute are 23b.
- Connections are plain (HTTP API, NATS and PostgreSQL without TLS) on published localhost ports; TLS is G3 work.
- The enrollment token stays in the worker container's configuration after use; it is single-use and expires after 15 minutes.
- No image package inventory or vulnerability scan.
- The native macOS worker path is documented but was not run against this composition in this change.

## Remaining gates

- The coordinator's integration and archive.
- Item 23b.
