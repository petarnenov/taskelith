## Scope and source

G2 work item 24, second part (24b), `run-g2-crash-windows`, assigned by the coordinator on 2026-10-26: a crash at each launch window W1 to W6 of the [worker journal contract](../../../docs/contracts/worker-journal.md) and each step CP1 to CP12 of the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md), each followed by a restart and recovery, and duplicate delivery of an offer, run through the harness with recorded results. Excluded: the 24a scenarios (composition happy path, results recorder, disk loss, container `SIGKILL`), the 24c scenarios (partition and reconnect, cancellation races, stale generation and epoch), product code, contracts, and Compose overrides. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the 24a change `run-g2-failure-scenarios-composition` (its recorder, cherry-picked as `d060900`, since merged into `dev` with PR #288 and archived, its requirement "Recorded scenario results", and its design decision 6, the owner's delegate's decision on "through the harness").

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`, plus `d060900` (24a's recorder, Maki's `3f9777d`), and `origin/dev` merged in as `d1df5ad`, as `1baa1a1` after 24a landed (PR #288, `3321cf2`), and as `4dce961` after 24a's archive (`8829a02`). Branch `run-g2-crash-windows`. `40aab95` added the tsconfig references of the two worker adapters and keeps `NODE_V8_COVERAGE` out of the composed worker, whose crashed children otherwise left an empty coverage file that failed the coverage report of `make verify`. The fixes of review pass 1 are `97272c9` and `1868a99`; the final evidence run is of `1868a99`, which holds the final test code.
- Host: macOS 26 (Darwin 25.6.0), x86_64 (2020 Intel iMac); Docker Desktop, engine 29.5.2; Node.js 24.22.1 from `.nvmrc`. Services: `make services-up` (PostgreSQL 18.6, NATS 2.15.1, Toxiproxy) of this worktree; another worktree ran `make verify` on the same host during some runs.

## Author self-check and evidence check

- No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or third-party dependency changes. `apps/control-plane` gains the workspace development dependencies `@taskelith/worker-journal` and `@taskelith/worker-supervisor`; `make dependency-inventory` changed only the lockfile digest and the two workspace edges in `docs/dependencies`.
- Evidence freshness: the merge `1baa1a1` brought 24a's Compose scenarios and change documents and resolved the add/add conflicts in 24a's change directory to `dev`'s version; the merge `4dce961` brought 24a's archive, which removed `openspec/changes/run-g2-failure-scenarios-composition/` (`openspec list` shows only this change and `align-ui-poc-with-design-rules`). Neither changed anything under `apps/` or `packages/`, so `scenario-results.ts` equals `dev`'s. The evidence was rerun on `1868a99`, after the fixes of review pass 1.
- Spec delta after 24a landed: 24a created `g2-failure-scenarios`, now in `openspec/specs/` with its seven requirements, among them "Recorded scenario results"; this delta adds four other requirements and cites that one instead of restating the record fields or the target per scenario. Archived on top of 24a's spec, the capability holds eleven requirements and stays strictly valid.
- `scenario-results.ts` of 24a is used unchanged; no defect was found in it. Its API has no helper that records `failed` and rethrows, so the scenario file does that in `recorded`.
- Every armed point was reached: each scenario asserts the crash trace and, for a worker point, the worker's `SIGKILL` status before the restart. The W points, CP10, and CP12 are reached only at the journal's commits, so their crashes also show that the resolution hook reached the journal; CP10 and CP12 also check the journaled `started` or `exited` state before the restart.
- Every scenario checks that no test-side barrier ran into its bound: the scripted child, the CP4 claim, and the D1 hold each write such a release to the order trace.
- The eleven D1 windows are expected failures (`expectFailure` of `node:test`, the runner's counterpart of `it.fails`), never skipped. They pass only when the error matches D1's signature, which the scenario raises only after it checked D1 exactly (design decision 9): one logged launch rejection, `execution-conflict`, for E2; in the journal one intent, E1 `not-started` and never rejected, and E2 on E1's assignment without a grant, whose only operation is `rejected-final` with `execution-conflict`; only E1, `not-started`, in the control plane's one attempt; E2's answer before E1's `not-started` in the order trace; no process left; no spawn. Each D1 record names that order. Any other failure, and a recovery that succeeds once D1 is fixed, fails the test.
- `npm run check:boundaries`, `npm run verify:comments`, and `npm run verify:dependencies` pass.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-crash-windows --strict` | valid |
| `npm run verify:archive` | passed; before 24a's archive both archive orders gave strictly valid specs, and after the merge `4dce961` this change archives onto 24a's spec with eleven requirements |
| Evidence run of `1868a99`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows/results.jsonl node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts` against `make services-up` | 27 tests passed (16 scenarios passed, 11 expected failures on D1); `results.jsonl` holds 27 lines, 16 `passed` and 11 `failed`, all target `harness-composition`, arch `x64`, commit `1868a99`, seed `2776760789`; the CP4 record names "CP4 after the claim", the CP9 record the adopter's `supervisor.2`, and each D1 record E2's answer before E1's published `not-started` |
| `make verify` of `40aab95` | Passed: 1787 tests, 1785 passed, 0 failed, 2 skipped (the Linux-only scan tests); coverage of all files 99.27% lines, 92.07% branches, 99.03% functions; OpenSpec 69 passed; `verify:archive` and `verify:package` passed |
| `make verify` of `814231e`, after the merge `1baa1a1` | Passed: 1814 tests, 1812 passed, 0 failed, 2 skipped; coverage of all files 99.28% lines, 92.07% branches, 99.03% functions; OpenSpec 69 passed; `verify:archive` and `verify:package` passed. The run before it failed once in 24a's timed stub test "the restart and the reconciliation share one deadline from the restart", which then passed five times alone and in this run |
| `make verify-linux-cgroup` | not run: this change adds no test there |

## Windows and results

Seed `2776760789` for every row, on macOS natively.

| Window | How it is reached | Expected (recovery table) | Result |
| --- | --- | --- | --- |
| W1.before, W1.after | Journal hook around the offer's inbox commit | The broker redelivers; one execution exits 0 | passed |
| W2.before | Journal hook before the authorization operation's commit | No execution was journaled: the intent continues with a new execution, exits 0 | passed |
| W2.after | Journal hook after that commit | Seal the pending execution (W6), new execution, exits 0 | passed |
| W3.before, W3.after | Journal hook around the grant | Seal, `not-started`, new execution, exits 0 | expected failure, D1 |
| W4.before, W4.after | Journal hook around "record written" | Seal (before) or recovery table (after), new execution, exits 0 | expected failure, D1 |
| W5s.before, W5s.after | Journal hook around the start fact | Adopt the live supervisor, exits 0 | passed |
| W5e.before, W5e.after | Journal hook around the exit fact | Report the recorded exit 0 | passed |
| W6.before, W6.after | First crash at W3.after, then the hook in the recovering worker's seal | Seal, new execution, exits 0 | expected failure, D1 |
| CP1 | Supervision port: `prepare` entry, grant journaled | As W3.after | expected failure, D1 |
| CP2 | Supervision port: `intent` written, no W4 | Seal, new execution, exits 0 | expected failure, D1 |
| CP3 | Supervision port: `start` entry, W4 committed | No launch record: seal, new execution, exits 0 | expected failure, D1 |
| CP4 | Supervision port: the supervisor started; the crash waits for its claim (order trace "CP4 after the claim"), so recovery finds a claimed record | The supervisor runs on; adopt, exits 0 | passed |
| CP5 | Supervisor program: `supervisor.1` written, checks passed | No launch record: seal, new execution, exits 0 | expected failure, D1 |
| CP6 | Supervisor program: after the containment step (none on macOS) | As CP5 | expected failure, D1; Linux containment not applicable (below) |
| CP7 | Supervisor program: claim written | macOS, no handle: `uncertain`, no spawn | passed |
| CP8 | Supervisor program: child spawned, no handle | macOS, no handle: `uncertain`, one spawn | passed |
| CP9 | Supervisor program: handle written; the child runs until an adopting supervisor wrote `supervisor.2` | Adopt the child; once it is gone, `uncertain`, one spawn | passed |
| CP10 | Armed journal: right after W5s, which commits the start fact with its outbox row; the journal holds `started` before the restart | Adopt, exits 0 | passed |
| CP11 | Supervisor program: `exit` written | Report the recorded exit 0 | passed |
| CP12 | Armed journal: right after W5e, which commits the exit fact with its outbox row; the journal holds `exited` before the restart | Report the recorded exit 0 | passed |
| Duplicate delivery | The published offer again: 2 copies while the child ran, held until they were acknowledged, and 3 after the result; the task is read again once the observations stream drained | One intent, one execution, one spawn, one result | passed |

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
  2. The worker crashes after the grant and before any supervisor claims (W3, W4, W6, CP1 to CP3), or its supervisor dies before claiming (CP5, CP6), and the worker starts again.
  3. Recovery plans per intent (`recoverIntent`, `journal-recovery.ts:30`) and takes one of two paths to E1's `not-started`:
     - Without W4 (W3.before, W3.after, W4.before, W6.before, CP1, CP2), E1 ends without a process, so the first plan holds `seal-execution` for E1 and `continue-launch` for its assignment. `#reconcile` (`launch-orchestrator.ts:225`) runs `#sealUnwritten` (`:239`), which seals the record and commits W6 with `execution.not-started` in the outbox; the continued launch creates E2. At W6.after, E1 is already `not-started` when the worker starts, so the plan holds only `continue-launch`.
     - With W4 (W4.after, CP3, CP5, CP6), the plan holds `recover-execution-record`; `#reconcile` hands E1 to the recovery table, which seals the unclaimed record and journals `not-started`. `continue-launch` comes in a later pass, once E1 is `not-started`, and creates E2.
  4. E2's launch request goes to the authority over HTTP with `reportsNotStarted` false. Nothing orders it after the control plane has processed E1's `not-started`, which travels through the outbox and the broker. The code allows either order, and this change does not claim which one an unconstrained run takes; the scenarios fix the order that exposes D1 with the test-side hold (design decision 2), and every D1 record shows E2's answer before E1's `not-started` was published.
  5. The authority still sees E1 `authorized` and owning, so its ownership rule rejects E2 with `execution-conflict`.
  6. `execution-conflict` is not retryable, so the worker journals it `rejected-final`, and recovery never continues an intent with a final rejection. The control plane later records E1 `not-started`, but nothing launches again, and the attempt has no outcome.
- References:
  - `packages/modules/execution/src/domain/journal-recovery.ts:34` (an intent with a final rejection is never continued) and `:35` (`continue-launch` once every execution ends without a process).
  - `packages/modules/execution/src/domain/journal-recovery.ts:30` (`recoverIntent`), `:44` (`recover-execution-record` once W4 is journaled), and `:45` (`seal-execution` before it).
  - `apps/worker/src/launch-orchestrator.ts:225` (`#reconcile`) and `:239` (`#sealUnwritten`). The runtime relaunch after a `not-started`, `#afterNotStarted` (`:561`), is a separate path that these scenarios do not reach; it may race the same way.
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

### Review pass 1

- Reviewer: Codex CLI, model `gpt-6-astra`, reasoning effort medium, read-only sandbox. Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The output header confirmed model `gpt-6-astra`, sandbox read-only, reasoning effort medium. Session `01a17919-8998-74e1-b9d7-19d9587f577b`.
- Revision `f385e5ecd2b729d9722ab1e8af961dcb5f79a17a`. Worktree snapshot `067aaedb22775900f3087d843feb4fc0a5754d793c88dced25936bb86b8fd1dc` before and after the review, unchanged.
- Counts: Critical 0, High 1, Medium 7, Low 2.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | `d1Failure` was too loose and raised D1's signature before the leftover check | D1 is checked exactly before the signature: one logged rejection for E2; E1 `not-started` and never rejected; E2 on E1's assignment, without a grant, with one `rejected-final` `execution-conflict` operation; no other execution; only E1 in the control plane; the established order; no leftover process; no spawn (`97272c9`, `1868a99`) |
| 2 | Medium | CP10 and CP12 crashed inside `supervision.read()`, before the observation reached the outbox | The armed journal reaches CP10 right after W5s and CP12 right after W5e, whose commits hold the outbox row; the scenarios check the journaled `started` or `exited` state before the restart. Outcomes unchanged |
| 3 | Medium | The durable-outcome check dropped the journal's `state` | The control plane must agree with the journal on the state and `uncertain` evidence of every execution it knows; the journal's other executions must be `not-started` without a grant |
| 4 | Medium | Duplicate delivery asserted a task read before the last copies | The test waits until the last copies are acknowledged and the observations stream is drained and quiet, reads the task again, and checks that its attempts did not change since the result |
| 5 | Medium | The three-second child did not guarantee the phases | The child runs until the test releases it, at most 30 s: after the copies during the execution are acknowledged, after the adopter's `supervisor.2` at CP9, at once where the crash follows its exit, otherwise once the restarted worker is online; a release by the bound fails the scenario |
| 6 | Medium | CP4 and D1 relied on uncontrolled races | At CP4 the worker crashes only once the supervisor's claim is written; in the D1 windows the worker publishes the sealed execution's `not-started` only after the authority answered another execution. Both write the established order to the trace, and the records name it. Outcomes unchanged |
| 7 | Medium | `crashed()` and `stop()` waited without a bound or abort | Every wait is bounded and aborts with the test's signal combined with a deadline 30 s before the runner's timeout; a worker that does not exit in time is killed; cleanup and the `failed` record still run |
| 8 | Medium | A partial start or a failing teardown step leaked resources | Each resource registers its release right after it is acquired; a failed start runs them; teardown runs every release and collects the errors |
| 9 | Low | The D1 description mixed startup recovery with the runtime relaunch | The sequence names the two startup paths with `recoverIntent`, `#reconcile`, and `#sealUnwritten`, and no longer claims an unproven order |
| 10 | Low | W2.before was described as a written W2 | Split: W2.before continues the intent with a new execution; W2.after seals the pending execution and creates a new one |

No window changed its expected outcome. Pass 2 is pending.

## Limitations and remaining gates

- Eleven windows are expected failures on D1 until `fix-launch-recovery-reauthorization` lands (CP5 possibly also until `fix-unclaimed-launch-liveness` lands); their `failed` rows stay in `results.jsonl`.
- The control plane runs in the test process; the scenarios crash the worker and the supervisor only.
- The hold of `not-started` applies to the eleven D1 windows only; `fix-launch-recovery-reauthorization` keeps it so that its rerun meets the same order.
- Remaining gates: review pass 2, integration by the coordinator, the archive, and, in the follow-up changes, the fix of D1 (`fix-launch-recovery-reauthorization`) with a new evidence run and the fix of O1 (`fix-unclaimed-launch-liveness`).
