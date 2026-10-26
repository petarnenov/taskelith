# Verification

Date: 2026-10-26. Author verification is recorded below; review pass 1 is recorded, and pass 2 is pending.

## Scope and source

Defect O1, found by the crash-window scenario of G2 item 24b: a supervisor that dies at CP5 while the worker keeps running leaves the execution `authorized` with no observation until the worker restarts, because `ExecutionWatch.observe` checked liveness only for a claimed record. The owner's delegate decided in away run `20261026T161148Z-opencode-90873` that it is a defect, fixed in G2 with a bounded liveness check of a record that is authorized but not claimed. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `f1a535e` on `dev`.
- Scope: the deadline-bounded check in `apps/worker/src/execution-watch.ts`, the deadline the launch orchestrator passes to it, its tests, and the `worker-runtime` "Supervisor liveness" requirement, with the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) sections 4 to 6.
- Out of scope: launch authorization and relaunch reauthorization (D1 of 24b, another change); the crash-window tests of 24b; any contract change.

### Values used

- `LIVENESS_POLLS` (10) and `WATCH_POLL_MILLISECONDS` (`1s`): unchanged, `execution-watch.ts`.
- The worker deadline, at most `ttl` minus `skew` (`25s` with `30s` and `5s`): launch authorization contract section 7, operational targets "Launch authorization validity window", `workerLaunchDeadline`.
- The bound: the launch's own spawn deadline from its `LaunchPlan`, read on the `DeadlineClock` (design D1, since review pass 1).

## Evidence

- Revision: `926689e` for the author check after review pass 1 (code `aa0c080`; verification.md updated after the run). The first author check was at `78ee06c` (code `07800c6`), with the thirty-poll bound that pass 1 replaced.
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: no change to `docs/contracts`, `docs/operational-targets.md`, `execution.asyncapi.json`, or the OpenAPI document; journal format unchanged. The supervisor identity contract states no claim-only liveness rule, and its recovery table already seals a record without a launch record (design D3).

## Author self-check

- **Check:** `#livenessDue(target, launch, polls)` replaces the claim-only condition in `observe`: a claim every tenth poll as before; a missing launch record on a tenth poll only when `#pastDeadline` finds the target's `spawnDeadline` not proven ahead (same boot, readable clock, below its milliseconds), the orchestrator's `#beforeDeadline` rule turned around; a target without a deadline (a reconciled record) is never checked unclaimed. A seal is decided by `#commitFacts` first. `UNCLAIMED_LIVENESS_POLLS` and its export are gone.
- **Deadline plumbing:** `LaunchOrchestrator.#supervise` passes the deadline it put in the `LaunchPlan` to `#target`, which sets `WatchTarget.spawnDeadline`; `WatchOptions.clock` is the orchestrator's `DeadlineClock`, already in its options.
- **Outcomes:** reused unchanged through `#checkLiveness` and `#commitFacts`: a seal won by the recovery table is read back and committed as `not-started`, after which the orchestrator launches the intent again; `observe` and `retry` keep the watch with the existing rounds; `uncertain` is reported once.
- **Tests** (`apps/worker/test/launch-orchestrator.test.ts`, poll interval `100ms`, the fake clock advanced by each sleep, deadline `26000` on it):
  - "a live unclaimed launch is not checked for liveness before its spawn deadline": 100 unclaimed reads (about `10s`, far past thirty polls, well before the deadline), then a claimed spawn and exit; no recovery call, the execution `exited`.
  - "a supervisor lost before its claim is sealed past the deadline, and the intent is launched again": the record stays unclaimed; exactly one recovery, in round `first`, at a clock reading at or past the deadline and less than one liveness interval after it; the seal is read back, then `not-started` and a second execution that exits. A bound of 400 reads aborts the worker, so the test ends on code that never decides.
  - "a supervisor still live at the unclaimed check keeps the watch going": the record stays unclaimed until the recovery table answers `observe`, then the spawn and exit appear; the outbox holds `execution-started` and `execution-exited` only.
- **Fail on earlier code:** `execution-watch.ts`, `index.ts`, and `launch-orchestrator.ts` replaced by each earlier revision's files, rebuilt, then `node --experimental-strip-types --test apps/worker/test/launch-orchestrator.test.ts`:
  - At `f1a535e` (base): 40 passed, 2 failed; the lost-supervisor and live-supervisor tests failed on `rounds` (`[]` instead of `['first']`); the deadline test passed, as the base never checks an unclaimed record.
  - At `5d6f0bb` (the thirty-poll bound that pass 1 reviewed): 40 passed, 2 failed; the deadline test failed with 8 recovery calls instead of 0, and the lost-supervisor test failed on its range assertion, because its recovery came before the deadline.
  - With the change: 42 passed, 0 failed.
- **Existing tests:** the claimed-record liveness tests in `start-reconciliation.test.ts` and every other worker test pass unchanged.
- **Comment rule:** `npm run verify:comments` passes.
- **Evidence check:** the change adds only repository-relative links, to `docs/contracts/supervisor-identity.md`, `docs/operational-targets.md`, and the `#reviewer-invocations` heading of `docs/agent-task-protocol.md`, and no external link; each resolves.
- **OpenSpec:** `npm run openspec -- validate fix-unclaimed-launch-liveness --strict` passes; the modified requirement body is 350 characters.

## Checks and results

- `npm run openspec -- validate fix-unclaimed-launch-liveness --strict`: `Change 'fix-unclaimed-launch-liveness' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` at `78ee06c` (before review), first run: failed (exit 2) on one control-plane integration test, "a worker journals its commands before it acknowledges them and publishes its observations" (`the control plane did not answer`, cause `TypeError`), outside the changed code; 1754 tests, 1751 passed. Second run: passed (exit 0); 1752 passed, 0 failed, 2 skipped.
- `make verify` at `926689e` (after the pass 1 fixes): passed (exit 0); 1754 tests, 1752 passed, 0 failed, 2 Linux-only tests skipped on macOS; coverage 99.27% lines, 91.91% branches, 98.88% functions (`execution-watch.js` 99.47%, 93.64%, 100%); `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review pass 1

OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, read-only `reviewer` agent, session `ses_e86d77087ffeInxK2Aws1FJK2a`, run by the worker session from the worktree with the invocation of the [agent task protocol](../../../docs/agent-task-protocol.md#reviewer-invocations), with the prompt and the log kept outside the worktree. The OpenCode database records the model and the variant `high`. Revision reviewed: `5d6f0bb`. The snapshots before and after the pass matched (`b08a1ce45d67260c5d3137af502acfe6878e26ee2fa56a382d6995482ebf50b0`). Findings: 0 Critical, 0 High, 1 Medium, 1 Low.

- **Medium (fixed in `aa0c080` and `926689e`):** the thirty-poll bound did not guarantee that the launch deadline had passed: the poll interval is configurable (the tests used `100ms`, so poll 30 came about `3s` in), thirty polls are twenty-nine sleeps, and the "No launch record" row seals regardless of liveness, so an early check could seal a live slow launch. Resolution: the check is gated on the launch's own spawn deadline on the deadline clock (design D1 rewritten; the previously rejected alternative now wins), `UNCLAIMED_LIVENESS_POLLS` and its export are removed, and a regression test at the `100ms` poll shows that no check happens before the deadline and that one happens past it.
- **Low (fixed in `926689e`):** the scenario "Unclaimed record within the bound" forbade any recovery call, although a claim arriving earlier is checked by the claimed-record rule. Resolution: it is now "Unclaimed record before the deadline" and says only that no liveness check of the unclaimed record happens before the deadline.

## Review pass 2

Pending: pass 2 by the same reviewer (OpenCode CLI, `opencode-go/kimi-k3.1-pro`, variant `high`) on the fixes above.

## Limitations and remaining gates

- An unreadable deadline clock counts as a passed deadline, so a slow live supervisor could then be sealed; it would seal itself on the same clock (design, Risks).
- The fix is shown with fake supervisions; the 24b crash-window test with a real supervisor is out of scope.
- The control-plane integration test that failed once was not investigated; it passed on the rerun.
- Remaining gates: review pass 2, the coordinator's integration into `dev`, and the archive of this change.
