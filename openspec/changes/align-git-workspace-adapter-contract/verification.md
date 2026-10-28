# Verification: align-git-workspace-adapter-contract

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16a, size S-M, assigned by the coordinator and developed in a briefed subagent. The owner's delegate's decisions of 2026-10-28, numbered 1 to 12 in the brief, are applied as design D1 to D12. Scope: the contract, the `git-workspace-port` spec, the port, the fixture, the conformance suite, and the test double; no Git code, which follows in 16b to 16e. No external review has run.

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
| runs Git in an environment it builds, with no secret in an argument (new) | `no Git process was observed` |
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
- Requirement body lengths in the spec delta, in characters: Prepare refusals 492, Crash-safe lifecycle 450, Per-run credential use 458, Fast-forward task branch push 454, Head evidence snapshot 493, Hand-off state 432, Reclaim program containment 461, Failed reclaim program 324, Reclaim program on one account 383, Single slot with a shared execution account 410, Pinned Git client 433, HTTPS remotes 296, Snapshot archive format 428, Conformance of the adapter's Git use 455.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on `5a0d1ca2`: exit 0, from 2026-10-28T02:27:17Z to 02:29:32Z; tests 2519, suites 45, pass 2472, fail 0, cancelled 0, skipped 47; all files lines 99.31, branches 92.59, functions 98.97.

## Hosted Linux acceptance (G3 item 43 follow-up)

Not part of this change's scope; recorded at the coordinator's request.

- Run: 40618190663, `.github/workflows/linux-acceptance.yml`, dispatched on `dev`; <https://github.com/petarnenov/taskelith/actions/runs/40618190663>.
- Head: `b099b9955119101d86b59d8c2ec9ed44cda35d23`.
- Conclusion: `success`. Job `linux-x86_64` from 2026-10-28T01:58:41Z to 02:08:05Z, 9 min 24 s; the run from 01:58:38Z to 02:08:06Z.
- Runner: Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, x86_64, Docker 28.0.4, ext4, overlay storage driver (the job log's proof lines).
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

## Remaining gates

- Review passes 1 to 3 (tasks 4.2 to 4.4) and the archive (task 5.1).
- The suite natively on macOS against the Git adapter: pending, after 16b (contract section 13).

## Follow-ups for 16b to 16e

- 16b: the adapter's local operations through `encodeHeadSnapshot`, the crash points `WS1` to `WS4`, the pinned client gate at the composition, the rewrite of `.git/config`, and a decision on tree paths that are not valid UTF-8 (refused with a named reason, or written as raw bytes through pax with `hdrcharset`).
- 16c: `readRemoteHead` and the leased push with the ancestry check before the push, the `http.extraHeader` transport, and a local Git server over `http://127.0.0.1` composed with `https-or-loopback-http`; the fixture hooks observe the real Git processes (for example through a wrapper at the pinned path that records argv, pid, and environment names).
- 16d: the hand-off and reclaim with `WS5` to `WS10`, the reclaim containment and its bound, the scan exclusion, the Linux tests of contract section 13 in the worker image with the package `git=1:2.43.0-1ubuntu7.4` checked at build time.
- 16e: the worker settings' refusal with `TASKELITH_WORKER_SLOTS` above `1`, the held slot counted through `handedOff`, the execution group wiring, `fs.protected_hardlinks`, `reclaim-failed` handling, the tool manifest, and the macOS composition with the reclaim program in its own process group.
- Item 38: the delegated-child half of the "One handed-off workspace" test.
