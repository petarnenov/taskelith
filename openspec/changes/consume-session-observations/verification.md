# Verification: consume-session-observations

## Scope and source

Assigned on 2026-11-05 by the coordinator (Niki) to the worker Zaki, size M, developed by a briefed subagent. Source: G3 item 13, sub-change 13c1 (`docs/g3-plan.md` row 13), from the [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) section 12 "Item 13". Scope, the brief's six points: (1) the session messages in the NATS adapter's schema tables, without the messages of items 21 and 38; (2) the control plane's protocol window of 1 to 2; (3) the section 9 observations applied through the session timeline after the recovery epoch check; (4) the wire paths of the 13a operations proven by tests; (5) refusals applied without effect and logged as evidence; (6) the notes in `docs/g3-plan.md` rows 13 and 18.

Not in scope and not done: the session commands the control plane writes (13c2), revealed credentials in the output redactor (13c3), session lifecycle wiring and the worker's side (item 18), effects of the messages of items 21 and 38, any HTTP, OpenAPI, or UI change, and any contract text under `docs/contracts/`. All packages touched are private; commit types `chore` and `docs`.

## Revision

- Base: `dev` `6738a8f9` (#450); the brief's checklist was saved with `--at 6738a8f963fe5e42b9d3a11bb5760f90cb7d6bdf --size M`.
- `9a23aa9b` `chore: read the session messages in the nats schema tables` (`packages/adapters/nats`: the tables, the builders, and the transport tests).
- `210f3b49` `chore: apply session observations through the session timeline` (`packages/contracts`, `apps/control-plane`, their tests, proposal, design, tasks, the spec deltas, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `9b0249cb` `docs: record the split of g3 item 13c and the lifecycle wiring of item 18` (`docs/g3-plan.md` rows 13 and 18).
- `b4519fd5` `chore: route the consume session observations change` (`route.json` unedited).
- Then this record and the generated checks of `make record`.

## Environment

The host `hpz600` (Linux 6.8.0-147-generic, x86_64, 8 logical CPUs), Node.js v24.22.1, the `.nvmrc` pin, Docker 27.3.1. The targeted runs used `node --experimental-strip-types --test --test-reporter=spec` on the built `dist/` packages, the integration files against the worktree's own development services (`make services-up`, PostgreSQL, NATS, and Toxiproxy), which were stopped with `make services-down` before `make verify`.

## What was done

Line references are at `b4519fd5`.

1. **Schema tables.** `packages/adapters/nats/src/wire-message.ts:17-18` names `session.turn.deliver` and `session.response.deliver`, and `:42-51` the ten session observations; `:12` states what is left out. `packages/adapters/nats/test/transport.test.ts:190-217` replaces the test that filtered by a marker with one that names the four messages of items 21 and 38 and checks that each table key is the type its schema names; `:219-249` adds the tests of an item 21 observation, of each session observation, and of a session command at a worker of version 1. The builders are in `packages/adapters/nats/test/messages.ts`.
2. **Window.** `packages/contracts/src/protocol-version.ts:22-25` exports `CONTROL_PLANE_PROTOCOL_VERSIONS`; `SUPPORTED_PROTOCOL_VERSIONS` (`:15`) is unchanged, and `apps/worker` and the worker's reader in the NATS adapter still use it. The control plane uses the new window at `apps/control-plane/src/admin/administration.ts:326` and `apps/control-plane/src/application/observation-effects.ts:121` and `:156`.
3. **Observations through the timeline.** `apps/control-plane/src/application/session-observation-effects.ts` is new: `sessionEffect` (`:152-166`), the ownership check `ownedSession` (`:170-182`), and the ten effects (`:202-213`), registered behind the epoch gate by `eachAtCurrentEpoch` (`observation-effects.ts:360` and `:379`). `ControlPlaneTransaction` has `sessionTimeline` (`control-plane-store.ts:60`); `ObservationService` binds the timeline per transaction (`observation-service.ts:34` and `:167`), and the composition passes `timelineIn` (`composition/session-timeline.ts:69`, `composition/control-plane.ts:283`).
4. **Wire paths.** `apps/control-plane/test/session-observations.test.ts:180` and `:207`, and against PostgreSQL `apps/control-plane/test/session-observation.integration.test.ts:178` and `:193`: `turn-invalid` refuses the turn and the next one is deliverable in the same generation; acceptance unknown holds the queue until the next generation.
5. **Refusals.** `session-observation-effects.ts:161-164` and `keptAsEvidence` (`:192-198`); the repeats are the `isHeldBy` of each report and are listed in `design.md`, "Refusal, repeat, and failure". Tests: `session-observations.test.ts:223-311` and `:401`.
6. **Plan.** `docs/g3-plan.md:110` and `:115`.

## Fail-before

Each run removed the named part from the source of `b4519fd5`'s tree (then uncommitted), rebuilt `dist/`, ran the named files once, and restored and rebuilt the source; the restored files were compared byte for byte with their copies.

| Removed | Files run | Result |
| --- | --- | --- |
| The registration of the session effects in `OBSERVATION_EFFECTS` | `session-observations.test.ts`, `session-observation.integration.test.ts` | tests 40, pass 0, fail 40: every observation stays unconsumed |
| The twelve `session.*` entries of the two tables | `transport.test.ts` | tests 25, pass 22, fail 3: the table test, the session observation test, and the session command test |
| `CONTROL_PLANE_PROTOCOL_VERSIONS` in the control plane, replaced by `SUPPORTED_PROTOCOL_VERSIONS` | `observation.integration.test.ts`, `control-plane-api.integration.test.ts` | tests 100, pass 98, fail 2: "a worker whose window reaches version 2 gets it, the highest the control plane window of 1 to 2 shares" and "a worker enrolls over the API with its token once" |

The first row covers the brief's fail-before list for the effects: among its 40 failures are "a turn the plugin refused as invalid becomes refused and the next turn is deliverable in the same generation", "a turn of unknown acceptance holds the queue until the next generation", "the output, a request, and the outcome of an outcome-unknown turn are confirmed as evidence and the next observation is applied", "an observation of an unknown session is confirmed as evidence without effect", and the two tests of another attempt and another ownership generation.

## Mutation controls

Run the same way on the two session test files (40 tests).

| Mutation | Result | Tests that failed |
| --- | --- | --- |
| The effects registered without the epoch gate | pass 34, fail 6 | the three unit tests "every session observation of ... is kept as evidence before the timeline is read" and the three integration tests of an older epoch, a newer epoch, and restore quarantine |
| No check that the producer held the attempt | pass 38, fail 2 | "a worker that never held the attempt at its ownership generation cannot write the session" and its integration test |
| No check of the attempt and ownership generation against the active bound attempt | pass 37, fail 3 | the unit tests of another attempt and of another ownership generation, and the integration test of an unknown session or another attempt |
| No failure code counted as a refusal, so a refusal is returned | pass 33, fail 7 | the six unit tests of refusals, repeats, and the log, and the integration test of acceptance unknown |
| A repeat logged as evidence | pass 39, fail 1 | "a fact the session already holds, reported again under another identity, is a repeat and no evidence" |
| Every failure counted as a refusal | pass 39, fail 1 | "a failure of the timeline that is no refusal is returned, not kept as evidence" |

A first attempt at the fourth mutation did not compile, so its run tested the unmutated build and passed; it is not counted, and the mutation was redone as the table states it. A first batch of these runs overlapped with a second one, which left one mutation in the source; the line was restored, the source compared with the reviewed text, and every run of both tables repeated one after another from a pristine copy. The numbers above are those of the repeated runs.

## Author self-check

- Ownership: an observation reaches the timeline only for the session's active bound attempt at the observation's ownership generation that the producer held (`session-observation-effects.ts:170-182`); the two mutations above show both halves are tested, in memory and against PostgreSQL.
- The epoch gate runs before any timeline read: the unit tests give the effect a timeline that throws on any use, for each of the ten types at an older epoch, a newer epoch, and in quarantine.
- One commit: the integration tests kill the control plane before and after the commit points of the timeline, the inbox, and the outbox, and fail the cursor after the timeline changed; nothing partial is stored, and the redelivery applies the observation once or is a duplicate.
- Races: a turn submitted over the timeline service against an observation on the same session, and a second turn submitted while the first is refused, each from a barrier that releases both transactions at once; both commit, and the test asserts that a transaction ran again.
- Logs hold identifiers only: a refused output and a refused request are logged without their text (`session-observations.test.ts:401`). Fixtures use plain words, no value shaped like a credential.
- The builders derive `observationId` as the contract's section 9 table states, and the `reason` values are those of the AsyncAPI document; the NATS test checks each derived identity against the schema.
- Comments are within the comment length rule (`npm run verify:comments`: `Every comment is within the comment length rule.`). No sleeps in tests. No AI attribution in commits.
- No production caller of `openSession`, `bindAttempt`, `endBoundAttempt`, or `startGeneration` other than the `session.generation.started` effect, which section 9 assigns to `startGeneration`.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `session-observations.test.ts`, `session-observation.integration.test.ts`, `transport.test.ts`, `observation.integration.test.ts`, `control-plane-api.integration.test.ts`, one run together | the tree of `b4519fd5`, then uncommitted | tests 165, pass 165, fail 0 |
| `session-observation.integration.test.ts`, three consecutive runs | working tree before `210f3b49` | 3 of 3 passed, 17 tests each |
| `npx tsc -p tsconfig.check.json` and `npm run check:boundaries` | the tree of `b4519fd5` | no error; `Workspace and hexagonal boundary checks passed.` |
| `npm run openspec -- validate consume-session-observations --strict` | the tree of `b4519fd5` | `Change 'consume-session-observations' is valid` |

### Route

Route (`route.json`, rule version 5): elevated, triggers lines, files, capabilities, and contracts; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.78, threshold 0.4). The route is a recommendation: the coordinator names the reviewers and the effort of each pass.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a63db33a58ce2d40f1b471865388e81505e83362`; tests 4947, pass 4900, fail 0, skipped 47; all files 99.43% lines, 93.02% branches, 98.86% functions.
- `npm run openspec -- validate consume-session-observations --strict`: passed, `Change 'consume-session-observations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 127 file(s); every pass summary file is valid: 107 file(s); every route file is valid: 60 file(s).`.
- Spec diff against the merge base `6738a8f963fe` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

No review pass has run. The coordinator assigns the reviewers and runs the passes; each pass is recorded here with its reviewer and role, invocation, model confirmation, session, snapshot result, findings by severity, and resolutions.

- Pass 1: not run.
- Pass 2: not run.
- Pass 3: not run.

Architect check of unreviewed fixes (coordinator): none yet.

## Limitations

- Nothing in production opens or binds a session, so no session observation changes a session outside tests until item 18's first sub-change (decision Q4).
- With the window at 1 to 2, a worker that declared version 2 would get it before the control plane can write a version 2 offer. `apps/worker` declares version 1.
- A report that arrives after its attempt's bind ended is evidence, not a timeline change (`design.md`, "Open questions").
- The `chunk` of an output and the `generation` of a limit signal are not checked for continuity; the timeline holds neither.
- The `operation` of `session.request.recorded` is ignored until 13c2.
- The integration tests ran on one host; the races are forced by a barrier, not by load.

## Follow-ups

- The log name of a refused G2 observation, `execution.observation.rejected`, against the contract's "evidence" (`design.md`, "Follow-ups").
- Session lifecycle wiring to item 18's first sub-change (Q4).
- 13c2 `write-session-commands`, then 13c3 `redact-revealed-credentials-in-session-output`, which lands on `dev` before item 18 and before any promotion to `main` that carries this change.
- The four messages of items 21 and 38 in the schema tables, with their effects.

## Remaining gates

- Independent review by the reviewers the coordinator assigns.
- Integration into dev by the coordinator (single pull request).
