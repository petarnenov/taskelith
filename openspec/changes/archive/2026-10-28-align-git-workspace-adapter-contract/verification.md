# Verification: align-git-workspace-adapter-contract

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16a, assigned as size S-M and grown to M through the review fixes, assigned by the coordinator and developed in a briefed subagent. The owner's delegate's decisions of 2026-10-28, numbered 1 to 12 in the brief, are applied as design D1 to D12. Scope: the contract, the `git-workspace-port` spec, the port, the fixture, the conformance suite, and the test double; no Git code, which follows in 16b to 16e. Review passes 1 to 3 ran (section Independent review); their fixes are recorded below, and the passes in `passes.jsonl` and `findings.jsonl`.

## Revision

- Base: `dev` `b099b995`.
- `17170f5a` `docs: settle the Git workspace adapter contract before its Git code` (contract, G3 plan rows 16 and 38, change record, spec delta).
- `5a0d1ca2` `chore: align the workspace port, suite, and double with the adapter contract` (package and tests). The checks below ran on this commit.
- The commit that adds this record changes no checked input.

## Environment

Native Ubuntu 26.04.1 LTS host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 pinned by the `Makefile`; GNU tar 1.35 for the archive tests. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` for every run.

## Fail-before

With the port, the domain rules, the fixture hooks, and the new cases in place and the double's provider (`TempDirWorkspaces`) still unchanged (working tree on `b099b995`, before `5a0d1ca2`):

`TMPDIR=/home/petar/.cache/taskelith-verify-tmp node --experimental-strip-types --test --test-reporter=tap --test-name-pattern='a conforming workspace provider' packages/modules/workspace/test/workspace-conformance.test.ts` gave tests 25, pass 17, fail 8. The failing cases and their first problem:

| Case | Failure |
| --- | --- |
| rejects foreign or mismatched heads and missing sources, leaving nothing | `plain HTTP remote: expected invalid, got success` |
| refuses a push whose remote task branch moved, and leaves the remote where it is (new) | `push processes: expected 1, got 0` |
| refuses a push that does not descend from the remote head, and leaves the remote where it is (new) | `push processes: expected 1, got 0` |
| snapshots exactly the clean head tree, in bytes that depend on the tree alone | `content type: expected "application/x-tar", got "application/json"` |
| refuses to snapshot a tree that holds a gitlink (new) | `dirty reasons of attempt-1: expected [], got ["modified"]` |
| reads the handed-off workspaces from their records, also after a restart (new) | `TypeError: provider.handedOff is not a function` |
| runs Git in an environment it builds, with no secret in an argument (new; now named "runs Git in an environment it builds, with no credential in an argument") | `no Git process was observed` |
| writes the repository configuration anew, so settings the agent planted never act (new) | `planted settings left: expected false, got true` |

The remote-moved and not-fast-forward outcomes themselves already held in the double; the two new push cases failed on the push process check, and their outcome checks are proven by the defective variants below.

## After the change

`TMPDIR=/home/petar/.cache/taskelith-verify-tmp node --experimental-strip-types --test packages/modules/workspace/test/*.test.ts` on `5a0d1ca2`: tests 99, pass 99, fail 0.

- `workspace-conformance.test.ts`: 25 conforming cases pass, and each of the 34 defective variants fails exactly its listed cases. The new variants and the cases they fail:

| Variant | Failing cases |
| --- | --- |
| pushes over a moved remote branch (`ignoresLease`) | pushes a clean task branch fast-forward; remote moved |
| pushes a head that does not descend from the leased one (`ignoresAncestry`) | pushes a clean task branch fast-forward; not fast-forward |
| pushes with a lease that names no expected head (`pushesWithBareLease`) | remote moved; not fast-forward; planted settings |
| forgets its hand-offs across a restart (`forgetsHandOffsOnRestart`) | handed-off read |
| passes the secret in a Git argument (`passesSecretInArguments`) | Git environment |
| runs Git in the inherited environment (`inheritsEnvironment`) | Git environment |
| keeps the repository settings the agent planted (`keepsPlantedSettings`) | planted settings |
| snapshots a tree that holds a gitlink (`snapshotsGitlink`) | gitlink |
| clones from a remote that is not HTTPS (`acceptsInsecureRemote`) | rejects foreign or mismatched heads |
| cannot reach the remote for any prepare (`refusesEveryPrepare`) | every case except the digest case |

- Two existing variants now also fail new cases, both for a real defect: `storesSecret` puts the secret into the remote URL, so the push no longer goes to the binding's remote and a Git argument holds the secret (remote moved, not fast-forward, Git environment, planted settings); `namesBranchByRawTaskId` pushes another branch (remote moved, not fast-forward, planted settings).
- `snapshot-archive.test.ts` (6 tests): equal bytes for any entry order, changed bytes for a changed mode, target, or byte, extraction by the system `tar` with modes, link targets, a 128-byte path, and a 126-byte target through pax records, fixed header fields, the empty tree, and the gitlink refusal.
- `workspace-domain.test.ts`: the new failure reasons, content type, prefix, and pins as contract values, the Git client gate, the remote rule (3 accepted and 9 refused URLs), the push options, and the reclaim containment name.

## Coverage of the changed files

From the `make verify` run below (`dist` of `@taskelith/workspace`, lines, branches, functions):

| File | Lines | Branches | Functions |
| --- | --- | --- | --- |
| `domain/code-head.js` | 100.00 | 100.00 | 100.00 |
| `domain/git-client.js` (new) | 100.00 | 100.00 | 100.00 |
| `domain/snapshot-archive.js` (new) | 100.00 | 95.12 | 100.00 |
| `domain/workspace.js` | 100.00 | 100.00 | 100.00 |
| `index.js` | 100.00 | 100.00 | 100.00 |
| `ports/workspace-conformance.js` | 99.63 | 87.89 | 100.00 |

The uncovered lines 344 to 346 of `workspace-conformance.js` are the report of a push case when an adapter started no push process or more than one; no variant leaves that out after a successful push. On `b099b995` the same file had branches 74.81 (the package's tests alone); the variant that cannot prepare raised it, because it reaches every case's early return after a failed prepare.

The repository-wide threshold of 75% for lines, branches, and functions passed.

## Checks

- `npm run openspec -- validate align-git-workspace-adapter-contract --strict`: `Change 'align-git-workspace-adapter-contract' is valid`.
- `make findings ARGS="validate"`: `Every findings file is valid: 57 file(s); every pass summary file is valid: 37 file(s).`
- Requirement body lengths in the spec delta at `5a0d1ca2`, in characters (current lengths are in the review fix sections): Prepare refusals 492, Crash-safe lifecycle 450, Per-run credential use 458, Fast-forward task branch push 454, Head evidence snapshot 493, Hand-off state 432, Reclaim program containment 461, Failed reclaim program 324, Reclaim program on one account 383, Single slot with a shared execution account 410, Pinned Git client 433, HTTPS remotes 296, Snapshot archive format 428, Conformance of the adapter's Git use 455.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on `5a0d1ca2`: exit 0, from 2026-10-28T02:27:17Z to 02:29:32Z; tests 2519, suites 45, pass 2472, fail 0, cancelled 0, skipped 47; all files lines 99.31, branches 92.59, functions 98.97.

## Hosted Linux acceptance (G3 item 43 follow-up)

Not part of this change's scope; recorded at the coordinator's request.

- Run: 40618190663, `.github/workflows/linux-acceptance.yml`, dispatched on `dev`; <https://github.com/petarnenov/taskelith/actions/runs/40618190663>.
- Head: `b099b9955119101d86b59d8c2ec9ed44cda35d23`.
- Conclusion: `success`. Job `linux-x86_64` from 2026-10-28T01:58:41Z to 02:08:05Z, 9 min 24 s; the run from 01:58:38Z to 02:08:06Z.
- Runner: Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, x86_64, Docker 28.0.4, ext4, `overlay2` storage driver (the job log's proof lines).
- Log: `native-acceptance.sh: seed 355140630`, entry `linux-ubuntu-24.04-x86_64`, and as its last line `native-acceptance.sh: every proof passed`. The twelve proof commands and their results, from `gh run view 40618190663 --log`:

| Area | Command | Result |
| --- | --- | --- |
| service-lifecycle | `scenario-worker-lifecycle` | `worker-lifecycle passed` |
| process-ownership | `scenario-worker-kill` | `worker-kill passed` |
| process-ownership | `verify-linux-cgroup` | tests 17, pass 17, fail 0 |
| journal-and-storage | `linux-test-suites` (worker journal and others) | tests 104, pass 102, fail 0, skipped 2 |
| journal-and-storage | `scenario-worker-disk-loss` | `worker-disk-loss passed` |
| cancellation | `verify-linux-cgroup PATTERN=cancel\|descendant` | tests 3, pass 3, fail 0 |
| cancellation | `linux-test-suites` (worker supervisor and others) | tests 19, pass 17, fail 0, skipped 2 |
| connectivity | `linux-test-suites` (offline launch and others) | tests 25, pass 25, fail 0 |
| process-ownership | `verify-linux-crash-windows SKIP_PATTERN=redelivered` | tests 28, pass 28, fail 0 |
| connectivity | `verify-linux-crash-windows PATTERN=redelivered` | tests 1, pass 1, fail 0 |
| cancellation | `verify-linux-g2-scenarios` (races and stale generations) | tests 12, pass 11, fail 0, skipped 1 |
| connectivity | `verify-linux-g2-scenarios` (partitions) | tests 6, pass 6, fail 0 |

The two G2 scenario proofs that `complete-g2-native-acceptance-rows` added ran on the hosted runner for the first time in this run. Its `results.jsonl` artifact was not downloaded for this record.

## Review pass 1 fixes

Review pass 1 (reviewer A, at `d750d2c2`) reported 8 Medium and 3 Low findings; the coordinator recorded them and ruled on the credential header. The code and tests are in `63dba2ae`, the contract and change documents in `ef499b94`.

Coordinator ruling A, option (b), done the cheap way: the SCM plugin's credential binding supplies the complete, already encoded `Authorization` value (`WorkspaceCredential.authorization`); the adapter only places it into `http.extraHeader` through the environment (`gitConfigEnvironment`) and treats the whole value as a secret everywhere. The GitHub plugin forms `Basic` and the base64 of `x-access-token:<secret>`; the contract names the form plugin-owned, with GitHub as its first instance. No Forgejo work. Contract sections 7 and 8 and design D3 and D4 state it, and section 8 states both the ancestry check and the exact lease form.

| Finding | Severity | Fix | Evidence |
|---|---|---|---|
| 1 push options can be cancelled | M | the suite compares the whole push argument list with `taskBranchPushArguments`, at most `-C <dir>` before `push` | variants `cancelsAtomic`, `cancelsLease` fail remote-moved, not-fast-forward, planted settings |
| 2 redaction of every credential form | M | `sensitiveValues`: secret, `authorization`, the part after the scheme, and base64 of each | variant `passesHeaderInArguments` fails four cases |
| 3 labels echo arguments | M | `processLabel` names the pid and a safe subcommand; arguments are redacted before formatting | three tests that no finding holds the credential; they failed 3 of 3 with a label that echoed the arguments |
| 4 environment names prove nothing | M | the fixture reports values, redacted; the suite checks `GIT_BUILT_ENVIRONMENT`, the exact settings, and no foreign `GIT_*` | variants `inheritsGlobalConfig`, `inheritsConfigPairs` fail the Git process case |
| 5 `plantGitSetting` wrote invalid config | M | the double plants through `git config --file <config> --add` | a test lists the file with the real `git config --file <f> --list` |
| 6 planted settings that acted | M | each process carries `.git/config` as it found it; the case fails on any planted value there | variant `rewritesConfigAfterGit` fails the planted settings case |
| 7 non-UTF-8 paths | M | refused with `precondition-failed`, reason `non-utf8-path` (`decodeGitPath`, `encodeHeadSnapshot`) | domain and archive unit tests |
| 8 Git process identity | M | MODIFIED "Git process identity" with the Linux and macOS distinction, 488 characters | strict validation |
| 9 `handedOff` errors | L | section 9 lists `handedOff` beside `list` and `sweep` and defines its disk errors | contract review |
| 10 pax split by length | L | the double's reader takes each pax record by its recorded length | a newline path test; it failed with the old reader |
| 11 `__proto__` file | L | the reader and working tree use objects without a prototype | a `__proto__` test; it failed with the old code |

New defective variants: `passesHeaderInArguments`, `inheritsGlobalConfig`, `inheritsConfigPairs`, `cancelsAtomic`, `cancelsLease`, `rewritesConfigAfterGit` (sixteen in this change).

Checks at the working tree of `ef499b94`:

- `npm run openspec -- validate align-git-workspace-adapter-contract --strict`: valid.
- `make findings ARGS="validate"`: 57 findings files and 37 pass summary files valid.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0; tests 2535, pass 2488, fail 0, skipped 47; all files 99.32% lines, 92.60% branches, 98.98% functions; `git-process-checks.js` 100/93.48/100, `workspace-conformance.js` 99.62/87.74/100, `snapshot-archive.js` 100/95.65/100; comment length rule passed.

## Review pass 2 fixes

Review pass 2 (reviewer B, at `e267cf7a`) reported 1 High, 6 Medium, and 12 Low findings. The code and tests are in `aa9553c7`, the contract, G3 plan, spec delta, and change documents in `6fb69a1e`.

| Finding | Fix | Evidence |
|---|---|---|
| H1 remote head read in a handed-off checkout | contract section 7 "Outside every repository": a process that needs no checkout starts in `/` (`GIT_NEUTRAL_DIRECTORY`); the fixture reports each process's working directory and the configuration of the repository found from it | new case "reads the remote head of a handed-off workspace outside every repository" with `insteadOf` and `http.proxy` planted; variant `readsRemoteInCheckout` fails it and the Git process case |
| M1 environment beyond `GIT_*` | `GIT_BUILT_ENVIRONMENT` is the allowlist with `PATH=/usr/bin:/bin`, `HOME=/nonexistent`, `LC_ALL=C`; any other variable is a finding | variant `inheritsUserEnvironment` (`XDG_CONFIG_HOME`, `https_proxy`, `SSH_ASKPASS`) |
| M2 one marker for every value | the fixture shows exactly `Authorization: <authorization>` as `redactedHeader(<credentialId>)`; the suite requires the operation's own credential's marker, and scans every unredacted value with `sensitiveValues` | variant `sendsSecretAsHeader`; no finding of it repeats a credential |
| M3 no producer of `authorization` | obligation on item 20 in contract section 14 and in the G3 plan row 20; the spec scenario now checks only that the supplied value is used unchanged ("Supplied header value"); `scm-port` unchanged | strict validation |
| M4 insecure remotes and remote calls | the case checks `remoteCalls()` before and after each refusal, also with a foreign credential, which must get `insecure-remote` | variant `callsRemoteBeforeTransport` |
| M5 lease variant never pushed | `ignoresLease` checks ancestry against the expected head and pushes | the remote-moved case now reports "remote after expecting no branch" and "remote after expecting a moved head" for it |
| M6 record lost `__proto__` | `encodeHeadSnapshot` takes a `ReadonlyMap` | a snapshot conformance check and a unit test with a file named `__proto__` |
| L1 | "Fast-forward task branch push" again says it updates only the task branch | spec delta |
| L2 | "Reclaim program containment" excepts the case where the identities are the same | spec delta |
| L3 | the encoder refuses a gitlink before text that is not UTF-8, as section 9 orders them | unit test |
| L4 | contract section 3 step 7 accepts the window between a failed program and its durable outcome, with the reason | contract |
| L5 | the planted case takes `since` before the reclaim | suite |
| L6 | unit tests of UTF-8 byte order (U+1F600 after U+E000) and the 100-byte name boundary; the suite compares the snapshot bytes with `encodeHeadSnapshot` of the decoded tree | tests |
| L7 | a hook and case for a path that is not UTF-8 are a 16b follow-up | follow-ups below |
| L8 | the spec says the image build checks the package; the suite requires `argv[0]` to be a pinned path | variant `runsGitFromPath` |
| L9 | a `worker-runtime` spec change for the slot rule is a 16e follow-up | follow-ups below |
| L10 | contract section 7 records the macOS environment read as an accepted residual risk | contract |
| L11 | `taskBranchPushOptions` is no longer exported; `taskBranchPushArguments` builds the whole command | domain test |
| L12 | this record's scope note, task 4.2, the dated length list, the renamed case, and `overlay2` are corrected | this record |

New defective variants: `readsRemoteInCheckout`, `inheritsUserEnvironment`, `sendsSecretAsHeader`, `callsRemoteBeforeTransport`, `runsGitFromPath` (twenty-one in this change). New conformance case: one (seven in this change).

Requirement body lengths now, in characters: Prepare refusals 492, Crash-safe lifecycle 450, Per-run credential use 480, Fast-forward task branch push 483, Head evidence snapshot 493, Hand-off state 432, Reclaim program containment 496, Git process identity 488, Git process observation 473, Failed reclaim program 324, Reclaim program on one account 383, Single slot with a shared execution account 410, Pinned Git client 457, HTTPS remotes 296, Snapshot archive format 433, Conformance of the adapter's Git use 457.

Checks on the working tree of `6fb69a1e`:

- `npm run openspec -- validate align-git-workspace-adapter-contract --strict`: valid.
- `make findings ARGS="validate"`: 57 findings files and 37 pass summary files valid.
- Workspace package: tests 126, pass 126.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0; tests 2546, pass 2499, fail 0, skipped 47; all files 99.32% lines, 92.59% branches, 98.98% functions; `git-process-checks.js` 100/90.00/100, `workspace-conformance.js` 99.65/88.51/100, `snapshot-archive.js` 100/95.65/100; comment length rule passed.

## Independent review

| Pass | Role | Reviewer | Reviewed head | Critical | High | Medium | Low | Fixes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | Codex, `gpt-6.1-sol`, session `01a18059-178f-78d2-8df7-e369e3562b7a` | `d750d2c2` | 0 | 0 | 8 | 3 | section Review pass 1 fixes |
| 2 | B | Claude, `claude-opus-5-5`, session `9194f7e1-f99c-4a4a-8347-2f14a5ec51cc` | `e267cf7a` | 0 | 1 | 6 | 12 | section Review pass 2 fixes |
| 3 | A | Codex `gpt-6.1-sol` (medium), session `01a1807d-24ac-77d3-8e0d-f00a51321d72` | `0f56cb52` | 0 | 0 | 2 | 1 | section Unreviewed fixes after pass 3 |

The size grew from S-M to M through the fixes of passes 1 and 2: a module of Git process checks, the neutral working directory, the environment allowlist, and twenty-one defective variants.

## Unreviewed fixes after pass 3

- **Decision:** the review pass cap was reached ([review process](/docs/governance.md#independent-review-process)), and a Medium left after pass 3 needs the owner. The owner's away delegate chose option (a) on 2026-10-28, in away run `20261028T031337Z-claude-12008`: fix all three findings without a fourth review pass, as 26a (`issue-installation-certificates`) and item 27 (`implement-worker-self-check-admission`) did. M1, M2, and L1 are `fixed-unreviewed` in `findings.jsonl`.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| P3-M1 | Medium | The spec's "Failed reclaim program" still forbade any rerun and required `reclaim-failed` after any restart, while contract section 3 accepts a rerun after a crash before the failure is recorded | Unreviewed fix: the requirement forbids a rerun only once the failure is durable in the hand-off record and allows one more run after a crash before that write (461 characters); scenario "Reclaim after a recorded failure and a restart" replaces "Reclaim after a failed program and a restart", and "Crash before the failure is recorded" is new. The suite and the double do not model `reclaim-failed`, so neither changed | `756d7ba7` |
| P3-M2 | Medium | The suite accepted only the static pins' path as `argv[0]`, though the contract lets a test inject another pin, such as a wrapper | Unreviewed fix: the fixture names its `gitClient` pin; the Git process check compares `argv[0]` with that pin's path; the double takes the pin; the contract's sections 7 and 12 say so | `b3991433`, `756d7ba7` |
| P3-L1 | Low | This record still listed pass 2 as pending | Unreviewed fix: this section, the Independent review table, and tasks 4.3, 4.4, and 4.7 ticked | this record |

**Before the fix, M1.** The old requirement said "SHALL make `reclaim` fail with `precondition-failed` and reason `reclaim-failed`, also on a later call and after a restart, ... the worker SHALL never run the program again for that hand-off", and its scenario "**WHEN** the worker restarts after its reclaim program failed and `reclaim` is called again **THEN** it fails with reason `reclaim-failed` without starting the program". The new scenario "**WHEN** the worker is killed after its reclaim program failed and before the failure is durable in the hand-off record, and `reclaim` is called after the restart **THEN** the worker proves the containment empty and runs the program again" contradicts both: the program failed, the worker restarted, and the program runs again.

**Before the fix, M2.** The new test `a provider composed with another Git client pin passes the suite through that path` (`test/workspace-conformance.test.ts`, pin path `/opt/taskelith/test/git-wrapper`) was run with `git-process-checks.ts` of `04e2e527`, after `npm run build`: `node --experimental-strip-types --test --test-name-pattern="pin" test/workspace-conformance.test.ts` failed it with "Git process 1000 (ls-remote): not started through the pinned client's path", and the same for the clone, status, and ls-tree processes. With the fix, it passes; `the Git process case reports a process that does not start through the composed pin` checks the other direction.

**After the fixes**, on the working tree of `756d7ba7`:

- `npm run openspec -- validate align-git-workspace-adapter-contract --strict`: valid.
- Archive in a scratch copy: `git worktree add --detach` of `756d7ba7` in the scratchpad, `npm run openspec -- archive align-git-workspace-adapter-contract --yes`: "+ 8 added, ~ 8 modified", archived as `2026-10-28-align-git-workspace-adapter-contract`; then `npm run openspec -- validate --all --strict`: "Totals: 69 passed, 0 failed (69 items)"; the copy was removed.
- `make findings ARGS="validate"`: 57 findings files and 37 pass summary files valid.
- Workspace package: tests 128, pass 128.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0; tests 2548, pass 2501, fail 0, skipped 47; all files 99.32% lines, 92.61% branches, 98.98% functions; `git-process-checks.js` 100/91.67/100, `workspace-conformance.js` 99.65/88.51/100; comment length rule passed.

## Remaining gates

- The archive (task 5.1).
- The suite natively on macOS against the Git adapter: pending, after 16b (contract section 13).

## Follow-ups for 16b to 16e

- 16b: a fixture hook that commits a path that is not valid UTF-8, with a conformance case that `snapshot` refuses it with `non-utf8-path` (spec scenario "Path that is not UTF-8"; review pass 2, Low 7); the double's string paths cannot hold such a path.
- 16b: the adapter's local operations through `encodeHeadSnapshot`, the crash points `WS1` to `WS4`, the pinned client gate at the composition, the rewrite of `.git/config`, and the `non-utf8-path` refusal of Git's path bytes through `decodeGitPath`.
- 16c: `readRemoteHead` and the leased push with the ancestry check before the push, the `http.extraHeader` transport of the plugin-formed `authorization` value, and a local Git server over `http://127.0.0.1` composed with `https-or-loopback-http`; the fixture hooks observe the real Git processes (for example through a wrapper at the pinned path that records argv, pid, the environment with credential values redacted, and `.git/config` at the start).
- 16d: the hand-off and reclaim with `WS5` to `WS10`, the reclaim containment and its bound, the scan exclusion, the Linux tests of contract section 13 in the worker image with the package `git=1:2.43.0-1ubuntu7.4` checked at build time.
- 16e: a `worker-runtime` spec change for the single-slot rule, which this change states in `git-workspace-port` only (review pass 2, Low 9).
- 16e: the worker settings' refusal with `TASKELITH_WORKER_SLOTS` above `1`, the held slot counted through `handedOff`, the execution group wiring, `fs.protected_hardlinks`, `reclaim-failed` handling, the tool manifest, and the macOS composition with the reclaim program in its own process group.
- Item 38: the delegated-child half of the "One handed-off workspace" test.

## Archive checks

Run on the archived tree, on dev `b099b995` (no newer dev commits at archive time), on 2026-10-28:

- `npm run openspec -- archive align-git-workspace-adapter-contract --yes`: archived as `2026-10-28-align-git-workspace-adapter-contract`; `git-workspace-port` updated (8 added, 8 modified).
- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived`: 218 passed, 13 failed; the 13 are archived changes of 2026-10-24 to 2026-10-26 that this change does not touch, and this change passes.
- `git diff b099b995 -- openspec/specs`: only `openspec/specs/git-workspace-port/spec.md`, the requirements of the delta.
- `make findings ARGS="validate"`: 57 findings files and 37 pass summary files valid.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0; 2548 tests, 2501 passed, 0 failed, 47 skipped; coverage 99.32% lines, 92.61% branches, 98.98% functions.

Remaining gate: integration into `dev` by the coordinator. Item 16 continues with 16b to 16e; the macOS native conformance gate stays pending on the owner's Mac.
