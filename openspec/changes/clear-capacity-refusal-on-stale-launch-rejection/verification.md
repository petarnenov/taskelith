# Verification

Date: 2026-10-26. The author verification is recorded below; the independent review is still to come.

## Scope and source

Bug B5, from Zaki's dump of the G2 item 24c scenarios (B3 there), as Niki briefed it. A worker refuses the next generation's offer with `worker-slots-exhausted`. The earlier generation's launch is then rejected with `assignment-not-active`, and that observation is rejected as `stale-ownership-generation` before the capacity refusal is cleared. The refusal stays, and the worker gets no new offer (2 failures in 6 runs). The coordinator decided the open questions of the design pass:

- Q1 (b): every final launch rejection clears its producer's capacity refusal under the fence, at the current or a stale generation.
- Q2: stale-epoch and quarantine evidence still applies nothing (launch authorization section 7).
- Q3 (a): the section 8 "Ended assignments" bullet is not reworded. The worker's gap goes to backlog item `end-assignment-on-not-active`.

An implementation subagent that the worker session briefed and checks developed the change.

- Base revision: `26ff102` on `dev`.
- Scope:
  - capacity reservation contract section 8, the "Refusal" bullet only;
  - `apps/control-plane/src/application/observation-effects.ts` and `observation-service.ts`;
  - control-plane tests;
  - the spec deltas of `observation-consumption` and `launch-reconciliation`.
- Out of scope:
  - the 24c scenario test and its B3 todo;
  - the worker's local end of an assignment on `assignment-not-active`;
  - stale-epoch and quarantine evidence;
  - launch authorization section 9, which stays correct (design D4).

## Evidence

- Revision: `7852684` for the author check (the contract, code, and tests). This file was written after the run.
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1, Docker 29.5.2 with the Compose services of `make verify`.
- Dependencies: no package added.
- Published package: unchanged. Every changed package is a private workspace package, so the commits are `chore`, `test`, and `docs` ([releases](../../../docs/releases.md)).

## Author self-check

- **Contract.** Section 8 "Refusal" now ends the ineligibility at the next capacity declaration or at an observation that frees a slot: an exit, a `not-started`, or a launch rejection. Such an observation clears the refusal even at a stale ownership generation, as evidence that changes no task, attempt, or assignment. One older than the refusal, by its journal sequence, leaves the refusal in place. The rest of the section is untouched.
- **Control plane.**
  - `clearRefusal` clears the producer's refusal under its fence. `recordTerminalFact` and `launchRejection` call it; `launchRejection` calls it after the reporter's assignment is confirmed.
  - `rejectedEffect` returns that clear for a stale `execution.launch.rejected`, `execution.not-started`, or `execution.exited`, and nothing else.
  - `ObservationService.apply` passes it to the transaction that records the rejected observation. The outcome stays `rejected`, and the rejection is still logged.
- **Tests:**
  - `apps/control-plane/test/observation.integration.test.ts`, "capacity refusal after a slot-freeing observation":
    - "a stale launch rejection clears the refusal and changes nothing else". The task is unchanged, confirmations run 1 to 5, and the next pass places the attempt.
    - "a stale launch rejection older than the refusal keeps it".
    - "a stale not-started clears the refusal too".
    - "a stale acceptance keeps the refusal".
    - "a launch rejection at the current generation clears the refusal".
  - `apps/control-plane/test/observation-service.test.ts`: "a rejected ... clears/keeps the capacity refusal", for a stale launch rejection and a stale exit (clear), and for a stale acceptance and a launch rejection refused for another reason (keep). The first transaction is refused, as a rolled-back store would refuse it, and the recording transaction runs in memory.
- **Fail on the base code:** `observation-effects.ts` and `observation-service.ts` were replaced by their `26ff102` versions and rebuilt. The two test files were then run against the integration services: 75 tests, 70 passed, 5 failed. The failures:
  - the two unit cases that expect a clear;
  - "a stale launch rejection clears the refusal and changes nothing else";
  - "a stale not-started clears the refusal too";
  - "a launch rejection at the current generation clears the refusal".

  The fence and keep cases pass on both revisions. With the change: 75 of 75.
- **Comment rule:** `npm run verify:comments` passes within `make verify`.
- **Evidence check:** the change adds only repository-relative links, and each resolves.
- **OpenSpec:** `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict` passes. The modified requirement bodies are 424, 453, 438, and 394 characters.

## Checks and results

- `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict`: `Change 'clear-capacity-refusal-on-stale-launch-rejection' is valid`.
- `make verify` at `7852684`: passed (exit 0). 1913 tests, 1911 passed, 0 failed, and 2 Linux-only tests skipped on macOS. Coverage: 99.29% lines, 92.08% branches, 99.04% functions. The other checks also passed:
  - `Contract documents have no undeclared breaking change.`
  - OpenSpec `Totals: 70 passed, 0 failed`
  - `Every active OpenSpec change archives into strictly valid specs.`
  - `Packed file allowlist and installed CLI verification passed.`

## Review

Left for the session: reviewer Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox.

## Limitations and remaining gates

- A clear can cost one refused offer when the worker has not yet processed the assignment's end or is still full (design D3).
- The worker does not end an assignment locally on `assignment-not-active`, although section 8 says it does. This is backlog item `end-assignment-on-not-active`, out of scope.
- The 24c B3 todo is not part of this change; it becomes a regular test once this lands.
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
