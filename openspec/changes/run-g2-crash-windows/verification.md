## Scope and source

G2 work item 24, second part (24b), `run-g2-crash-windows`, assigned by the coordinator on 2026-10-26: a crash at each launch window W1 to W6 of the [worker journal contract](../../../docs/contracts/worker-journal.md) and each step CP1 to CP12 of the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md), each followed by a restart and recovery, and duplicate delivery of an offer, run through the harness with recorded results. Excluded: the 24a scenarios (composition happy path, results recorder, disk loss, container `SIGKILL`), the 24c scenarios (partition and reconnect, cancellation races, stale generation and epoch), product code, contracts, and Compose overrides. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the 24a change `run-g2-failure-scenarios-composition` (its recorder, cherry-picked as `d060900`, and its design decision 6, the owner's delegate's decision on "through the harness").

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`, plus `d060900` (24a's recorder, Maki's `3f9777d`). Branch `run-g2-crash-windows`. The evidence run is of `df271e2`.
- Host: macOS 26 (Darwin 25.6.0), x86_64 (2020 Intel iMac); Docker Desktop, engine 29.5.2; Node.js 24.22.1 from `.nvmrc`. Services: `make services-up` (PostgreSQL 18.6, NATS 2.15.1, Toxiproxy) of this worktree; another worktree ran `make verify` on the same host during the runs.

## Author self-check and evidence check

- No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or third-party dependency changes. `apps/control-plane` gains the workspace development dependencies `@taskelith/worker-journal` and `@taskelith/worker-supervisor`; `make dependency-inventory` changed only the lockfile digest and the two workspace edges in `docs/dependencies`.
- `scenario-results.ts` of 24a is used unchanged; no defect was found in it. Its API has no helper that records `failed` and rethrows, so the scenario file does that in `recorded`.
- Every armed point was reached: each scenario asserts the crash trace and, for a worker point, the worker's `SIGKILL` status before the restart. The W points are reached only at the journal's commits, so their crashes also show that the resolution hook reached the journal.
- `npm run check:boundaries`, `npm run verify:comments`, and `npm run verify:dependencies` pass.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-crash-windows --strict` | valid |
| `npm run verify:archive` | passed, with 24a's change archived after this one; archiving 24a first in a copy of `openspec/` also gave strictly valid specs |
| Evidence run: `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows/results.jsonl node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts` against `make services-up`, seed `2776760789` | 27 scenarios: 16 passed, 11 failed on the product defect below; `results.jsonl` holds 27 lines, all target `harness-composition`, arch `x64`, commit `df271e2` |
| `make verify` | not run: the 11 failing scenarios would fail it; blocked on the decision about the defect |
| `make verify-linux-cgroup` | not run: this change adds no test there |

## Windows and results

Seed `2776760789` for every row; macOS natively, so no Linux containment exists.

| Window | How it is reached | Expected (recovery table) | Result |
| --- | --- | --- | --- |
| W1.before, W1.after | Journal hook around the offer's inbox commit | The broker redelivers; one execution exits 0 | passed |
| W2.before, W2.after | Journal hook around the authorization operation | Seal the pending W2 (W6), new execution, exits 0 | passed |
| W3.before, W3.after | Journal hook around the grant | Seal, `not-started`, new execution, exits 0 | **failed**: defect D1 |
| W4.before, W4.after | Journal hook around "record written" | Seal (before) or recovery table (after), new execution, exits 0 | **failed**: D1 |
| W5s.before, W5s.after | Journal hook around the start fact | Adopt the live supervisor, exits 0 | passed |
| W5e.before, W5e.after | Journal hook around the exit fact | Report the recorded exit 0 | passed |
| W6.before, W6.after | First crash at W3.after, then the hook in the recovering worker's seal | Seal, new execution, exits 0 | **failed**: D1 |
| CP1 | Supervision port: `prepare` entry, grant journaled | As W3.after | **failed**: D1 |
| CP2 | Supervision port: `intent` written, no W4 | Seal, new execution, exits 0 | **failed**: D1 |
| CP3 | Supervision port: `start` entry, W4 committed | No launch record: seal, new execution, exits 0 | **failed**: D1 |
| CP4 | Supervision port: the supervisor started | The supervisor runs on; adopt, exits 0 | passed |
| CP5 | Supervisor program: `supervisor.1` written, checks passed | No launch record: seal, new execution, exits 0 | **failed**: D1 |
| CP6 | Supervisor program: after the containment step (none on macOS) | As CP5 | **failed**: D1; the Linux containment part is not applicable here |
| CP7 | Supervisor program: claim written | macOS, no handle: `uncertain`, no spawn | passed |
| CP8 | Supervisor program: child spawned, no handle | macOS, no handle: `uncertain`, one spawn | passed |
| CP9 | Supervisor program: handle written | Adopt the child; once it is gone, `uncertain`, one spawn | passed |
| CP10 | Supervision port: the worker read the handle | Adopt, exits 0 | passed |
| CP11 | Supervisor program: `exit` written | Report the recorded exit 0 | passed |
| CP12 | Supervision port: the worker read the exit | Report the recorded exit 0 | passed |
| Duplicate delivery | The published offer again: 2 copies while the child ran, 3 after the result | One intent, one execution, one spawn, one result | passed |

Not applicable on this host: the Linux containment of CP6 and the Linux rows of the supervisor recovery table. The composed worker on Linux needs a delegated cgroup and an execution account, which only the privileged container of `make verify-linux-cgroup` has, and that container runs with no network for the services; item 15's privileged tests crash the supervisor at CP5 to CP11 with a containment there, and item 25 runs item 24's scenarios on each Linux matrix entry.

## Product defect D1: a relaunch after `not-started` is rejected with `execution-conflict`

- Scenarios: `crash-window-w3-before`, `-w3-after`, `-w4-before`, `-w4-after`, `-w6-before`, `-w6-after`, `-cp1`, `-cp2`, `-cp3`, `-cp5`, `-cp6`; seed `2776760789`; reproduced in three runs, and `crash-window-w3-after` alone with a 240 s wait.
- Expected: the recovery row "W2 without an outcome, or W3 with a grant, and no W4" of journal contract section 5 and the `worker-runtime` scenario "Pending W2 on start": the execution is sealed, reported `not-started`, and the intent launches under a new execution, which exits 0.
- Observed: the sealed execution E1 reaches the control plane as `not-started`, but no second execution exists there. The worker journal holds E2 with one authorization, outcome `rejected-final`, rejection `execution-conflict`; the attempt has no outcome after 240 s.
- Cause: right after W6 the worker requests a new execution, through `continue-launch` (`packages/modules/execution/src/domain/journal-recovery.ts:35`) or `relaunch` (`apps/worker/src/launch-orchestrator.ts:547`), over HTTP, while its `execution.not-started` observation still travels through the outbox and the broker. The authority still sees E1 `authorized` and owning, so its ownership rule rejects E2 with `execution-conflict` (`packages/modules/execution/src/domain/launch-authorization.ts:247`; launch authorization contract section 4). The reason is not retryable (section 9), the worker journals it final (`packages/adapters/worker-journal/src/sqlite-worker-journal.ts:149`), and recovery never continues an intent with a final rejection (`journal-recovery.ts:34`). Nothing ended or reassigned the attempt within 240 s.
- Scope: every recovery that seals an execution the control plane holds as `authorized` and continues the launch. A grant abandoned at runtime (`launch-orchestrator.ts` `#abandon`) may race the same way, although a back-off precedes its new execution; not tested here. W2.after passes because the authority never saw that execution.
- Not fixed here: a fix is product code, and the right side (the worker waiting for the confirmation of `not-started`, the request carrying it, or the authority accepting it) is a contract decision.

## Observation O1: a live worker does not notice a supervisor that died before its claim

With CP5 armed and the worker kept running, the execution stayed `authorized` with no observation for 30 s; only the worker's restart sealed it. `ExecutionWatch.observe` checks the supervisor's liveness only for a claimed launch record (`apps/worker/src/execution-watch.ts:114`). Supervisor identity contract section 6 places recovery at the worker's start, so this is recorded as an observation, not a defect; the scenarios restart the worker after every supervisor crash.

## Independent review

Codex CLI (gpt-6-astra) pending.

## Limitations and remaining gates

- Eleven windows fail on D1; the scenarios keep the contract's expected outcome and are not marked as known failures, since the repository has no such pattern. The coordinator decides how D1 is fixed; after the fix the evidence run is repeated and `results.jsonl` replaced.
- The control plane runs in the test process; the scenarios crash the worker and the supervisor only.
- Remaining gates: the decision and fix of D1, a passing evidence run, `make verify`, the independent review, integration by the coordinator, and the archive.
