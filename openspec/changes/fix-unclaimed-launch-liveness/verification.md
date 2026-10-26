# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review is pending.

## Scope and source

Defect O1, found by the crash-window scenario of G2 item 24b: a supervisor that dies at CP5 while the worker keeps running leaves the execution `authorized` with no observation until the worker restarts, because `ExecutionWatch.observe` checked liveness only for a claimed record. The owner's delegate decided in away run `20261026T161148Z-opencode-90873` that it is a defect, fixed in G2 with a bounded liveness check of a record that is authorized but not claimed. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `f1a535e` on `dev`.
- Scope: the bounded check in `apps/worker/src/execution-watch.ts`, its tests, and the `worker-runtime` "Supervisor liveness" requirement, with the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) sections 4 to 6.
- Out of scope: launch authorization and relaunch reauthorization (D1 of 24b, another change); the crash-window tests of 24b; any contract change.

### Values used

- `LIVENESS_POLLS` (10) and `WATCH_POLL_MILLISECONDS` (`1s`): unchanged, `execution-watch.ts`.
- The worker deadline, at most `ttl` minus `skew` (`25s` with `30s` and `5s`): launch authorization contract section 7, operational targets "Launch authorization validity window", `workerLaunchDeadline`.
- The bound `UNCLAIMED_LIVENESS_POLLS = 3 * LIVENESS_POLLS` (30): design D1.

## Evidence

- Revision: `78ee06c` for the author check (code `07800c6`; verification.md written after the run).
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: no change to `docs/contracts`, `docs/operational-targets.md`, `execution.asyncapi.json`, or the OpenAPI document; journal format unchanged. The supervisor identity contract states no claim-only liveness rule, and its recovery table already seals a record without a launch record (design D3).

## Author self-check

- **Check:** `livenessDue(launch, polls)` replaces the claim-only condition in `observe`: a claim every tenth poll as before, a missing launch record on the thirtieth poll and every tenth after it; a seal is decided by `#commitFacts` first.
- **Outcomes:** reused unchanged through `#checkLiveness` and `#commitFacts`: a seal won by the recovery table is read back and committed as `not-started`, after which the orchestrator launches the intent again; `observe` and `retry` keep the watch with the existing rounds; `uncertain` is reported once.
- **Tests** (`apps/worker/test/launch-orchestrator.test.ts`):
  - "an unclaimed launch record is not checked for liveness before the bound": 29 unclaimed reads, then a claimed spawn and exit; no recovery call, the execution `exited`. It also excludes a check at the tenth and twentieth polls.
  - "a supervisor lost before its claim is sealed after the bound, and the intent is launched again": the record stays unclaimed; one recovery in round `first` on the thirtieth read, the seal read on the thirty-first, then `not-started` and a second execution that exits. A read bound aborts the worker after 40 reads, so the test ends on code that never decides.
  - "a supervisor still live at the unclaimed check keeps the watch going": the recovery table answers `observe` on the thirtieth read; the watch continues, and the outbox holds `execution-started` and `execution-exited` only.
- **Fail on the base code:** with `execution-watch.ts` of `f1a535e` plus only the exported constant (so the tests compile), rebuilt, `node --experimental-strip-types --test apps/worker/test/launch-orchestrator.test.ts` gave 40 passed, 2 failed: the lost-supervisor and live-supervisor tests failed on `rounds` (`[]` instead of `['first']`); the bound test passed, as expected. With the change: 42 passed, 0 failed.
- **Existing tests:** the claimed-record liveness tests in `start-reconciliation.test.ts` and every other worker test pass unchanged.
- **Comment rule:** `npm run verify:comments` passes.
- **Evidence check:** the change adds only repository-relative links, to `docs/contracts/supervisor-identity.md` and `docs/operational-targets.md`, and no external link; each resolves.
- **OpenSpec:** `npm run openspec -- validate fix-unclaimed-launch-liveness --strict` passes; the modified requirement body is 324 characters.

## Checks and results

- `npm run openspec -- validate fix-unclaimed-launch-liveness --strict`: `Change 'fix-unclaimed-launch-liveness' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` at `78ee06c`, first run: failed (exit 2) on one control-plane integration test, "a worker journals its commands before it acknowledges them and publishes its observations" (`the control plane did not answer`, cause `TypeError`), outside the changed code; 1754 tests, 1751 passed.
- `make verify` at `78ee06c`, second run: passed (exit 0); 1754 tests, 1752 passed, 0 failed, 2 Linux-only tests skipped on macOS; coverage 99.26% lines, 91.90% branches, 98.88% functions (`execution-watch.js` 99.46%, 94.44%, 100%); `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review

Pending: the independent review by OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, has not run yet.

## Limitations and remaining gates

- The bound counts polls, not time; with a shorter poll interval or a longer installation `ttl` the check can come before the deadline, which stays safe but may seal a slow live launch (design, Risks).
- The fix is shown with fake supervisions; the 24b crash-window test with a real supervisor is out of scope.
- The control-plane integration test that failed once was not investigated; it passed on the rerun.
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
