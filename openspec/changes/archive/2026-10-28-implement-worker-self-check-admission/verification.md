# Verification

Date: 2026-10-28. The author's verification and checks, review passes 1 to 3 with their fixes, and the unreviewed fix after pass 3 are recorded below.

## Scope and source

[G3 work plan](/docs/g3-plan.md) item 27, `implement-worker-self-check-admission`, size M-L. The coordinator, Niki, assigned it in two phases: phase 1 (research and design) and phase 2 (implementation), with the owner decisions that the owner's delegate (away run `20261027T221456Z-claude-88683`) took on 2026-10-28 and their binding conditions (`design.md`, Owner decisions). It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/implement-worker-self-check-admission` on branch `implement-worker-self-check-admission`.

- **Scope:** the new worker admission contract and the contract edits of `proposal.md`, Impact; the AsyncAPI observation and refusal reason; the Fleet port, decision, store port, view, and in-memory adapters; the Scheduling eligibility and supersession; the PostgreSQL migration and adapters; the control-plane observation effect and journal incarnation reset; the worker self-check step, the `linux-containment` adapter, and the offer refusal; the four spec deltas.
- **Out of scope:** an HTTP operation or event for the view (item 9), the workers screen (item 33), an operator override and a history of reports (later possibilities for the owner), a macOS check, periodic checks.

## Revision

- **Base revision:** `46e21ef1` (`origin/dev`).
- **Revision verified:** the working tree that the commits of this change hold, before the records commit; the records commit adds only this file's results. The `make verify` run of Checks and results covers `fb19fa39`, the head that review pass 1 reviewed.
- **Revision after review pass 1:** the records commit of pass 1 (`docs: record review pass 1 for implement-worker-self-check-admission`) on top of the fixes `7cd60cd5`, `53ac3f6b`, `760ef9d8`, `2fd62e43`, and `70745c83`; section Review pass 1 records its checks. The coordinator's worker, Desi, ran `make verify` on `9c849c02` in the coordinator's Docker slot: exit 0 (section Review pass 2).
- **Revision after review pass 2:** the records commit of pass 2 (`docs: record review pass 2 for implement-worker-self-check-admission`) on top of the fixes `f779be36`, `4fb14625`, `015387eb`, `34fac2d6`, and `0feead08`; section Review pass 2 records its checks. The coordinator's `make verify` on `7f73475f` failed one stale test fixture (section Review pass 3).
- **Revision after review pass 3:** the records commit of pass 3 (`docs: record review pass 3 for implement-worker-self-check-admission`) on top of `f8f1b828`, `ed8b3333`, `d971bc73`, and `2fff3ad8`; sections Review pass 3 and Unreviewed fix record its checks. No `make verify` has run on it yet.

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

The broad revert of `decideWorkerAdmission` also failed results that were already failed; a narrower revert (the refutation alone returning the result unchanged) failed `a not-applicable claim without a recognised reason counts as failed` and `the control plane admits a macOS worker without the check, and refutes a Linux worker's claim`. After the restore and a full rebuild, every test passes (below). `a running execution keeps its ownership, reservation, and grant through a failed self-check and ends normally` (named `a running execution keeps its assignment through a failed self-check and ends normally` until `2fd62e43`) and `an offer refused after a failed self-check releases its assignment for another worker` guard behavior that no reverted line changes; they pass before and after.

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

## Review pass 2

- **Reviewer:** role B, Claude Code, model `claude-opus-5-5`, effort `high`, session `a4f863a0-4df0-4cbe-ad71-9b5fec921c7d`, invoked as `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > log.jsonl`, with the result taken by `grep '"type":"result"' | tail -1`; its `modelUsage` lists only `claude-opus-5-5`.
- **Reviewed head:** `9c849c02`; the snapshot (SHA-256 manifest) was the same before and after.
- **Pass 1 fixes:** the reviewer confirmed all eight.
- **Counts:** 0 critical, 0 high, 2 medium, 7 low; all fixed, recorded in `findings.jsonl` and `passes.jsonl`. The coordinator decided the fixes of M1 and M2.
- **`make verify` on `9c849c02`** (Desi, in the coordinator's Docker slot): exit 0; 2382 tests, 2379 pass, 0 fail, 3 skipped; coverage 99.35% lines, 92.31% branches, 99.02% functions; `make contract-compatibility`: 112 declared breaking changes in `execution.asyncapi.json`, none in the other documents. It ran the PostgreSQL conformance cases of review pass 1.

| Finding | Resolution |
| --- | --- |
| M1: the launch authority ignored worker admission, so a worker that is not admitted still got new grants | `checkWorkerAdmission` (`apps/control-plane/src/application/launch-authority.ts:171`) runs in `#decide` after the installation and worker checks (`:71`) and refuses a new operation of a worker that is not admitted with the existing non-retryable `worker-not-authorized`; the worker journals it as a final rejection and the control plane releases the assignment (`RELEASING_REJECTIONS`). Replays are not gated (`f779be36`). No wire change and no new reason. Contract sections 4a (trust model) and 7, launch authorization section 9, and the requirement New grants only for admitted workers state it (`0feead08`). |
| M2: an accepted assignment without a grant on a `self-check-failed` worker was never freed | `selfCheckReport` frees each unfinished assignment of the worker without a grant through `freeIdleAssignment` (`apps/control-plane/src/application/observation-effects.ts:176`) and keeps the granted ones (`4fb14625`); D6, contract section 7, and the resource-admission scenario say "due at once" and "freed" (`0feead08`). |
| L1: D7 misstated the wire compatibility argument | D7 now speaks of an older build that sends no report; wire contract section 3 adds that such a worker is never admitted (`0feead08`). |
| L2: the deferred-resume log said `no launch command` also after a failed self-check | `#deferResume` logs `no launch authority`, and its comment names both causes (`apps/worker/src/launch-orchestrator.ts:223`) (`015387eb`). |
| L3: no migration test for existing rows | A held-migration test inserts a worker before the migration and asserts `awaiting-self-check`, fence 0, no report time, and not eligible (`packages/adapters/postgres/test/migrations.integration.test.ts`) (`34fac2d6`); not run here. |
| L4: the journal adapter's new fact had no spec delta | `specs/worker-journal-adapter/spec.md` adds Self-check report facts with scenario Two reports, covered by the existing journal test; the proposal lists the capability (`0feead08`). |
| L5: "before enrollment" for an enrolled worker | The requirement and scenario say "before it enrolls or opens its journal" (`0feead08`). |
| L6: a stale test name in this record | The fail-before section gives the current name (this records commit). |
| L7: the passing `make verify` was not recorded | Recorded above; the limitation and gate now concern only the head after pass 2 (this records commit). |

- **Fails before the fixes.** With the new tests and the M1 and M2 production lines reverted, after `npm run build`: `apps/control-plane/test/observation-service.test.ts`, 25 tests, 23 pass, 2 fail: `only an admitted worker gets a new launch grant, and a recorded grant is still replayed` and `a failed self-check frees an accepted assignment that holds no grant`. After the restore and a rebuild both pass.
- **Checks after the fixes,** without Docker:
  - `npm run build`, `npx tsc -p tsconfig.check.json`, and `npm run check:boundaries`: pass.
  - Every test file outside `*.integration.test.ts`: 1927 tests, 1924 pass, 0 fail, 0 cancelled, 3 skipped.
  - `npm run openspec -- validate implement-worker-self-check-admission --strict`: valid; `npm run verify:comments`, `npm run verify:links`, and `make findings ARGS="validate"`: pass.
- **Changed and not run:** `packages/adapters/postgres/test/migrations.integration.test.ts` (the new test for existing rows) and `apps/control-plane/test/launch-authority.integration.test.ts` (worker-2 is admitted first, so its replay still meets `assignment-not-active` after the new admission check).

## Review pass 3

- **Reviewer:** role A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, session `01a17fbe-3529-7a42-8a2c-0925ba6d3324`, invoked as in pass 1; the stderr header names `model: gpt-6.1-sol`.
- **Reviewed head:** `7f73475f`; the snapshot was the same before and after, and the reviewer reported the same digest, `854e920a...9c82`. The reviewer ran no build or test.
- **Pass 2 fixes:** M1 and L1 to L7 confirmed. M1 agrees with owner decision 3: the gate changes no running execution and no recorded grant, and a refused operation ends without a retry while `freeIdleAssignment` keeps an attempt under which an execution may run. The reviewer found no race between the M1 gate and the M2 freeing: both run in `SERIALIZABLE` transactions, so an interleaving that conflicts fails to serialize instead of committing twice.
- **M2 of pass 2 only partly fixed:** the freeing was right for an applied report but also ran for a report that the sequence fence skipped, which is the new finding below. The findings schema has no partial outcome, so the pass 2 record keeps `fixed`, and the remainder is this pass's finding.
- **Counts:** 0 critical, 0 high, 1 medium, 0 low; recorded in `findings.jsonl` (outcome `fixed-unreviewed`) and `passes.jsonl`.

| Finding | Resolution |
| --- | --- |
| M1 (`installation-enrollment`, `contract-drift`): `WorkerAdmissions.record` succeeded also when the fence skipped a report (PostgreSQL `worker-admission-repositories.ts:40`, in-memory `in-memory-worker-admissions.ts:36`), and `selfCheckReport` (`apps/control-plane/src/application/observation-effects.ts:169`) still freed assignments. A late failed report at sequence 2 after a passing one at sequence 4, still a new sequence for the journal, freed an assignment of an admitted worker, against worker admission contract section 5 ("A report at or below the fence changes nothing") | Section Unreviewed fix. |

- **`make verify` on `7f73475f`** (coordinator's Docker slot): exit 2; 2385 tests, 2381 pass, 1 fail, 3 skipped; coverage 99.35% lines, 92.30% branches, 99.02% functions. The failure was a test fixture that the M1 grant gate of pass 2 made stale: `apps/control-plane/test/control-plane-api.integration.test.ts:517` expected `assignment-not-active`, but its worker was never admitted, so the gate answered `worker-not-authorized` first. `d971bc73` admits that worker before the call, as `launch-authority.integration.test.ts` already does. The other integration tests that reach the launch authority (`administration`, `inventory`, `observation`, and `launch-authority.integration.test.ts`) admit their workers before any grant, and none issues a grant after a new journal incarnation or a failed report.

## Unreviewed fix

- **Decision:** the owner's away delegate chose option (a) on 2026-10-28, in away run `20261027T234450Z-claude-31574`: fix the pass 3 finding without a fourth review pass, under the [review pass cap](/docs/governance.md#independent-review-process).
- **Commit:** `f8f1b828` (`chore: free assignments only for an applied failed self-check report`). `WorkerAdmissions.record` answers `Result<AdmissionRecording>`, `applied` or `fenced`, identically in the in-memory and PostgreSQL adapters (a missing worker stays `not-found`); `selfCheckReport` frees assignments only when the report is applied and failed, so a fenced report has no effect. The shared conformance case `a report says whether it was applied or fenced, and a fenced one keeps the state` runs for both adapters. Design D6 and contract section 7 state it (`2fff3ad8`).
- **Test:** `a late failed report below the fence neither changes admission nor frees an assignment` (`apps/control-plane/test/observation-service.test.ts`, `ed8b3333`): a passing report at sequence 4 admits the worker, it accepts an assignment, then a failed report at sequence 2 arrives; the admission stays `admitted` with the passing results, the assignment stays unfinished, and no `execution.assignment.end` is sent.
- **Before the fix** (test written first, on `7f73475f`): `tests 1, pass 0, fail 1`; the admission assertion held, and the unfinished-assignment assertion failed with `+ []` against `- ['s233868b...c7ae2']`, so the assignment had been freed.
- **After the fix:** `tests 1, pass 1, fail 0`.
- **Checks after the fix,** without Docker:
  - `npm run build`, `npx tsc -p tsconfig.check.json`, and `npm run check:boundaries`: pass.
  - Every test file outside `*.integration.test.ts`: 1929 tests, 1926 pass, 0 fail, 0 cancelled, 3 skipped.
  - `npm run openspec -- validate implement-worker-self-check-admission --strict`: valid; `npm run verify:comments`, `npm run verify:links`, and `make findings ARGS="validate"`: pass.
- **Changed and not run:** `apps/control-plane/test/control-plane-api.integration.test.ts` (the worker is admitted first) and the PostgreSQL run of the new conformance case in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`; both need the services.

## Sequence deviation

The Docker runs of phase 2 ran without the coordinator's Docker slot, which the coordinator later required for this iMac: several integration runs through `scripts/services.sh run taskelith-wsca-int`, the fail-before run, and one `make verify` (log `wsca-verify-1.log`). No harm resulted: each run used its own Compose project, removed its containers, and pruned no volume; the last integration run and `make verify` passed, and the fail-before run failed only the tests it was meant to. After pass 1, no command that starts containers ran.

## Limitations

- `make verify-installation` and `make verify-linux-cgroup` passed on `8f03b701` (section Docker gates), but neither asserts admission: `scripts/installation.sh` checks build, bootstrap, start, enrollment, restart, and removal, not the worker's admission state, and the cgroup suite runs `checkLinuxContainment` in a privileged container, not the worker image's composed self-check. That the real Linux worker image reports `linux-containment` as passed and is admitted is therefore not shown here.
- The fail-before run reverted lines in a working tree, not at a commit; the reverted sources were restored and rebuilt before the checks above.
- `make verify` starts Docker containers for the integration services, which the phase 2 brief's "no Docker" rule did not foresee; see Sequence deviation.
- The fixes of review passes 2 and 3 have no `make verify` run before the archive: by the coordinator's ruling, the one `make verify` after them runs on the tree of the archive commit (section Archive).
- The fix of the pass 3 finding is unreviewed, by the owner's delegate decision (section Unreviewed fix).

## Docker gates

Run by Desi in the coordinator's Docker slot on `8f03b701`, the head before the archive (task 5.6):

- `make verify-installation`: exit 0; `installation.sh: built, bootstrapped, started, enrolled, restarted, removed`.
- `make verify-linux-cgroup`: exit 0; 17 tests, 17 pass, 0 fail, including "the self-check proves a delegated containment that the execution account cannot leave".

## Remaining gates

- `make verify-installation` and `make verify-linux-cgroup` again by the coordinator at integration.
- Integration into dev by the coordinator (single pull request).

## Archive

The checks below ran on the tree of the archive commit, the working tree after `npm run openspec -- archive implement-worker-self-check-admission --yes` on `8f03b701`; by the coordinator's ruling it is the one `make verify` after the fixes of review passes 2 and 3.

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line passes (`change/2026-10-28-implement-worker-self-check-admission`).
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only this change's edits, in `installation-enrollment`, `product-ports`, `resource-admission`, `worker-journal-adapter`, and `worker-runtime` (128 insertions, 1 deletion).
- The archived change has `findings.jsonl` (18 findings) and `passes.jsonl` (3 passes); `make findings ARGS="validate"` passes.
- `make verify`: exit 0; 2388 tests, 2385 pass, 0 fail, 3 skipped; coverage 99.35% lines, 92.29% branches, 99.02% functions; contract compatibility reports the 112 declared AsyncAPI breaking changes and 0 elsewhere.
