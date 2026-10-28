# Verification: implement-workspace-handoff-and-reclaim

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16d, developed by a briefed subagent of the worker session Liki for the coordinator Niki: the hand-off with its record and the `handedOff` read, the reclaim program and its containment, the crash points `WS5` to `WS10`, the `reclaim-failed` outcome, the 6 conformance cases deferred to 16d, and the contract's Linux tests in the worker image with its pinned Git (design, decisions 1 to 14). No reviewer has run.

## Revision

- Base: `dev` `964f0b57`; `origin/dev` `10fc3bbe` (#393 and later) merged in `cf6b3d0b`, one conflict in the `Makefile` `.PHONY` list, resolved by keeping both new targets.
- `e4bd32d4` `chore: start the implement-workspace-handoff-and-reclaim change` (the brief's `checklist.json`, unedited).
- `09884ac3` `chore: hand off and reclaim Git workspaces with the reclaim program`.
- `f056b039` `chore: run the Git workspace Linux tests in the worker image with its pinned Git` (worker image, `make verify-linux-git-workspace`, Linux suite, `.git/config` mode `0660`).
- `cf6b3d0b` the merge of `origin/dev`.
- `34a9773d` `docs: describe the implement-workspace-handoff-and-reclaim change` (proposal, design, spec delta, tasks, empty `findings.jsonl` and `passes.jsonl`, one status sentence in contract section 7). A first `make verify` passed on its clean tree `ad07be3e`.
- `254cf2d7` `docs: route the implement-workspace-handoff-and-reclaim change` (`route.json`, unedited). The recorded `make verify` ran on its clean tree `275cb48f`, since `make record-check` counts `route.json` as a change of the tree.

## Environment

Native Ubuntu host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 and the npm of the `Makefile` pin; host Git 2.55.0 at `/usr/bin/git`, wrapped and pinned with its own version string by the host tests; Docker with cgroup v2. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`, because this host has an empty `/tmp/.git`. The Linux suite ran in `taskelith-worker:taskelith-665132492-installation-git-workspace`, built by `installation.sh build-worker` from this branch, with `git version 2.43.0` of the package `1:2.43.0-1ubuntu7.4` and Node.js 24.22.1.

## Author self-check

- Scope: hand-off, reclaim, program, hosts, image pin, Linux tests; no worker wiring, slot, `fs.protected_hardlinks`, scan exclusion, or macOS composition (16e). `docs/g3-plan.md` unchanged. No new third-party dependency; no contract document under `packages/contracts/` changed, so `breaking-changes.json` needs no declaration.
- Concurrency: the check for another hand-off and the write of the record are one step of a chain per workspace root (design, decision 2); the conformance case of two concurrent hand-offs passes on the host with an execution account and in the worker image.
- Comments: `npm run verify:comments` passes.
- Open questions 1 to 3 of the design are provisional choices awaiting the coordinator.

## Fail-before

On the working tree of `f056b039` with `git-workspaces.ts`, `repository-config.ts`, `crash-points.ts`, and `index.ts` of `packages/adapters/git-workspace/src` restored from `964f0b57`, then from `HEAD` (`git status` clean): `npm run build` and `node --experimental-strip-types --test packages/adapters/git-workspace/test/conformance.test.ts packages/adapters/git-workspace/test/hand-off.test.ts packages/adapters/git-workspace/test/reclaim-program.test.ts packages/adapters/git-workspace/test/checkout-safety.test.ts` gave tests 4, pass 0, fail 4: every file failed at import, because the 16c adapter exports no `ProcessGroupReclaimHost` or `LinuxReclaimHost`. The finer fail-before of the configuration mode is the Linux run before the fix: the agent's `git add -A && git commit` failed with `fatal: unable to access '.git/config': Permission denied`, as did the inherited-settings case.

## After the change

- Host, after `npm run build`: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 181, pass 181, fail 0, skipped 0, before the configuration-mode test was added; `make verify` below includes all of them.
- Worker image: `bash scripts/linux-git-workspace.sh taskelith-worker:taskelith-665132492-installation-git-workspace` on the tree of `f056b039` gave tests 35, pass 35, fail 0 (the image pin, the 27 conformance cases with the real execution account, and the 7 tests of contract section 13). `make verify-linux-git-workspace` runs the same build and command; it is not part of `make verify` (design, open question 2).

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `254cf2d7`, tree `275cb48f` | Passed, profile full, stamp written: tests 3230, suites 46, pass 3183, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.80 % branches, 98.93 % functions. `make record` of this run is under "Generated checks" |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `34a9773d`, tree `ad07be3e` | Passed, profile full: the same counts; 98.95 % functions |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of the recorded run | `254cf2d7` | lines 1610 of 1635 (98.47 %), branches 773 of 839 (92.13 %), functions 229 of 235 (97.45 %) |
| `make findings ARGS="route --change implement-workspace-handoff-and-reclaim"` | `34a9773d` | "route: elevated (lines, files, contracts, docker, size), rule version 1"; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow agrees; recommendation only, committed unedited as `254cf2d7` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `275cb48fa1cd13f6a7f41e65ba5389a4fe37bf7f`; tests 3230, pass 3183, fail 0, skipped 47; all files 99.38% lines, 92.80% branches, 98.93% functions.
- `npm run openspec -- validate implement-workspace-handoff-and-reclaim --strict`: passed, `Change 'implement-workspace-handoff-and-reclaim' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).`.
- Spec diff against the merge base `10fc3bbe6b7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The Linux suite ran in the worker image with the repository's host-built `dist` mounted read-only, not with the image's own build; `make verify-worker-image-reproducible` did not run with the new Git step.
- The scan's exclusion of a recorded containment, the start check of `fs.protected_hardlinks`, the slot admission with `worker-slots-exhausted`, and the worker's umask and supplementary group are 16e's; the Linux tests set the umask and the group themselves.
- The adapter has no logger; "no secret in a log" checks every result and failure message and every file under the data root.
- The host's adapter tests still put their data roots under `TMPDIR` (carried from 16c); the new Linux tests do not.

## Remaining gates

- Review passes 1 (reviewer A) and 2 (reviewer B), and pass 3 if required.
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator.
- The coordinator's answers to the design's open questions 1 to 3.
- 16e: the worker wiring and admission.
- Integration into `dev` by the coordinator.
