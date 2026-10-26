## Scope and source

G2 work item 23, second part (23b), `compose-installation-end-to-end`, assigned by the coordinator on 2026-10-26: the end-to-end smoke (submit, assign, execute) and anything the later runtime needs, with the 20d2 obligation that the Linux worker image always sets `TASKELITH_CONTAINMENT_PARENT` with a delegated cgroup v2 subtree. Excluded: item 24 failure scenarios, item 25 native acceptance, TLS (G3), macOS worker work, item 20e2, and any contract change. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 23 and D5; the [23a proposal](../archive/2026-10-25-compose-minimal-local-installation-images/proposal.md); the [20d2 design](../archive/2026-10-26-implement-worker-contact-and-offline/design.md) OQ2; the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 8.

## Revision and environment

- Base: `origin/dev` at `311c40d`. Branch `compose-installation-end-to-end`.
- Host: macOS 26 (Darwin 25.6.0), x86_64; Docker Desktop, engine 29.5.2, cgroup v2; Node.js from `.nvmrc`. Docker disk at 53% before and after the runs.

## Author self-check and evidence check

- No OpenAPI, AsyncAPI, JSON schema, product code, or npm dependency changes; `apps/worker` and `apps/control-plane` are unchanged. `setpriv` comes from `util-linux` in the Ubuntu base; Docker's init is part of the engine and pulls no image.
- In the worker image with the composition's settings, the worker's process status showed `CapPrm`, `CapEff`, and `CapBnd` `00000000000000e0` (`KILL`, `SETGID`, `SETUID`) and `CapAmb` 0, its cgroup `0::/init`, an empty namespace root, and `init/` and `executions/` beside each other; a process under uid 10003 got `Permission denied` writing `init/cgroup.procs`.
- The first smoke attempt failed: the entrypoint read `cgroup.procs` while moving processes out of it, so it skipped one. The entrypoint now moves a copy of the list. That attempt also exercised the failure path: the logs were printed, and the project, its volumes, and its images were removed.
- No log of the smoke contains a `tkop_` or `tken_` value.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate compose-installation-end-to-end --strict` | valid |
| `make installation-smoke` | passed on 2026-10-26: built, bootstrapped, started, enrolled; the stored result was `ended`, outcome `exited`, status code 0, `startProven` true; the project was removed with its volumes and images, and nothing was left |
| `make verify-installation` | passed on 2026-10-26: built, bootstrapped, started, enrolled, restarted, removed |
| `make verify` | passed; 1714 tests, 1712 passed, 2 skipped, 0 failed; coverage 99.27 % lines, 91.87 % branches, 98.98 % functions |
| `make installation-smoke` after the pass 1 fixes | passed on 2026-10-26: the containment check passed (the write under uid 10003 was refused; the worker process had `CapEff` and `CapBnd` `00000000000000e0`, `CapAmb` 0), the stored result was `ended`, `exited`, code 0, `startProven` true, and the project was removed with its volumes and images. A comment was shortened afterwards. |
| `make verify` after the pass 1 fixes | passed; 1719 tests, 1717 passed, 2 skipped, 0 failed; coverage 99.28 % lines, 91.88 % branches, 98.98 % functions |
| `make installation-smoke` after the pass 2 fixes | passed on 2026-10-26: the probe was refused with `Permission denied`, the worker process had `CapInh` 0, `CapPrm`, `CapEff`, and `CapBnd` `00000000000000e0`, and `CapAmb` 0; the result was `ended`, `exited`, code 0, `startProven` true; the project was removed with its volumes and images |
| `make verify` after the pass 2 fixes | passed; 1720 tests, 1718 passed, 2 skipped, 0 failed; coverage 99.27 % lines, 91.88 % branches, 98.98 % functions |
| `make verify` after the M-A records and the pass 3 fixes | passed; 1720 tests, 1718 passed, 2 skipped, 0 failed; coverage 99.27 % lines, 91.86 % branches, 98.98 % functions |

Excerpt of the smoke output:

```text
{"state":"ended","runId":"installation-smoke-run","taskId":"installation-smoke-task","attemptId":"t900d427…","ownershipGeneration":2,"outcome":{"cancelled":false,"ownershipGeneration":2,"endedAt":"2026-10-26T13:38:04.872Z","kind":"exited","executionId":"bde5581a-19b5-4a17-9686-769f9bfd6f84","status":{"kind":"code","code":0},"startProven":true},"evidence":[]}
installation.sh: submitted, assigned, executed, stored the result, removed
```

## Privilege decision

The worker runs as root with three capabilities inside its container (design decision 3), which replaces the 23a requirement that it run as `taskelith` and reverses 23a review finding 6. On 2026-10-26 the coordinator brought the options to the owner's delegate, who accepted option A, the root worker with the `SETUID`, `SETGID`, and `KILL` bounding set as implemented, on behalf of the owner (away run `20261026T134624Z-opencode-35455`). Observed in the worker container: `CapPrm`, `CapEff`, and `CapBnd` `00000000000000e0` (`KILL`, `SETGID`, `SETUID`), `CapAmb` `0000000000000000`. Item 25 covers Linux hosts with AppArmor or SELinux and linux/arm64. The coordinator reports the reversal to the owner.

The residual risk of the worker container's `SYS_ADMIN` and `apparmor=unconfined` (review pass 1 finding M2: an execution under `taskelith-exec` can create a user namespace and mount inside it) was accepted on 2026-10-26 by the owner's delegate, on behalf of the owner, as known until item 25 (away run `20261026T142254Z-opencode-30870`). The item 25 row of [docs/g2-plan.md](../../../docs/g2-plan.md) now carries it: decide a seccomp profile and check userns/mount under the execution account.

## Independent review

Reviewer assigned by the coordinator: Claude Code, `claude-fable-5-1`, effort medium, plan mode.

### Pass 1

- Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, prompt and log outside the worktree.
- Confirmation: `claude-fable-5-1` in the JSON `modelUsage`; session `5b74f8f3-b89c-4d53-998c-86d53e75f7a5`.
- Snapshot: `77b2bab6…` before and after; unchanged.
- Reviewed: `311c40d...bd35a83`.
- Findings: Critical 0, High 0, Medium 2, Low 5.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| M1 | Medium | The scenario "Worker start" had no automated evidence that the execution account cannot write the worker's `cgroup.procs`. | `installation.sh check-containment`, run by the smoke after enrollment, writes the shell's PID to `/sys/fs/cgroup/init/cgroup.procs` through `exec --user 10003:10003` and fails if that succeeds, and fails unless the worker process shows `CapEff` and `CapBnd` `00000000000000e0` and `CapAmb` 0. Tests drive both failures with a fake `docker`; the scenario names the smoke as its evidence. |
| M2 | Medium | `SYS_ADMIN` widens Docker's default seccomp filter for every process, executions included, and `apparmor=unconfined` lifts the user-namespace restriction, so the kernel surface is wider than the risks said. | Documented, not changed: design.md risks and `docs/local-installation.md` now state the consequence, with the observed user namespace and mount under uid 10003, and why no custom seccomp profile was chosen (a copy of Docker's engine- and architecture-specific profile or a fragile hand-written list); handed to item 25. |
| L1 | Low | The entrypoint took ownership of the whole data root on every start, also of files a later execution account might create. | The entrypoint changes owners only when root does not own the data root (`stat -c %u`); a test shows a root-owned data root is left alone; design decision 5 says who owns execution files. |
| L2 | Low | `TASKELITH_CGROUP_ROOT` was a test seam in the product entrypoint. | Renamed to `TASKELITH_TEST_CGROUP_ROOT`, with a comment that the worker always reads `/sys/fs/cgroup`. |
| L3 | Low | "so that the worker user cannot change them" was stale with a root worker. | A MODIFIED "Harness image variant" requirement names the execution account; `docs/local-installation.md` says the same. |
| L4 | Low | The smoke client lost the status on a non-JSON body, and its requests had no timeout. | It reads the text, parses JSON with the text as fallback, and sets `AbortSignal.timeout` of 10 s; tested. |
| L5 | Low | The entrypoint tests took about 12 s. | The fakes are written once per file, since a new executable starts slowly the first time on macOS, and the refusals run in parallel: about 3 s. |

### Pass 2

- Invocation as in pass 1.
- Confirmation: `claude-fable-5-1` in the JSON `modelUsage`, which also lists `claude-opus-5-5`, used internally by the harness; session `8fcb261e-a6bf-424c-a79c-37fa8c00d447`.
- Snapshot: `74c8ac9e…` before and after; unchanged.
- Reviewed: `311c40d...144e43a`, after confirming the pass 1 resolutions.
- Findings: Critical 0, High 0, Medium 1, Low 5.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| M-A | Medium | The acceptance of the pass 1 M2 residual risk (`SYS_ADMIN`, user namespaces) and its hand-off to item 25 were not recorded as a decision. | Resolved by the delegate's acceptance on behalf of the owner (away run `20261026T142254Z-opencode-30870`), recorded under "Privilege decision", and by the item 25 row of `docs/g2-plan.md`, which now carries it. |
| L-A | Low | The `cgroup.procs` probe counted any `docker exec` failure as a refusal. | The probe keeps the output (`2>&1`) and passes only on `Permission denied`; any other failure fails the smoke with the output. The fake `docker` prints the refusal, and a new test covers an exec that fails for another reason. |
| L-B | Low | The capability check skipped `CapInh` and `CapPrm`. | It now requires `CapInh` 0 and `CapPrm` `00000000000000e0` too; the fixture and two new variants cover them. |
| L-C | Low | "until its entrypoint has dropped them" was inaccurate: Docker's init keeps the container's seven capabilities for the container's lifetime. | `docs/local-installation.md` and the design risks say so, and why it is acceptable: a passive reaper, under another user ID than an execution, which lacks `CAP_SYS_PTRACE` to reach it. |
| L-D | Low | The design risk repeated "Item 25 qualifies the container settings". | One sentence remains. |
| L-E | Low | `verify-installation` was said to check that the images "run as `taskelith`". | It checks that the images' default `USER` is `taskelith`; the worker service overrides it (see "Worker container"). |

Reviewer's note outside the diff: `checkLinuxContainment` is not wired in `apps/worker`; the coordinator tracks it under G3 item 27.

### Pass 3

- Invocation as in pass 1.
- Confirmation: `claude-fable-5-1` in the JSON `modelUsage`; session `2129a691-596a-4d04-aff9-1c3f8af72412`.
- Snapshot: `40c80261…` before and after; unchanged.
- Reviewed: `311c40d...34b6f40`. The reviewer confirmed every pass 2 resolution, M-A included, after checking the away run record and the plan row.
- Findings: Critical 0, High 0, Medium 0, Low 3. By the review process, Lows of the last pass are fixed without another review.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Low | The "Fresh image" scenario said the image "runs as `taskelith`". | Unreviewed fix (Low, governance): it now says that its default `USER` is `taskelith`. |
| 2 | Low | The composition test checked only `no-new-privileges=true` in the worker's `security_opt`. | Unreviewed fix (Low, governance): it asserts the full sorted list, `apparmor=unconfined` and `no-new-privileges=true`. |
| 3 | Low | `docs/local-installation.md` described Docker's init in two sentences. | Unreviewed fix (Low, governance): one sentence says that process 1 reaps executions whose supervisor ended first and keeps the container's seven capabilities for the container's lifetime. |

Reviewer's note outside the diff: Node.js's spawn with a user and group ID might leave root's supplementary group 0 on an execution. See the limitations.

## Limitations and remaining gates

- `SYS_ADMIN` and `apparmor=unconfined` let an execution create a user namespace and mount inside it (design risks, review finding M2); accepted by the owner's delegate as known until item 25, which decides whether a seccomp profile is needed.
- The smoke and the bring-up check ran on Docker Desktop x86_64 only; Linux hosts with AppArmor or SELinux, and linux/arm64, are not yet observed. Item 25 qualifies the container settings.
- Supplementary groups of an execution (pass 3 note): the pinned Node.js 24.22.1 bundles libuv 1.52.1 (`process.versions.uv`). Its child setup on Unix calls `setgroups(0, NULL)` before `setgid` and `setuid` whenever a spawn sets a user or group ID, ignoring a failure. The worker holds `CAP_SETGID`, so an execution should start with no supplementary group, not root's group 0. This comes from libuv's source as known to the author, not from the bundled source or a running execution; item 25 or 27 checks the `Groups:` line of an execution's `/proc/<pid>/status`.
- Remaining gates: integration by the coordinator and the archive.
