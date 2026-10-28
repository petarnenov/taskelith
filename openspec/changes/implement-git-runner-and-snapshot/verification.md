# Verification: implement-git-runner-and-snapshot

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16b, developed by a briefed subagent of the coordinator. The first brief scoped 16b to the adapter's primitives; the coordinator's decision of 2026-10-28 made the item 16 row the authority, so 16b also builds the local operations `prepare`, `inspect`, `snapshot`, `remove`, and `sweep`, the order of contract section 9 for them, and the crash points they reach, and the size became M-L ([proposal](proposal.md), "Scope correction"). Reviewers: A Codex `gpt-6.1-sol`, B Claude Code `claude-opus-5-5` at high effort. Out of scope: 16c (`readRemoteHead`, the leased push, the credential transport against a smart-HTTP server), 16d (hand-off, reclaim, `WS5` to `WS10`, Linux tests in the worker image), and 16e (worker wiring and admission).

## Revision

- Base: `dev` `1c73e1a7`.
- `05ea8e18` `chore: export the Git process checks of the workspace port`.
- `9d6f3918` `test: add failing tests for the Git workspace adapter's local operations` (package with stubs that throw, and every test). The fail-before run below ran on this commit.
- `e1a486ec` `chore: implement the Git workspace adapter's local operations`. It also changed two test details found on the first passing run: the fixture's own `runProcess` ignores `EPIPE` on standard input, and the planted-settings test names its planted files `planted-*` and looks for that word after `argv[0]`, because the first filter matched the wrapper's own path and every working directory.
- `2ddd2c5e` `chore: regenerate the dependency inventory for the Git workspace adapter`.
- `55a417c2` `docs: record the implement-git-runner-and-snapshot change` (proposal, design, spec delta, tasks).
- `81af575b` `test: keep the coverage variable out of the Git processes of the adapter's tests`, after the first `make verify` (below). The final checks ran on this commit.
- The commit that adds this record changes no checked input other than this file.

## Environment

Native Ubuntu 26.04.1 LTS host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 (`nvm use`, as the `Makefile` pins); host Git `git version 2.55.0` at `/usr/bin/git`, which the tests wrap and pin with its own version string; Perl 5.40.1 for the recording wrapper; GNU tar 1.35 for the snapshot extraction. `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`. The Linux pin `git version 2.43.0` and Apple's 2.50.1 did not run.

## Author self-check

- Scope: only the local operations and their primitives; no push, no remote head read, no hand-off, no reclaim, no wiring; no bare `--force`, bare `--force-with-lease`, or `+` refspec anywhere; `docs/g3-plan.md` and the contract unchanged.
- Package conventions: private, root export only, `tsconfig.json` references equal to its workspace dependencies, Node.js built-ins only, worker-only through `node:child_process`; the boundary check passes.
- Comments: at most two lines of at most 80 characters (`npm run verify:comments`).
- Contract points the code reads differently from its words are recorded in design D4, D5, D8, and D9 and not edited (contract changes are the coordinator's).

## Fail-before

On `9d6f3918`, with every exported function and method a stub that throws `not implemented`:

`node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/*.test.ts` gave tests 76, pass 1, fail 60, skipped 15, exit 1. The one passing test is "every deferred case names a case of the suite", which checks only the skip list against the suite. Each of the 60 failures was `Error: not implemented` from a stub (60 occurrences in the output): the 11 included conformance cases, and every unit and adapter test of the runner, the gate, the parsers, the checkout checks, the rewrite, the snapshot, the refusals, the planted settings, the Git processes, the crash points, and concurrent prepares. The 15 skipped tests are the conformance cases deferred to 16c and 16d.

Defective variants, run against the finished tests on the working tree of `e1a486ec` and then reverted (`git diff` empty afterwards):

| Variant | Command | Result |
| --- | --- | --- |
| The configuration rewrite removed from the opening of a workspace, and the runner's environment extended from `process.env` | the same command as above | tests 76, pass 57, fail 4: "every Git process gets exactly the built environment, not the inherited one", "the header travels in the environment of the one process, never in an argument", "every Git process of the local operations has the built environment and the pinned path", "settings planted in .git/config never act and are gone after the next Git call" |

## After the change

The same command on `e1a486ec`: tests 76, pass 61, fail 0, skipped 15 (duration about 3 s).

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `55a417c2` | Failed: tests 2624, pass 2559, fail 3, skipped 62. The three runner and process-environment tests found `NODE_V8_COVERAGE` in the Git processes' environment: Node.js adds it to a child's explicit environment while the parent collects coverage. Fixed in `81af575b` by `withholdCoverageFromDescendants()` in the three test files that start Git through the adapter (limitation below) |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `81af575b` | Passed, exit 0: tests 2624, suites 45, pass 2562, fail 0, cancelled 0, skipped 62; all files 99.32 % lines, 92.52 % branches, 98.95 % functions; "Every product module is in the coverage report"; `openspec validate --all --strict` 70 passed, 0 failed; "Every checked link conforms"; "Every active OpenSpec change archives into strictly valid specs" |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of that run | `81af575b` | lines 664 of 668 (99.40 %), branches 315 of 350 (90.00 %), functions 82 of 84 (97.62 %) |
| `npm run openspec -- validate implement-git-runner-and-snapshot --strict` | `55a417c2` | "Change 'implement-git-runner-and-snapshot' is valid" |
| Scratch archive: `git archive HEAD` of `55a417c2` extracted into a scratch directory outside the worktree, then `npx openspec archive implement-git-runner-and-snapshot --yes` and `npx openspec validate --all --strict --no-interactive` there | `55a417c2` | "+ 7 added", archived as `2026-10-28-implement-git-runner-and-snapshot`; validation 69 passed, 0 failed |
| `make dependency-inventory` | `e1a486ec` | 766 package paths; the inventory gained the new workspace package (`2ddd2c5e`) |

## Review

Pending; filled in after each pass.

| Pass | Reviewer | Role | Invocation | Model confirmation | Session | Snapshot | Findings | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Codex `gpt-6.1-sol` | A | Pending | Pending | Pending | Pending | Pending | Pending |
| 2 | Claude Code `claude-opus-5-5`, high | B | Pending | Pending | Pending | Pending | Pending | Pending |
| 3 | Codex `gpt-6.1-sol` | A | Pending | Pending | Pending | Pending | Pending | Pending |

## Limitations

- Ran on Linux with the host's Git 2.55.0 behind a recording wrapper, not with the pinned Linux Git 2.43.0 or Apple's 2.50.1, and not natively on macOS; the test that commits names that are not UTF-8 skips on macOS, whose APFS refuses them.
- The test remote speaks Git's dumb HTTP protocol from a static file server; the smart-HTTP server, the service's own credential check, and the remote operations are 16c's.
- 15 conformance cases are skipped with their reason (16c: 9, 16d: 6); the adapter's own tests cover their checks of the local operations, not their checks of the push, the remote head, or the hand-off.
- Node.js adds `NODE_V8_COVERAGE` to every child's environment while the parent has it set, even when the adapter passes an explicit environment; the tests remove it from their own environment. A worker never runs with it set, but the built environment is exact only while it is unset.
- The clone runs with the worker's umask and primary group, not umask `0007` and the execution group (16d and 16e); Git's objects are not forced to disk (design, "Risks"); no Git process has a time limit.
- An agent can write `.git/info/exclude`, which the rewrite of `.git/config` does not touch, so an untracked file it lists would not make the workspace dirty; the contract does not name this file, and the report to the coordinator lists it.

## Remaining gates

- Independent review passes 1 to 3 (reviewers A and B above), recorded in `passes.jsonl` and `findings.jsonl`.
- The archive of this change in the last commit of the branch, with its checks.
- Integration into dev by the coordinator (single pull request).
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 (contract section 13, pending gate), run by the owner.
- 16c: `readRemoteHead`, the leased push, and the credential transport against a local smart-HTTP Git server, which un-skip the 9 remote cases.
- 16d: the hand-off, the reclaim program and its containment, `WS5` to `WS10`, and the Linux tests in the worker image with the pinned Git, which un-skip the 6 hand-off cases.
- 16e: the worker wiring and admission, including the start refusal on `git-client-mismatch`, the execution group, the single slot, `fs.protected_hardlinks`, and the macOS composition.
