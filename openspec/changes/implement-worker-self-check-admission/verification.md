# Verification

Date: 2026-10-28. The author's verification and checks, and review pass 1 with its fixes, are recorded below.

## Scope and source

[G3 work plan](/docs/g3-plan.md) item 27, `implement-worker-self-check-admission`, size M-L. The coordinator, Niki, assigned it in two phases: phase 1 (research and design) and phase 2 (implementation), with the owner decisions that the owner's delegate (away run `20261027T221456Z-claude-88683`) took on 2026-10-28 and their binding conditions (`design.md`, Owner decisions). It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/implement-worker-self-check-admission` on branch `implement-worker-self-check-admission`.

- **Scope:** the new worker admission contract and the contract edits of `proposal.md`, Impact; the AsyncAPI observation and refusal reason; the Fleet port, decision, store port, view, and in-memory adapters; the Scheduling eligibility and supersession; the PostgreSQL migration and adapters; the control-plane observation effect and journal incarnation reset; the worker self-check step, the `linux-containment` adapter, and the offer refusal; the four spec deltas.
- **Out of scope:** an HTTP operation or event for the view (item 9), the workers screen (item 33), an operator override and a history of reports (later possibilities for the owner), a macOS check, periodic checks.

## Revision

- **Base revision:** `46e21ef1` (`origin/dev`).
- **Revision verified:** the working tree that the commits of this change hold, before the records commit; the records commit adds only this file's results. The `make verify` run of Checks and results covers `fb19fa39`, the head that review pass 1 reviewed.
- **Revision after review pass 1:** the records commit of pass 1 (`docs: record review pass 1 for implement-worker-self-check-admission`) on top of the fixes `7cd60cd5`, `53ac3f6b`, `760ef9d8`, `2fd62e43`, and `70745c83`; section Review pass 1 records its checks. No `make verify` has run on it yet.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm, Docker server 29.5.2 for the integration services of `make test` (PostgreSQL, NATS, Toxiproxy through `scripts/services.sh`) and the oasdiff container of `make contract-compatibility`.

## Author self-check

- **Contract first.** `docs/contracts/worker-admission.md` (new), `supervisor-identity.md` section 8 (owner decision 2), `execution-wire-contracts.md` section 5, `capacity-reservation.md` sections 8 and 11, `product-ports.md` section 8, and `installation-and-enrollment.md` section 5 agree with the code and the spec deltas.
- **Not-applicable only from local facts at the start.** `notApplicableReason` (`packages/modules/fleet/src/domain/worker-admission.ts:42`) is the one place that derives it, from the platform and the launch command; `runSelfCheck` (`apps/worker/src/self-check.ts:28`) uses it (`:43`), does not run a check found not applicable, and maps every run outcome other than `passed` (`:47`) to `failed`; the port's `SelfCheckRun` cannot express `not-applicable`.
- **The control plane refutes an unrecognised not-applicable.** `decideWorkerAdmission` (`worker-admission.ts:55`) turns a `not-applicable` result into `failed` (`:77`) unless `isRecognized` (`:80`) accepts exactly one reason that agrees with the enrolled platform and the check's scope, and fails a missing required check. The effect applies it with the enrolled platform (`apps/control-plane/src/application/observation-effects.ts:166`).
- **Running executions keep ownership and reservation.** The effect changes only the worker admission; it ends no assignment and revokes no grant. Being due and being allowed are separate: `isSupersessionDue` (`packages/modules/scheduling/src/domain/supersession.ts:21`) makes every assignment of a worker that is not admitted due at once, and `supersedeAssignment` (`packages/modules/scheduling/src/domain/assignment.ts:161`) refuses one under which an execution was granted, so a running execution ends only through its terminal fact.
- **Offer refusal.** `CommandIntake` refuses first with `worker-self-check-failed` (`apps/worker/src/command-intake.ts:117`), and the start omits the launch authority when the self-check failed (`apps/worker/src/worker-start.ts:249`).
- **Hexagonal boundaries.** Execution holds the journaled `SelfCheckResult` because it cannot import Fleet; Fleet owns the port, the decision, and the store port; Scheduling keeps a boolean `admitted`; PostgreSQL implements `WorkerAdmissions` as `workerAdmissions`, because `admissions` already names task admissions. `npm run check:boundaries` passes within `make verify`.
- **Requirement length.** Every added or modified requirement body is under 500 characters.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Published packages.** Only the root package `taskelith` is published; this change touches no file it ships, so the commit types are `chore`, `test`, and `docs`.

## Checks and results

- `npm run openspec -- validate implement-worker-self-check-admission --strict`: valid.
- `npm run verify:comments`: every comment is within the comment length rule.
- `npx tsc -p tsconfig.check.json`: no error.
- `make verify` at base `46e21ef1` plus this working tree, log `wsca-verify-1.log` in the session scratchpad: exit 0.
  - `npm test` (with the integration services): 2373 tests, 2370 pass, 0 fail, 0 cancelled, 3 skipped.
  - Coverage, all files: 99.35% lines, 92.26% branches, 99.02% functions; the 75% thresholds hold. New files: `self-check.js` 100/96.15/100, `worker-admission.js` 100/97.14/100, `in-memory-worker-admissions.js` 100/84.00/100, `worker-admission-conformance.js` 100/87.50/100, `worker-admission-repositories.js` 100/93.10/100.
  - `make contract-compatibility`: `execution.asyncapi.json` has 112 breaking changes against `46e21ef1`, declared by its `info.version` 0.7.0 (0.x minor); the other documents have none. "Contract documents have no undeclared breaking change."
  - `verify:dependencies`, `openspec validate --all --strict`, and `verify:package` pass; no dependency or inventory change was needed.
- Separate runs before `make verify`: the PostgreSQL and control-plane integration suites with `scripts/services.sh run taskelith-wsca-int`, after adding `worker_self_check_results` to each test truncation list and admitting the workers that those tests enroll directly.

## Fail-before evidence

With the new tests and six production lines reverted, after `npm run build`, against the services of `bash scripts/services.sh run taskelith-wsca-int`: `node --experimental-strip-types --test` over `packages/modules/fleet/test/worker-admission.test.ts`, `packages/modules/scheduling/test/*.test.ts`, `apps/worker/test/command-intake.test.ts`, `apps/worker/test/worker-start.test.ts`, `apps/control-plane/test/observation-service.test.ts`, and the PostgreSQL capacity and fleet conformance suites: 319 tests, 304 pass, 15 fail. The reverted lines were the `admitted` term of `isEligibleForPlacement` and of `ELIGIBLE`, the `!worker.admitted` term of `isSupersessionDue`, the refusal in `CommandIntake`, the `recordSelfCheck` call in `startRuntime`, and the not-applicable refutation of `decideWorkerAdmission` (reverted there as `outcome !== 'failed'`). Failing:

- Control plane: `a failed self-check makes the worker ineligible, and a later passing report admits it again`; `a new journal incarnation awaits its own self-check before placement`; `the control plane admits a macOS worker without the check, and refutes a Linux worker's claim`.
- Worker: `after a failed self-check every offer is refused, before any limit or pressure, and none is journaled to launch`; `each start reports its self-check once, after its capacity and pressure`; `a Linux worker without a launch command and a macOS worker never run the containment check`; `a launching Linux worker runs the check before it connects, and a pass is reported`; `a failed self-check still starts the worker, reports the failure, and never authorizes a launch`.
- Scheduling and Fleet: `in-memory workers: workers read back as stored, and only eligible ones count their slots`; `PostgreSQL workers: workers read back as stored, and only eligible ones count their slots`; `supersession is due for a gone worker at once and otherwise after its bounds`; `in-memory worker admissions: a report above the fence decides and replaces the results; one at or below it changes nothing` and its PostgreSQL run; `a report without a failed result admits the worker, and one with a failed result does not`; `a not-applicable claim without a recognised reason counts as failed`.

The broad revert of `decideWorkerAdmission` also failed results that were already failed; a narrower revert (the refutation alone returning the result unchanged) failed `a not-applicable claim without a recognised reason counts as failed` and `the control plane admits a macOS worker without the check, and refutes a Linux worker's claim`. After the restore and a full rebuild, every test passes (below). `a running execution keeps its assignment through a failed self-check and ends normally` and `an offer refused after a failed self-check releases its assignment for another worker` guard behavior that no reverted line changes; they pass before and after.

## Review pass 1

- **Reviewer:** role A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, session `01a17f9a-13d0-7710-b277-84350ffd49c4`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt>`; the stderr header names `model: gpt-6.1-sol`.
- **Reviewed head:** `fb19fa39`. The snapshot (SHA-256 manifest of `git ls-files -co --exclude-standard`, 2563 files) was the same before and after the pass, and the reviewer reported the same digest, `df89f5fa...8870`.
- **Counts:** 0 critical, 0 high, 5 medium, 3 low; all fixed, recorded in `findings.jsonl` and `passes.jsonl`.

| Finding | Resolution |
| --- | --- |
| M1: a report naming one check twice reached persistence; PostgreSQL refused it on the primary key, the in-memory store accepted it, and a report with a failed result could leave an earlier `admitted` | `onePerCheck` (`packages/modules/fleet/src/domain/worker-admission.ts:65`) stores a repeated check once as `failed`, so no repeat reaches a store and such a report never admits (`7cd60cd5`). The AsyncAPI description, worker admission contract section 4a, the wire contract, and the scenario Check reported twice state it (`70745c83`). Tests: the decision, the shared conformance case for both stores, the observation service, and the NATS reader (`2fd62e43`). |
| M2: checks after the eighth were dropped without a signal | `checkComposition` (`apps/worker/src/self-check.ts:15`) refuses more than 8 checks or a repeated or malformed id; `startWorker` calls it before enrollment (`apps/worker/src/worker-start.ts:102`), and `runSelfCheck` returns the failure (`53ac3f6b`). The truncation test is replaced (`2fd62e43`); the spec adds scenario Too many checks. |
| M3: the running-execution test had no execution before the failed report | The test authorizes and starts an execution first, then asserts kept ownership, a held reservation, a `granted` grant, the `started` state, no cancellation or assignment end, a supersession refused with `precondition-failed`, and a normal exit (`2fd62e43`). |
| M4: the scenario stored an unrecognised reason as `failed`, but the schema refuses that report | Scenario Malformed reason: the report is quarantined unapplied and the admission is unchanged; a valid reason the enrolled platform refutes is stored as `failed`. Contract section 4a, the wire contract, and design D3a agree (`70745c83`); a NATS reader test covers the refusal (`2fd62e43`). |
| M5: the conformance suite had no `unavailable` case for the view | The fixture gains `breakWorker`, a shared case requires `unavailable` with no partial data, and the PostgreSQL view maps an unreadable enrollment record to `unavailable` (`packages/adapters/postgres/src/worker-admission-repositories.ts:101`) (`760ef9d8`). |
| L1: the requirement ran the checks after the capacity declaration | The requirement now runs them before the broker session and journals the report after the capacity declaration and the pressure report, as D2 and `startRuntime` do (`70745c83`). |
| L2: the wire contract table gave AsyncAPI 0.6.0 | It gives 0.7.0 (`70745c83`). |
| L3: the record cited the due check as the grant protection | The author self-check now separates due from allowed and cites `supersedeAssignment` (this records commit). |

- **The 112 breaking changes (risk, design "Wire version").** The reviewer found them explained: the compatibility checker counts unclassified changes as breaking, the raw diff holds only the expected additions and their descriptions, no command shape changed, and protocol version 1 is fine.
- **Checks after the fixes,** without Docker under the coordinator's rule of one Docker run at a time on this iMac:
  - `npm run build`, `npx tsc -p tsconfig.check.json`, and `npm run check:boundaries`: pass.
  - Every test file outside `*.integration.test.ts` (`test/`, `packages/*/test/`, `packages/*/*/test/`, `apps/*/test/`) with `node --experimental-strip-types --test`: 1925 tests, 1922 pass, 0 fail, 0 cancelled, 3 skipped.
  - `npm run openspec -- validate implement-worker-self-check-admission --strict`: valid; `npm run verify:comments`, `npm run verify:links`, and `make findings ARGS="validate"`: pass.
- **Changed and not run:** `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`, which runs the two new conformance cases against PostgreSQL (including the `breakWorker` fixture), needs the services; the coordinator's `make verify` covers it, together with coverage and `make contract-compatibility` for the changed AsyncAPI description.

## Sequence deviation

The Docker runs of phase 2 ran without the coordinator's Docker slot, which the coordinator later required for this iMac: several integration runs through `scripts/services.sh run taskelith-wsca-int`, the fail-before run, and one `make verify` (log `wsca-verify-1.log`). No harm resulted: each run used its own Compose project, removed its containers, and pruned no volume; the last integration run and `make verify` passed, and the fail-before run failed only the tests it was meant to. After pass 1, no command that starts containers ran.

## Limitations

- `make verify-installation` and `make verify-linux-cgroup` did not run: the real `linux-containment` check runs only in the Linux worker image with a delegated cgroup, so its pass in production is not shown here (task 5.6).
- The fail-before run reverted lines in a working tree, not at a commit; the reverted sources were restored and rebuilt before the checks above.
- `make verify` starts Docker containers for the integration services, which the phase 2 brief's "no Docker" rule did not foresee; see Sequence deviation.
- The fixes of review pass 1 have no `make verify` run yet; the PostgreSQL conformance cases they add are untested against PostgreSQL until the coordinator's run.

## Remaining gates

- `make verify-installation` and `make verify-linux-cgroup` with Docker, by the developing worker (Desi) before the handoff (task 5.6), and again by the coordinator at integration.
- `make verify` on the head after review pass 1, by the coordinator in its Docker slot.
- Independent review passes 2 and 3 under the [independent review process](/docs/governance.md#independent-review-process), recorded in `passes.jsonl` and `findings.jsonl` (task 5.5).
- Archive, handoff, and integration into dev by the coordinator (single pull request) (task 5.7).
