# Verification: align-git-workspace-with-execution-boundary

## Scope and source

- Source: coordinator Niki's brief of 2026-10-27 for G3 item 0, a follow-up of item 6 (`define-git-workspace-contract`), from the revalidation review of the Git workspace contract: finding H1 (the harness cannot reach its checkout through the `0700` directories, and the test double's default modes hid it) and finding M1 (the identity and cgroup of the adapter's Git processes are not fixed).
- Scope update by the coordinator (Niki), 2026-10-27, after revalidation pass 2, task size L: H1's premise corrected (the Linux worker runs as root with only `CAP_SETUID`, `CAP_SETGID`, and `CAP_KILL`; uid 10001 is the control plane's account); define who makes the clone, the modes of `worker/` and `workspaces/<attemptId>/` and `checkout/`, and `safe.directory` for the adapter and the harness; amend the worker journal contract, spec, and `worker-root.ts` with tests and a fail-before; a Linux test with real uids if the existing Linux test container allows it; keep M1; L1 (the section 1 citation); L2 (name the log-leak test as item 16's, depending on `align-scm-port-with-g2-credentials`). Client-chosen task identifiers against safe branch names are out of scope.
- Scope addition by the coordinator (Niki), 2026-10-27, after review pass 1: apply the decisions of the owner's away delegate (Claude, away run `20261027T160711Z-claude-46821`) on the design's open questions: question 1 option (a), at most one handed-off workspace per Linux worker, with option (b), a uid pool, deferred; question 2 option (a), accept that the execution group can stat named paths under `worker/`, so no name there encodes a secret. Added to the contract (sections 2, 3, 13, 14, 15), the `git-workspace-port` delta (requirement "One handed-off workspace per Linux worker"; it concerns handed-off workspaces, so it sits there rather than in the `worker-journal` delta the coordinator named), the design, and G3 plan row 16.
- Deviations accepted by the coordinator, 2026-10-27: the privileged Linux test uses the test image's execution account, uid 2000, not 10003; and the installation and enrollment contract gains one sentence on the worker opening its `dataRoot` to the execution group.
- Delivered: see [proposal](proposal.md) and [design](design.md). The mechanism is the traverse-only path through the execution group with a hand-off and reclaim of the checkout (design D1 to D4).

## Revision

The branch `align-git-workspace-with-execution-boundary`, from `origin/dev` at `a00cbe3a`. The first checks ran on the working tree of the first commit, `8c0e940d`, which review pass 1 reviewed; the checks after the pass 1 fixes ran on the working tree of `732fe1ad`; review pass 2 reviewed `385efe53`, and the checks after its fixes ran on the working tree of `07c24b3f`.

## Environment

Linux 7.0.0-38-generic x86_64, Node.js v24.22.1 through `nvm use`, Git 2.55.0, Docker Engine 29.8.2. The host has an empty `/tmp/.git` that breaks tests that look for a Git working tree, so `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check

- Checked the premises in the files: `infra/installation/worker-entrypoint.sh` (root check, `chown -R 0:0` of the data root, `setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs`), `infra/installation/compose.yaml` (`user: "0:0"`, the capability list), `infra/installation/Dockerfile` (uid 10001 `taskelith`, uid 10003 `taskelith-exec`, the data root `0700`), `packages/adapters/worker-journal/src/worker-root.ts` (every directory through `createPrivateDirectory`, `0700`), `packages/adapters/worker-supervisor/src/node-spawner.ts` (`uid` and `gid`, no working directory).
- Checked in the Linux test image that a Node.js child spawned with `uid` and `gid` from a parent with supplementary groups 2000 and 4 has no supplementary group (`Groups:` empty), and that the image has no `git`, so the Git-based Linux tests stay item 16's.
- Checked that `@taskelith/worker-journal` and `@taskelith/workspace` are private workspace packages, not part of the published `taskelith` package (`files` of the root `package.json`), so the commit type is `chore`.
- Requirement bodies measured after the pass 2 fixes: 416, 492, 494, 403, 443, 437, 347, 405, and 410 characters (`git-workspace-port`), 494 (`worker-journal`), 416 (`worker-journal-adapter`).
- Pass 2 finding 4: the coordinator required the scenario "Delegated child on a second worker" under "One handed-off workspace per Linux worker" (the away delegate's decision). It stays there, rephrased as the worker's refusal of the child while the parent's workspace is handed off, which a worker test can check, with the placement on another worker as its consequence; `capacity-reservation` is unchanged, because its section 7 already lets the child run (pass 2 report, item 41 analysis).
- Pass 2 finding 5: the coordinator forbade editing `docs/g3-plan.md` and D14 for the item 41 decision, so rows 37, 41, 18, and 21 stay; row 16, which the coordinator allows, now names the item 16 obligations of the pass 2 fixes.
- G3 item 41 decision, round 2 (the owner's away delegate, Claude, away run `20261027T162806Z-claude-44593`, relayed by the coordinator Niki, 2026-10-27), replacing the earlier conflict note: keep the cap of one handed-off workspace per Linux worker and reject option (c), reclaim while waiting; a waiting parent stays live, and `openspec/specs/capacity-reservation/spec.md:92` counts its slot anyway. Item 41 runs on the item 37 installation, a local Linux worker container plus the D14 remote worker, each with slot count 1, so a delegating parent and its child are placed on different workers. Citations checked: `docs/g3-plan.md:134` is item 37 (the coordinator's brief named line 136, which is item 39), `:138` is item 41, `:190` is D14, and `capacity-reservation/spec.md:92` is the requirement "Progress across delegation trees". The worker-slots-exhausted refusal and the waiting stay; no resume or reclaim rule and no new G3 item were added. Added the scenario "Delegated child on a second worker" to the `git-workspace-port` delta and its mirror in the contract's section 13 test list.

## Evidence: fail before, pass after

| Test | Before (original source) | After |
| --- | --- | --- |
| `worker-root.test.ts`: an execution group may only traverse the path to the workspaces; a root enrolled without one is opened to it on start; a group the worker does not belong to fails enrollment | 3 of 3 fail: modes stay `0700` (`[448, 1000]` against `[456, 1000]`), and the foreign group enrolls | 28 of 28 pass |
| `linux-execution-access.privileged.ts` (`make verify-linux-cgroup`, root with the worker's three capabilities, execution account uid 2000 of the test image) | 2 of 2 fail: the execution account cannot write its checkout, and enrollment without the group succeeds | 2 of 2 pass |
| `temp-dir-workspaces.test.ts`: a rewritten Git state in an at-head checkout cannot make it publish | Fails: the double read the kind and task branch from the checkout's `.git`, so `readRemoteHead` succeeded | Passes |
| `temp-dir-workspaces.test.ts`: a hand-off survives a restart without a mode change (finding 3) | Fails: the state was the mode, so `inspect` succeeded | Passes |
| `temp-dir-workspaces.test.ts`: a reclaim gives back closed files, also hard-linked ones (finding 6) | Fails: `EACCES` reading the hard-linked `0000` file | Passes |
| `temp-dir-workspaces.test.ts`: a reclaim never writes through or over an entry named like its copy (finding 5) | Fails: the old copy name `b.txt.reclaim` was renamed over `b.txt` (`ENOENT`) | Passes |
| Conformance case "refuses Git work on a checkout whose Git directory holds a link or is gone" (finding 7) | Fails: the deleted `.git` rejected the promise (`ENOENT`) instead of `unsafe-checkout` | Passes; still fails for the defective variant that follows links |
| `worker-root.test.ts`: a workspace root linked to a control-record directory fails start (finding 4) | Fails: the start succeeded and opened the journal directory | Passes |
| `linux-execution-access.privileged.ts`: the execution account reads and edits what the clone wrote once handed off (finding 1) | Fails with the checkout `0700` during the clone, as before: `ls` of the nested directory is refused | Passes with `2700` |
| `temp-dir-workspaces.test.ts`: the clone writes into a checkout that is set-group-ID already (pass 2 finding 6) | Fails: `.git` was created before the checkout's `chmod 2700`, so it lacks the set-group-ID bit | Passes |
| `temp-dir-workspaces.test.ts`: a reclaim never opens a hard-linked special file (pass 2 finding 7) | Hangs: the reclaim opened the named pipe and blocked; killed by `timeout 60` | Passes |
| Conformance case "refuses Git work on a checkout whose Git directory holds a link, is gone, or is nested" (pass 2 finding 3) | Fails: a gitfile below the top was not refused | Passes; still fails for the defective variant that follows links |
| Conformance case "holds one handed-off workspace at a time where executions share a separate account" (pass 2 finding 1) | Fails: a second hand-off succeeded | Passes; fails for the defective variant that hands off a second workspace |
| Conformance cases "hands the checkout to the execution and takes it back without outside links" and "refuses Git work on a checkout whose Git directory holds a link" | Did not exist: the port had no `handOff` or `reclaim` | Pass for the double; each fails for its defective variants (Git on a handed-off checkout, outside hard links kept, a link followed in `.git`) |

## Checks and results

After the pass 2 fixes, on the working tree of `07c24b3f`:

- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed; 2221 tests, 2174 passed, 0 failed, 47 skipped; coverage of all files 99.25 % lines, 92.17 % branches, 98.93 % functions.
- `npm run openspec -- validate align-git-workspace-with-execution-boundary --strict`: valid. `npm run verify:comments`: every comment within the rule. `make findings ARGS="validate"`: valid, 32 findings files and 12 pass summary files.
- `make verify-linux-cgroup` did not run again: the pass 2 fixes touch no privileged test and not `worker-root.ts`.

After the round 2 decision on item 41, on the working tree of `5bc6e3f5`:

- `npm run openspec -- validate align-git-workspace-with-execution-boundary --strict`: valid. `make findings ARGS="validate"`: valid, 32 findings files and 12 pass summary files. `npm run verify:links`: every checked link conforms.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed; 2217 tests, 2170 passed, 0 failed, 47 skipped; coverage of all files 99.24 % lines, 92.19 % branches, 98.93 % functions.

After the pass 1 fixes and the scope addition, on the working tree of `732fe1ad`:

- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed; 2217 tests, 2170 passed, 0 failed, 47 skipped; coverage of all files 99.24 % lines, 92.19 % branches, 98.93 % functions.
- `make verify-linux-cgroup`: passed, 17 tests, 0 failed, 0 skipped.
- `npm run openspec -- validate align-git-workspace-with-execution-boundary --strict`: valid. `make findings ARGS="validate"`: valid.

Before review pass 1, on the working tree of `8c0e940d`:

- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed; 2213 tests, 2166 passed, 0 failed, 47 skipped; coverage of all files 99.24 % lines, 92.19 % branches, 98.93 % functions. One earlier run with these records failed only because Node.js could not parse a truncated coverage file in the temporary directory, with every test passing; the run after clearing that directory passed.
- `make verify-linux-cgroup PATTERN='execution account|execution group'`: passed, 3 tests (the two new ones and one supervisor test the pattern also matched).
- `npm run openspec -- validate align-git-workspace-with-execution-boundary --strict`: valid.

## Independent review

### Pass 1, reviewer A

- Reviewer: Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, reviewed head `8c0e940d`.
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the output header names model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- Session: `01a17e1d-56d3-7a12-8034-fef675ef6ad3`.
- Snapshot: `fa65a7ba3cd5a34ae088f721198705491b590b97c26bf5460e80675bba44f275` before and after the pass, unchanged.
- Counts: Critical 0, High 2, Medium 7, Low 2.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | High | The checkout had no set-group-ID while the clone wrote, so nested entries kept gid 0 | The checkout is created with the execution group and `2700` before the clone; privileged test of nested entries | `732fe1ad` |
| 2 | High | A restarted worker could reclaim while the previous reclaim program still ran | The hand-off record names the program's containment, proven empty before another reclaim, Git work, or hand-off; item 16 tests a surviving program | `732fe1ad` |
| 3 | Medium | On macOS no mode records the hand-off state | The `handed-off` record is the state on every platform; double test | `732fe1ad` |
| 4 | Medium | Startup followed a linked `worker/workspaces/` when it granted the group | The start checks cover `worker/workspaces/`; unit test | `732fe1ad` |
| 5 | Medium | The double's reclaim copied through a predictable name | Random name, exclusive create, source opened without following links; test with a link, a hard link, and a file at the old name | `732fe1ad` |
| 6 | Medium | The double's reclaim left `0000` and `0400` files closed | `0660`, or `0770` when executable, before any copy; test | `732fe1ad` |
| 7 | Medium | A deleted `.git` rejected the promise | Refused as `unsafe-checkout`; conformance case extended | `732fe1ad` |
| 8 | Medium | Inherited `safe.directory` or `SUDO_UID` could defeat Git's ownership check | Explicit owner check, Git without system and global configuration, inherited `GIT_CONFIG_*`, or `SUDO_UID`; the harness list starts with a reset; item 16 tests | `732fe1ad` |
| 9 | Medium | The refusal order of a handed-off push disagreed between the contract and the double | Section 9 fixes the order of all operations as the double has it; conformance checks foreign and `at-head` pushes while handed off | `732fe1ad` |
| 10 | Low | The planned Linux test forbade listing the agent's own checkout | Narrowed to the path to the checkout and control-record directories | `732fe1ad` |
| 11 | Low | The records presented pass 3 as unconditional | Task 3.2 and the remaining gates are conditional | this records commit |

Findings 2 and 8 are fixed at the contract level; their tests need the Git adapter and are item 16's. Pass 2 confirmed all eleven; it noted that the double still created `.git` before the checkout's mode (pass 2 finding 6) and that the scenario of finding 8 did not test the configuration scope (pass 2 finding 10).

### Pass 2, reviewer B

- Reviewer: Claude Code, `claude-fable-5-1`, effort medium, plan permission mode without edit tools, reviewed head `385efe53`.
- Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Model confirmation: the JSON `modelUsage` names `claude-fable-5-1`.
- Session: `22c6c380-65d0-4b0f-b54d-76fd7e349ba1`.
- Snapshot: `2c27c554ef95c381f5fb18e16d3e72c950fc2575139acf80eff60016dc14031b` before and after the pass, unchanged.
- Counts: Critical 0, High 0, Medium 4, Low 7.
- Item 41 check: the delegation is admitted under capacity reservation section 7 with the local worker and the D14 worker each at slot count 1, and the child goes to the second worker, provided that worker is eligible for it; otherwise the delegation waits with `delegation-awaiting-capacity` and is then rejected.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | Medium | The slot was free while the reclaim program still ran as the shared account | The handed-off workspace holds the slot until the reclaim, capacity declared again after it; `handOff` refuses a second one with `other-workspace-handed-off`; conformance case and defect variant | `07c24b3f` |
| 2 | Medium | A failed reclaim program had no outcome; `fs.protected_hardlinks` not required | `reclaim-failed`, kept handed off, reported, not rerun; start check of `fs.protected_hardlinks`; item 16 tests | `07c24b3f` |
| 3 | Medium | A nested gitfile let the worker's Git open another workspace's `.git` | A `.git` below the top is `unsafe-checkout`; no submodule recursion; double and conformance case | `07c24b3f` |
| 4 | Medium | The delegated-child scenario was not testable through the port | Kept under its requirement as the coordinator required, rephrased as the worker's refusal of the child | `07c24b3f` |
| 5 | Low | G3 plan rows 37, 41, 18, and 21 lack the decision and obligations | Declined: the coordinator forbade editing the plan for this decision; row 16 names the new item 16 obligations | — |
| 6 | Low | The double created `.git` before the checkout's set-group-ID | Order fixed; Linux test | `07c24b3f` |
| 7 | Low | A hard-linked named pipe blocked the double's reclaim | Regular files only, checked before opening; test | `07c24b3f` |
| 8 | Low | "Read and write for the group" kept set-user-ID and sticky bits | Exact modes `0660`, `0770`, and `2770` | `07c24b3f` |
| 9 | Low | Not every clone entry is group-writable | Section 2 wording | `07c24b3f` |
| 10 | Low | The inherited-settings scenario did not test the configuration scope | Scenario with `GIT_CONFIG_COUNT` and a global `insteadOf`; item 16 test | `07c24b3f` |
| 11 | Low | The list of ignored `.git/config` keys was open | `.git/config` written anew before each Git call; scenario; item 16 test | `07c24b3f` |

Findings 2, 10, and 11 are fixed at the contract and spec level; their tests need the Git adapter and are item 16's, as is the worker's slot accounting of finding 1. The ten fixed findings await confirmation by pass 3.

## Limitations

- No Git adapter exists, so the hand-off, the reclaim program, the Git process identity and cgroup, the Git directory checks, and `safe.directory` are contract rules with tests against the double only; their Linux tests with real uids, `/proc/<pid>/cgroup`, and the log-leak test are item 16's and need Git in the Linux test image or a run in the worker image.
- The worker app does not pass `executionGroup`, and the worker container does not give the worker the execution group yet; deployed workers keep `0700` until item 16.
- The privileged test uses the test image's execution account, uid 2000, not 10003.
- The two design questions were decided by the owner's away delegate, not by the owner in person ([design](design.md), "Open questions").
- The test double owns every entry, so its Git directory check does not model a foreign owner; that check, the Git environment, the `.git/config` rewrite, the submodule settings, the surviving and the failed reclaim program, and the `fs.protected_hardlinks` start check are tested in item 16.

## Remaining gates

- Review pass 3 by reviewer A (Codex, `gpt-6.1-sol`), which confirms the pass 2 fixes.
- The owner's confirmation of the away delegate's decisions on open questions 1 and 2 and the round 2 decision on item 41.
- Before item 41 starts: if the D14 remote worker is not eligible for the acceptance task (wrong harness or platform), escalate to the owner.
- Later work, not in this change: (i) a uid pool, an execution account per slot, which lifts the one-workspace cap; (ii) the shared execution account uid 10003 lets executions of one Linux worker signal each other's processes, an exposure since G2.
- Integration into dev by the coordinator (single pull request)
