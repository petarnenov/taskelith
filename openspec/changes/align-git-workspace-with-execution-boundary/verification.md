# Verification: align-git-workspace-with-execution-boundary

## Scope and source

- Source: coordinator Niki's brief of 2026-10-27 for G3 item 0, a follow-up of item 6 (`define-git-workspace-contract`), from the revalidation review of the Git workspace contract: finding H1 (the harness cannot reach its checkout through the `0700` directories, and the test double's default modes hid it) and finding M1 (the identity and cgroup of the adapter's Git processes are not fixed).
- Scope update by the coordinator (Niki), 2026-10-27, after revalidation pass 2, task size L: H1's premise corrected (the Linux worker runs as root with only `CAP_SETUID`, `CAP_SETGID`, and `CAP_KILL`; uid 10001 is the control plane's account); define who makes the clone, the modes of `worker/` and `workspaces/<attemptId>/` and `checkout/`, and `safe.directory` for the adapter and the harness; amend the worker journal contract, spec, and `worker-root.ts` with tests and a fail-before; a Linux test with real uids if the existing Linux test container allows it; keep M1; L1 (the section 1 citation); L2 (name the log-leak test as item 16's, depending on `align-scm-port-with-g2-credentials`). Client-chosen task identifiers against safe branch names are out of scope.
- Delivered: see [proposal](proposal.md) and [design](design.md). The mechanism is the traverse-only path through the execution group with a hand-off and reclaim of the checkout (design D1 to D4).

## Revision

The branch `align-git-workspace-with-execution-boundary`, from `origin/dev` at `a00cbe3a`; the checks below ran on the working tree that the first commit of this change records.

## Environment

Linux 7.0.0-38-generic x86_64, Node.js v24.22.1 through `nvm use`, Git 2.55.0, Docker Engine 29.8.2. The host has an empty `/tmp/.git` that breaks tests that look for a Git working tree, so `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check

- Checked the premises in the files: `infra/installation/worker-entrypoint.sh` (root check, `chown -R 0:0` of the data root, `setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs`), `infra/installation/compose.yaml` (`user: "0:0"`, the capability list), `infra/installation/Dockerfile` (uid 10001 `taskelith`, uid 10003 `taskelith-exec`, the data root `0700`), `packages/adapters/worker-journal/src/worker-root.ts` (every directory through `createPrivateDirectory`, `0700`), `packages/adapters/worker-supervisor/src/node-spawner.ts` (`uid` and `gid`, no working directory).
- Checked in the Linux test image that a Node.js child spawned with `uid` and `gid` from a parent with supplementary groups 2000 and 4 has no supplementary group (`Groups:` empty), and that the image has no `git`, so the Git-based Linux tests stay item 16's.
- Checked that `@taskelith/worker-journal` and `@taskelith/workspace` are private workspace packages, not part of the published `taskelith` package (`files` of the root `package.json`), so the commit type is `chore`.
- Requirement bodies measured: 416, 494, 469, 347, and 388 characters (`git-workspace-port`), 494 (`worker-journal`), 325 (`worker-journal-adapter`).

## Evidence: fail before, pass after

| Test | Before (original source) | After |
| --- | --- | --- |
| `worker-root.test.ts`: an execution group may only traverse the path to the workspaces; a root enrolled without one is opened to it on start; a group the worker does not belong to fails enrollment | 3 of 3 fail: modes stay `0700` (`[448, 1000]` against `[456, 1000]`), and the foreign group enrolls | 28 of 28 pass |
| `linux-execution-access.privileged.ts` (`make verify-linux-cgroup`, root with the worker's three capabilities, execution account uid 2000 of the test image) | 2 of 2 fail: the execution account cannot write its checkout, and enrollment without the group succeeds | 2 of 2 pass |
| `temp-dir-workspaces.test.ts`: a rewritten Git state in an at-head checkout cannot make it publish | Fails: the double read the kind and task branch from the checkout's `.git`, so `readRemoteHead` succeeded | Passes |
| Conformance cases "hands the checkout to the execution and takes it back without outside links" and "refuses Git work on a checkout whose Git directory holds a link" | Did not exist: the port had no `handOff` or `reclaim` | Pass for the double; each fails for its defective variants (Git on a handed-off checkout, outside hard links kept, a link followed in `.git`) |

## Checks and results

- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed; 2213 tests, 2166 passed, 0 failed, 47 skipped; coverage of all files 99.24 % lines, 92.19 % branches, 98.93 % functions. One earlier run with these records failed only because Node.js could not parse a truncated coverage file in the temporary directory, with every test passing; the run after clearing that directory passed.
- `make verify-linux-cgroup PATTERN='execution account|execution group'`: passed, 3 tests (the two new ones and one supervisor test the pattern also matched).
- `npm run openspec -- validate align-git-workspace-with-execution-boundary --strict`: valid.

## Independent review

Not started. Pass 1 follows.

## Limitations

- No Git adapter exists, so the hand-off, the reclaim program, the Git process identity and cgroup, the Git directory checks, and `safe.directory` are contract rules with tests against the double only; their Linux tests with real uids, `/proc/<pid>/cgroup`, and the log-leak test are item 16's and need Git in the Linux test image or a run in the worker image.
- The worker app does not pass `executionGroup`, and the worker container does not give the worker the execution group yet; deployed workers keep `0700` until item 16.
- The privileged test uses the test image's execution account, uid 2000, not 10003.
- Two owner questions remain open ([design](design.md), "Open questions").

## Remaining gates

- Review pass 1 by reviewer A (Codex CLI, `gpt-6.1-sol`, medium effort).
- Review pass 2 by reviewer B (Claude Code, `claude-fable-5-1`).
- Review pass 3 by reviewer A.
- Owner decisions on open questions 1 and 2.
- Integration into dev by the coordinator (single pull request)
