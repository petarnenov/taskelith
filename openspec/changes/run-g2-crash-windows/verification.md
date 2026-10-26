## Scope and source

G2 work item 24, second part (24b), `run-g2-crash-windows`, assigned by the coordinator on 2026-10-26: a crash at each launch window W1 to W6 of the [worker journal contract](../../../docs/contracts/worker-journal.md) and each step CP1 to CP12 of the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md), each followed by a restart and recovery, and duplicate delivery of an offer, run through the harness with recorded results. Excluded: the 24a scenarios (composition happy path, results recorder, disk loss, container `SIGKILL`), the 24c scenarios (partition and reconnect, cancellation races, stale generation and epoch), product code, contracts, and Compose overrides. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the 24a change `run-g2-failure-scenarios-composition` (its recorder, cherry-picked as `d060900` and since merged into `dev` with PR #288, its requirement "Recorded scenario results", and its design decision 6, the owner's delegate's decision on "through the harness").

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`, plus `d060900` (24a's recorder, Maki's `3f9777d`), and `origin/dev` merged in as `d1df5ad` and, after 24a landed (PR #288, `3321cf2`), as `1baa1a1`. Branch `run-g2-crash-windows`. The final evidence run is of `40aab95`, which holds the final test code: it adds the tsconfig references of the two worker adapters and keeps `NODE_V8_COVERAGE` out of the composed worker, whose crashed children otherwise left an empty coverage file that failed the coverage report of `make verify`.
- Host: macOS 26 (Darwin 25.6.0), x86_64 (2020 Intel iMac); Docker Desktop, engine 29.5.2; Node.js 24.22.1 from `.nvmrc`. Services: `make services-up` (PostgreSQL 18.6, NATS 2.15.1, Toxiproxy) of this worktree; another worktree ran `make verify` on the same host during some runs.

## Author self-check and evidence check

- No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or third-party dependency changes. `apps/control-plane` gains the workspace development dependencies `@taskelith/worker-journal` and `@taskelith/worker-supervisor`; `make dependency-inventory` changed only the lockfile digest and the two workspace edges in `docs/dependencies`.
- Evidence freshness: the merge `1baa1a1` brought 24a's Compose scenarios, scripts, and change documents, and resolved the add/add conflicts in 24a's change directory to `dev`'s version. It changed nothing under `apps/` or `packages/`, so `scenario-results.ts` equals `dev`'s and the evidence of `40aab95` still holds; it was not rerun.
- Spec delta after 24a landed: 24a creates `g2-failure-scenarios` with the same Purpose and its requirement "Recorded scenario results"; this delta adds four other requirements and cites that one instead of restating the record fields or the target per scenario.
- `scenario-results.ts` of 24a is used unchanged; no defect was found in it. Its API has no helper that records `failed` and rethrows, so the scenario file does that in `recorded`.
- Every armed point was reached: each scenario asserts the crash trace and, for a worker point, the worker's `SIGKILL` status before the restart. The W points are reached only at the journal's commits, so their crashes also show that the resolution hook reached the journal.
- The eleven D1 windows are expected failures (`expectFailure` of `node:test`, the runner's counterpart of `it.fails`), never skipped. They pass only when the error matches D1's signature, which the scenario raises only after it saw the control plane log `execution.launch.rejected` with `execution-conflict` and found in the worker journal exactly one execution whose operation is `rejected-final` with `execution-conflict`, and no spawn. Any other failure, and a recovery that succeeds once D1 is fixed, fails the test.
- `npm run check:boundaries`, `npm run verify:comments`, and `npm run verify:dependencies` pass.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-crash-windows --strict` | valid |
| `npm run verify:archive` | passed, with 24a's change archived after this one; archiving 24a first in a copy of `openspec/` also gave strictly valid specs; both orders checked again after the merge `1baa1a1` |
| Evidence run of `40aab95`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows/results.jsonl node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts` against `make services-up` | 27 tests passed (16 scenarios passed, 11 expected failures on D1); `results.jsonl` holds 27 lines, 16 `passed` and 11 `failed`, all target `harness-composition`, arch `x64`, commit `40aab95`, seed `2776760789` |
| `make verify` of `40aab95` | Passed: 1787 tests, 1785 passed, 0 failed, 2 skipped (the Linux-only scan tests); coverage of all files 99.27% lines, 92.07% branches, 99.03% functions; OpenSpec 69 passed; `verify:archive` and `verify:package` passed |
| `make verify-linux-cgroup` | not run: this change adds no test there |

## Windows and results

Seed `2776760789` for every row, on macOS natively.

| Window | How it is reached | Expected (recovery table) | Result |
| --- | --- | --- | --- |
| W1.before, W1.after | Journal hook around the offer's inbox commit | The broker redelivers; one execution exits 0 | passed |
| W2.before, W2.after | Journal hook around the authorization operation | Seal the pending W2 (W6), new execution, exits 0 | passed |
| W3.before, W3.after | Journal hook around the grant | Seal, `not-started`, new execution, exits 0 | expected failure, D1 |
| W4.before, W4.after | Journal hook around "record written" | Seal (before) or recovery table (after), new execution, exits 0 | expected failure, D1 |
| W5s.before, W5s.after | Journal hook around the start fact | Adopt the live supervisor, exits 0 | passed |
| W5e.before, W5e.after | Journal hook around the exit fact | Report the recorded exit 0 | passed |
| W6.before, W6.after | First crash at W3.after, then the hook in the recovering worker's seal | Seal, new execution, exits 0 | expected failure, D1 |
| CP1 | Supervision port: `prepare` entry, grant journaled | As W3.after | expected failure, D1 |
| CP2 | Supervision port: `intent` written, no W4 | Seal, new execution, exits 0 | expected failure, D1 |
| CP3 | Supervision port: `start` entry, W4 committed | No launch record: seal, new execution, exits 0 | expected failure, D1 |
| CP4 | Supervision port: the supervisor started | The supervisor runs on; adopt, exits 0 | passed |
| CP5 | Supervisor program: `supervisor.1` written, checks passed | No launch record: seal, new execution, exits 0 | expected failure, D1 |
| CP6 | Supervisor program: after the containment step (none on macOS) | As CP5 | expected failure, D1; Linux containment not applicable (below) |
| CP7 | Supervisor program: claim written | macOS, no handle: `uncertain`, no spawn | passed |
| CP8 | Supervisor program: child spawned, no handle | macOS, no handle: `uncertain`, one spawn | passed |
| CP9 | Supervisor program: handle written | Adopt the child; once it is gone, `uncertain`, one spawn | passed |
| CP10 | Supervision port: the worker read the handle | Adopt, exits 0 | passed |
| CP11 | Supervisor program: `exit` written | Report the recorded exit 0 | passed |
| CP12 | Supervision port: the worker read the exit | Report the recorded exit 0 | passed |
| Duplicate delivery | The published offer again: 2 copies while the child ran, 3 after the result | One intent, one execution, one spawn, one result | passed |

## Not applicable on this host

| Window or row | Reason |
| --- | --- |
| CP6, the Linux containment (create, admit, remove) | macOS has no containment; CP6 is reached as a named point between CP5 and CP7. The composed worker on Linux needs a delegated cgroup and an execution account, which only the privileged container of `make verify-linux-cgroup` has, and that container runs with `--network none`, so the `make` services are out of reach. Item 15's privileged tests crash the supervisor at CP5 to CP11 with a containment there. |
| The Linux rows of supervisor identity contract section 6 (populated or empty containment, namespace incarnation) | The same: no containment on macOS; item 25 runs item 24's scenarios on each Linux matrix entry. |

## Product defect D1: a relaunch after `not-started` is rejected with `execution-conflict`

- Scenarios: `crash-window-w3-before`, `-w3-after`, `-w4-before`, `-w4-after`, `-w6-before`, `-w6-after`, `-cp1`, `-cp2`, `-cp3`, `-cp5`, `-cp6`; seed `2776760789`.
- Reproductions: three full runs on 2026-10-26 (the first two before the seed was fixed, the third the evidence run of `df271e2`), each with the same eleven failures, and `crash-window-w3-after` alone with a 240 s wait instead of 60 s, in which the attempt stayed without an outcome. The final evidence run of `40aab95` reproduced D1's signature in all eleven.
- Sequence:
  1. The control plane grants execution E1 and records it `authorized` and owning.
  2. The worker crashes after the grant (W3) and before its supervisor claims, or its supervisor dies before claiming (CP5, CP6).
  3. On restart the worker seals E1, commits W6, and queues `execution.not-started` in its outbox.
  4. In the same pass the worker continues the launch with a new execution E2 and requests its authorization over HTTP, with `reportsNotStarted` false, while E1's `not-started` is still in the outbox or on the broker.
  5. The authority still sees E1 `authorized` and owning, so its ownership rule rejects E2 with `execution-conflict`.
  6. `execution-conflict` is not retryable, so the worker journals it `rejected-final`, and recovery never continues an intent with a final rejection. The control plane later records E1 `not-started`, but nothing launches again, and the attempt has no outcome.
- References:
  - `packages/modules/execution/src/domain/journal-recovery.ts:34` (an intent with a final rejection is never continued) and `:35` (`continue-launch` once every execution ends without a process).
  - `apps/worker/src/launch-orchestrator.ts:561` (`relaunch` after `not-started`; line 547 at `f9ba7a5`, before the merge of `origin/dev`).
  - `packages/modules/execution/src/domain/launch-authorization.ts:239-248` (`applyOwnershipRule`, the `execution-conflict` rejection).
  - `packages/adapters/worker-journal/src/sqlite-worker-journal.ts:149` (a rejection that is not retryable is journaled `rejected-final`).
  - [Launch authorization contract](../../../docs/contracts/launch-authorization.md) section 4 (another execution is rejected until the owning one is `not-started`) and section 9 (`execution-conflict` is not retryable).
  - [Worker journal contract](../../../docs/contracts/worker-journal.md) section 5, recovery row "W2 without an outcome, or W3 with a grant, and no W4".
  - `worker-runtime` spec, requirement "Start reconciliation", scenario "Pending W2 on start".
- Expected: the execution is sealed and reported `not-started`, and the intent launches under a new execution that is granted, spawns once, and exits 0, so the attempt ends `exited`.
- Observed: E1 `not-started` in the control plane, no second execution there; in the worker journal E2 with one operation, `rejected-final`, `execution-conflict`; no spawn; no attempt outcome after 240 s.
- W2.after passes because the authority never saw that execution. A grant abandoned at runtime (`launch-orchestrator.ts` `#abandon`) may race the same way, although a back-off precedes its new execution; not tested here.
- Decision: the owner's delegate chose option (b) in away run `20261026T161148Z-opencode-90873`. `LaunchRequest` gets an optional `reportsNotStartedFor` (`executionId`, `operationId`); the authority applies the referenced execution's `not-started` first, then the ownership rule for the new execution, in one transaction; the worker's `continue-launch` and `relaunch` requests fill it from the sealed execution. It is a contract change to launch authorization sections 4 and 9 (and journal section 5 if needed). The fix comes in a separate change, `fix-launch-recovery-reauthorization`, which fixes D1 only, turns the eleven expected failures back into ordinary scenarios, and reruns the evidence with seed `2776760789`; CP5 may also need the fix of O1 to pass. It is not implemented here.

## Observation O1: a live worker does not notice a supervisor that died before its claim

With CP5 armed and the worker kept running, the execution stayed `authorized` with no observation for 30 s; only the worker's restart sealed it. `ExecutionWatch.observe` checks the supervisor's liveness only for a claimed launch record (`apps/worker/src/execution-watch.ts:114`). The scenarios restart the worker after every supervisor crash, so none of them fails on it. The coordinator took O1 to the owner's delegate, who decided (A) in away run `20261026T161148Z-opencode-90873`: it is a defect to fix in G2, where the watch also checks liveness for an authorized but unclaimed launch record after a bound. The fix belongs to a separate change, `fix-unclaimed-launch-liveness`, assigned to another worker; it is not implemented here.

## Independent review

Codex CLI (gpt-6-astra) pending.

## Limitations and remaining gates

- Eleven windows are expected failures on D1 until `fix-launch-recovery-reauthorization` lands (CP5 possibly also until `fix-unclaimed-launch-liveness` lands); their `failed` rows stay in `results.jsonl`.
- The control plane runs in the test process; the scenarios crash the worker and the supervisor only.
- Remaining gates: the independent review, integration by the coordinator, the archive, and, in the follow-up changes, the fix of D1 (`fix-launch-recovery-reauthorization`) with a new evidence run and the fix of O1 (`fix-unclaimed-launch-liveness`).
