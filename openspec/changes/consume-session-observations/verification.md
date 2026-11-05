# Verification: consume-session-observations

## Scope and source

Assigned on 2026-11-05 by the coordinator (Niki) to the worker Zaki, size M, developed by a briefed subagent. Source: G3 item 13, sub-change 13c1 (`docs/g3-plan.md` row 13), from the [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) section 12 "Item 13". Scope, the brief's six points: (1) the session messages in the NATS adapter's schema tables, without the messages of items 21 and 38; (2) the control plane's protocol window of 1 to 2; (3) the section 9 observations applied through the session timeline after the recovery epoch check; (4) the wire paths of the 13a operations proven by tests; (5) refusals applied without effect and logged as evidence; (6) the notes in `docs/g3-plan.md` rows 13 and 18.

Not in scope and not done: the session commands the control plane writes (13c2), revealed credentials in the output redactor (13c3), session lifecycle wiring and the worker's side (item 18), effects of the messages of items 21 and 38, any HTTP, OpenAPI, or UI change, and any contract text under `docs/contracts/`. All packages touched are private; commit types `chore`, `test`, and `docs`.

## Revision

- Base: `dev` `6738a8f9` (#450); the brief's checklist was saved with `--at 6738a8f963fe5e42b9d3a11bb5760f90cb7d6bdf --size M`.
- `9a23aa9b` `chore: read the session messages in the nats schema tables` (`packages/adapters/nats`: the tables, the builders, and the transport tests).
- `210f3b49` `chore: apply session observations through the session timeline` (`packages/contracts`, `apps/control-plane`, their tests, proposal, design, tasks, the spec deltas, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `9b0249cb` `docs: record the split of g3 item 13c and the lifecycle wiring of item 18` (`docs/g3-plan.md` rows 13 and 18).
- `b4519fd5` `chore: route the consume session observations change` (`route.json` unedited).
- `36f17a30` and `812d085f`: this record and the generated checks of `make record` before pass 1. Pass 1 reviewed `812d085f`.
- The pass 1 fix round: `41b629e7` `chore: return a store failure of the session timeline instead of keeping it as evidence`, `2d5f3d29` `test: reject an offer with a protocol window that reaches version 2`, `afb01cb1` `test: pin how a command of items 21 and 38 reaches a version 1 worker`, `3776af92` `docs: correct the refusal rule, the evidence fields, and the deferred commands of the consume session observations change`, `bfd21ad9` `test: return a refusal of the session timeline after a write as a failure`.
- Then the record of pass 1 and the generated checks of `make record` after the fix round (`7768cd9d`, `2d6e2d3a`, `c95636f0`). Pass 2 reviewed `c95636f0`.
- The pass 2 fix round: `091f95f5` `chore: watch only the stores of a timeline transaction and classify each store call in a checked table`, `5ac4b5af` `chore: rename the local of a turn's failure that shadowed the kernel's failure`, `892289b5` `docs: correct the deferred commands, the domain calls after a write, the ignored fields, and the schema table wording of the consume session observations change`.
- Then `5964e2c6`, the findings record of pass 2, `63353925`, the generated checks of `make record` after the fix round, and the commit of this record's pass 2 sections. The archive commit is the last commit of the branch.

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

## Pass 1 fix round

Line references are at `bfd21ad9`. Each finding is in `findings.jsonl`; "Independent review" has the pass.

1. **High, error-handling: a store failure taken for a refusal** (`41b629e7`, `bfd21ad9`, `3776af92`). `apps/control-plane/src/application/watched-timeline-stores.ts` is new: `WatchedTimelineStores` passes the transaction's timeline stores on and notes every store call that failed and every call that is not a known read. `ObservationService` binds the timeline over it (`observation-service.ts:168-170`) and gives the effect the watch (`observation-effects.ts:54`). `sessionEffect` keeps a failure as evidence only when the stores are untouched (`session-observation-effects.ts:163`); otherwise `storeFailure` (`:172-175`) returns it, as `internal` when its code is a refusal's, because `ObservationService` would confirm a `conflict`, `not-found`, or `precondition-failed` as a G2 rejection. No contract text, port, or the timeline service changed. `design.md`, "Refusal, repeat, and failure", replaces the wrong assumption that every such failure precedes the writes and lists which operations can fail after a write: all ten, since each writes; the spec's refusal requirement and two scenarios follow. Tests: `session-observations.test.ts:442` (the reviewer's case, `items.add` answers `conflict` under the real timeline service), `:454` (the first write), `:464` (a read), `:474` (another code is returned as it is), `:483` (a refusal after a write, with no failed store call), and against PostgreSQL `session-observation.integration.test.ts:291`, which checks the session row's version and requests, the idempotency keys, the inbox items, the events, the inbox, the cursor, the confirmations, and the evidence log, and then that the redelivery records the request once.
2. **Medium, missing-fail-before-test: the protocol rejection's window** (`2d5f3d29`). `observation.integration.test.ts:492` rejects an offer with a window of versions 2 to 3: the assignment is refused and the worker's protocol version is 2. The spec's window requirement has the scenario.
3. **Low, spec-wording: the fields of an evidence log** (`3776af92`). The requirement "Session observation logs" names the fields of an ownership refusal, of a timeline refusal, which alone has `code`, and of the epoch gate, with a scenario; `design.md`, "Outcome and log", follows. The behaviour is unchanged and was already tested (`session-observations.test.ts:238`, `:321`, `:390`).
4. **Low, docs: deferred commands at a version 1 worker** (`afb01cb1`, `3776af92`). `packages/adapters/nats/src/wire-message.ts:11-12`, `packages/adapters/nats/test/transport.test.ts:188-189`, and `design.md` decision Q9 state that an observation of item 21 is quarantined as unknown, while a version 2 command of items 21 and 38 passes at a version 1 worker with its stable part for the worker to reject, and is quarantined as unknown only at a version the worker supports. The behaviour is unchanged; `transport.test.ts:226` and a scenario of the `nats-transport` delta pin it.

Beside the findings: `apps/control-plane/test/in-memory-capacity.ts:70` gives the fixtures without a timeline an empty object instead of `undefined`, because the watch wraps the transaction's timelines for every observation.

### Route after pass 1

`route.json` was not routed again. Worker step 4 routes again only when the fixes of the `make verify` run before pass 1 change the diff, and the route gate of `make review` runs before pass 1 only: "Later passes never route" (`docs/agent-task-protocol.md`, "Reviewer invocations"). The record stays the one of `b4519fd5`, made for the tree that pass 1 reviewed.

### Mutation controls of the fix round

Each run started from the clean committed tree of `bfd21ad9`, made one edit, rebuilt `dist/`, ran the named files once against the worktree's development services, restored the file with `git checkout`, and rebuilt; `git status` was empty after each. They ran one after another.

| Mutation | Files run | Result | Tests that failed |
| --- | --- | --- | --- |
| The effect no longer asks whether the stores are untouched, as at the reviewed `812d085f` | the two session test files | tests 46, pass 41, fail 5 | the five new tests of finding 1 that expect `internal`, the PostgreSQL one among them |
| The watch notes no write | the same | pass 45, fail 1 | "a refusal after the timeline wrote is a failure, though no store call failed" |
| The watch notes no failed store call | the same | pass 45, fail 1 | "a refusal's code from a read of the timeline is a failure, not a refusal" |
| The watch knows no read, so every call counts as a write | the same | pass 39, fail 7 | the six unit tests of refusals, repeats, and the log, and the integration test of acceptance unknown |
| `storeFailure` returns a refusal's code as it is | the same | pass 41, fail 5 | the same five as the first row: the observation is confirmed as a G2 rejection instead of failing |
| Only `commandRejection` takes the common version against a window of version 1 | `observation.integration.test.ts`, `control-plane-api.integration.test.ts` | tests 101, pass 100, fail 1 | "a rejected offer of a worker whose window reaches version 2 refuses the assignment and gives the worker version 2" |
| The worker's reader looks for a schema before it checks the version | `transport.test.ts` | tests 26, pass 25, fail 1 | "a command of items 21 and 38 passes at version 2 for a version 1 worker to reject, and is quarantined as unknown at version 1" |

The first row is the fail-before of finding 1 and the sixth the mutation control that finding 2 asks for.

### Checks of the fix round

| Check | Revision | Result |
| --- | --- | --- |
| Every test file of `apps/control-plane/test` and `transport.test.ts`, one run | the working tree before `41b629e7`, without the later tests of `afb01cb1` and `bfd21ad9` | tests 809, pass 780, fail 0, skipped 29 |
| The two session test files, `observation.integration.test.ts`, and `transport.test.ts`, one run | the tree of `3776af92` | tests 139, pass 139, fail 0 |
| `session-observations.test.ts` | the tree of `bfd21ad9` | tests 28, pass 28, fail 0 |

The development services were stopped with `make services-down` before `make verify`, whose result is in "Generated checks".

## Pass 2 fix round

Line references are at `892289b5`. Each finding is in `findings.jsonl`; "Independent review" has the pass. Pass 2 reported only Low findings, so no later pass reviewed these fixes ("Fixes that no later pass reviewed").

1. **Low, error-handling: a member that is no object** (`091f95f5`). The watch's outer trap wraps a member of the transaction only when it is an object and returns any other as it is (`apps/control-plane/src/application/watched-timeline-stores.ts:44-47`). Test: `apps/control-plane/test/session-observations.test.ts:498` reads a boolean member, as the PostgreSQL transaction's `changed` is, and a missing one through the watch.
2. **Low, naming: reads as bare strings** (`091f95f5`). `STORE_CALLS` (`watched-timeline-stores.ts:12-20`) names each call of each of the seven stores as a read or a write and `satisfies` a type derived from `SessionTimelineTransaction` (`:6-8`), so a missing or an unknown call does not compile. `isRead` (`:24-26`) answers by store and call; a call the table does not name counts as a write, as before. The classification of the existing calls is unchanged.
3. **Low, naming: a shadowing local** (`5ac4b5af`). `turnFailure` in `turnEnded` (`apps/control-plane/src/application/session-observation-effects.ts:93`).
4. **Low, docs: the proposal** (`892289b5`). `proposal.md:9` states the deferred observations and commands as design decision Q9 does, `:12` the condition that the stores are untouched, and `:33` names `watched-timeline-stores.ts`.
5. **Low, docs: two domain calls after a write** (`892289b5`). `design.md:63` names both, the change applied again after `tails.clear` and the output appended after `tails.put`, and why neither can refuse; `:59` describes the checked table.
6. **Low, docs: ignored fields** (`892289b5`). `design.md:95` and "Limitations" name the `cause` of `session.generation.ended` and the `reason` of `session.turn.acceptance-unknown`.
7. **Low, spec-wording: the notices and the inventory report** (`892289b5`). The requirement (`specs/nats-transport/spec.md:4`, 492 characters) excepts the command subject notices and the inventory report, and the scenario (`:8`) lists them, as the table test does. No code or contract text changed.

### Mutation controls of the pass 2 fix round

Run on the working tree that became `5ac4b5af`, whose code is that commit's. Each made one edit to `watched-timeline-stores.ts`, then restored the file from a copy; `cmp` found the restored file equal to the copy. The first two rebuilt `apps/control-plane` and ran `session-observations.test.ts` (29 tests); the last two ran `npx tsc -p tsconfig.check.json`.

| Mutation | Result |
| --- | --- |
| Every member is wrapped, as at the reviewed `c95636f0` | pass 28, fail 1: "a member of the transaction that is no store reaches the timeline as it is" |
| `sessions.get` listed as a write | pass 23, fail 6: the six unit tests of refusals, repeats, and the log |
| `listByTask` removed from the table | `TS2741`: the property is missing |
| A call `peek` that `SessionAuditRecords` does not have added to the table | `TS2353`: the property is not known |

The first row is the fail-before of finding 1; the last two show the compiler check of finding 2.

### Checks of the pass 2 fix round

| Check | Revision | Result |
| --- | --- | --- |
| `session-observations.test.ts` | the working tree that became `5ac4b5af` | tests 29, pass 29, fail 0 |
| `npx tsc -p tsconfig.check.json` | the same | no error |
| `npm run openspec -- validate consume-session-observations --strict`, `npm run verify:comments`, `npm run verify:archive` | the working tree that became `892289b5` | `Change 'consume-session-observations' is valid`; `Every comment is within the comment length rule.`; `Every active OpenSpec change archives into strictly valid specs.` |
| `make record-check CHANGE=consume-session-observations` | `63353925` | `make record-check: the generated part matches the tree` |

No PostgreSQL or Docker test was run apart from `make verify`, whose result is in "Generated checks" (log `verify-3.log`, outside the repository). `route.json` was not routed again ("Route after pass 1").

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `06681cc62c68f11febd93a60fd6ede5c1059553b`; tests 4956, pass 4909, fail 0, skipped 47; all files 99.42% lines, 93.03% branches, 98.85% functions.
- `npm run openspec -- validate consume-session-observations --strict`: passed, `Change 'consume-session-observations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 127 file(s); every pass summary file is valid: 107 file(s); every route file is valid: 60 file(s).`.
- Spec diff against the merge base `6738a8f963fe` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1aa4a-3c9b-71c1-8f38-9d209a2ad453` | 0 | 1 | 1 | 2 |
| 2 | B | `claude claude-fable-5-1#medium` | `904709de-4236-413a-ad20-eb44ba50e316` | 0 | 0 | 0 | 7 |
<!-- make record: end -->

## Independent review

The coordinator assigns the reviewers and runs the passes; each pass is recorded here with its reviewer and role, invocation, model confirmation, session, snapshot result, findings by severity, and resolutions.

### Pass 1

- Reviewer: Codex CLI `gpt-6-astra`, effort medium, role A, sandbox read-only; the output header reported the model, the effort, and the sandbox.
- Invocation: `make review CHANGE=consume-session-observations PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=<scratch>/pass1-prompt.md LOG=<scratch>/pass1.log`, run under `env -u JEV_MAF_LAB`. It printed `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`, the environment `PATH HOME USER LANG TERM`, and the start time 2026-11-05T05:59:14.178Z.
- Route gate: `route.json was made for this tree`; `recommends effort high; the authorized medium applies (policy version 11)`.
- Session: `01a1aa4a-3c9b-71c1-8f38-9d209a2ad453`.
- Reviewed revision: `812d085f`.
- Snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) before and after the pass: both `38dfdd9e0a36a1126ba9355e9550e9c2ae012df805ab53d02ecc6247fc35a3c8`.
- The reviewer ran 74 tests on the existing build and the comment check; it did not run the PostgreSQL or Docker tests or `make verify`.
- Findings: Critical 0, High 1, Medium 1, Low 2, as `passes.jsonl` counts them.

| Finding | Severity, category | File at `812d085f` | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1. A session effect took any timeline failure with a refusal's code as a refusal, so a store `conflict` after the timeline wrote committed a partial application as evidence | High, error-handling | `apps/control-plane/src/application/session-observation-effects.ts:162` | Fixed: a failure is a refusal only while the watched stores are untouched; otherwise it is returned and rolls back | `41b629e7`, tests also `bfd21ad9`, records `3776af92` |
| 2. No test failed when only the protocol rejection went back to the worker's window | Medium, missing-fail-before-test | `apps/control-plane/test/observation.integration.test.ts:480` | Fixed: a rejection with a window of 2 to 3, with its mutation control | `2d5f3d29` |
| 3. The log requirement gave every evidence log the same fields | Low, spec-wording | `openspec/changes/consume-session-observations/specs/observation-consumption/spec.md:65` | Fixed: the fields of each kind of evidence, `code` only for a timeline refusal | `3776af92` |
| 4. Two comments and the design said every deferred message is quarantined as unknown | Low, docs | `packages/adapters/nats/src/wire-message.ts:12` | Fixed: the three places state how a version 2 command reaches a version 1 worker; a test pins it | `afb01cb1`, `3776af92` |

Pass 2 checked these four fixes and confirmed each as resolved, so `findings.jsonl` holds each as `fixed`. "Pass 1 fix round" describes the fixes and their evidence.

### Pass 2

- Reviewer: Claude Code `claude-fable-5-1`, effort medium, role B, read-only (permission mode `plan`, the editing tools disallowed).
- Invocation: `make review CHANGE=consume-session-observations PASS=2 REVIEWER='claude claude-fable-5-1#medium' PROMPT=<scratch>/pass2-prompt.md LOG=<scratch>/pass2.log`, run under `env -u JEV_MAF_LAB`. It printed `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>` and the start time 2026-11-05T06:27:24.535Z.
- Route line: `recommends effort high; the authorized medium applies (policy version 11)`.
- Model confirmation: `claude-fable-5-1` is the only key of `modelUsage` in the last `"type":"result"` line of the log.
- Session: `904709de-4236-413a-ad20-eb44ba50e316`.
- Reviewed revision: `c95636f0`.
- Snapshot before and after the pass: both `d86ac97cc20ccbdb247b64f7423e72c77b46cd3190ca65857c2d3f906c88f78d`.
- The prompt named the session of pass 1 and asked the reviewer to check each fix of pass 1 and then to review the whole change independently. It confirmed all four fixes of pass 1 as resolved.
- The reviewer ran `npm run verify:comments`, the strict OpenSpec validation, and `session-observations.test.ts` (28 of 28) on the existing build. It ran no PostgreSQL or Docker suite and no `make verify`, and it could not mutate the tree, so its statements that a test fails without a fix rest on reading the tests and on the recorded mutation controls.
- Findings: Critical 0, High 0, Medium 0, Low 7, as `passes.jsonl` counts them.

| Finding | Severity, category | File at `c95636f0` | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1. The watch wrapped every member of the transaction in a proxy, so reading a member that is no object would throw | Low, error-handling | `apps/control-plane/src/application/watched-timeline-stores.ts:24` | Fixed: only an object member is wrapped; a unit test reads a member that is no store | `091f95f5` |
| 2. The reads were a set of bare call names shared by all stores, unchecked against the port interfaces | Low, naming | `apps/control-plane/src/application/watched-timeline-stores.ts:6` | Fixed: a table per store that the compiler checks against `SessionTimelineTransaction` | `091f95f5` |
| 3. A local `failure` in `turnEnded` shadowed the kernel's `failure` | Low, naming | `apps/control-plane/src/application/session-observation-effects.ts:93` | Fixed: renamed `turnFailure` | `5ac4b5af` |
| 4. The proposal kept the corrected statement about the deferred messages, gave the refusal rule without its condition, and left the watch file out of "Impact" | Low, docs | `openspec/changes/consume-session-observations/proposal.md:9` | Fixed: the three places | `892289b5` |
| 5. The design named one domain call after a write; there are two | Low, docs | `openspec/changes/consume-session-observations/design.md:63` | Fixed: both calls and why neither can refuse | `892289b5` |
| 6. The ignored payload fields left out `cause` and `reason` | Low, docs | `openspec/changes/consume-session-observations/design.md:93` | Fixed: both in the design's risks and in "Limitations" | `892289b5` |
| 7. The requirement and scenario of the schema tables left out the command subject notices and the inventory report | Low, spec-wording | `openspec/changes/consume-session-observations/specs/nats-transport/spec.md:8` | Fixed: both sentences name them | `892289b5` |

A pass with only Low findings ends the review: the fixes are made without another review.

- Pass 3: not run, because pass 2 reported no Medium or worse finding.

### Fixes that no later pass reviewed

UNREVIEWED: no reviewer has seen the seven fixes of pass 2; `findings.jsonl` holds each as `fixed-unreviewed`. "Pass 2 fix round" has their line references and evidence.

| Fix of pass 2 finding | Commit |
| --- | --- |
| 1. Only an object member of the transaction is wrapped | `091f95f5` |
| 2. The checked table of store calls | `091f95f5` |
| 3. The local `turnFailure` | `5ac4b5af` |
| 4. The proposal | `892289b5` |
| 5. The two domain calls after a write in the design | `892289b5` |
| 6. The ignored `cause` and `reason` | `892289b5` |
| 7. The wording of the `nats-transport` requirement and scenario | `892289b5` |

Architect check of unreviewed fixes (coordinator): not done yet; the coordinator records it here or, since the branch is archived, in the pull request body.

## Limitations

- Nothing in production opens or binds a session, so no session observation changes a session outside tests until item 18's first sub-change (decision Q4).
- With the window at 1 to 2, a worker that declared version 2 would get it before the control plane can write a version 2 offer. `apps/worker` declares version 1.
- A report that arrives after its attempt's bind ended is evidence, not a timeline change (`design.md`, "Open questions").
- The `chunk` of an output and the `generation` of a limit signal are not checked for continuity; the timeline holds neither.
- The `operation` of `session.request.recorded` is ignored until 13c2.
- The `cause` of `session.generation.ended` and the `reason` of `session.turn.acceptance-unknown` are ignored; the timeline takes and holds neither.
- The integration tests ran on one host; the races are forced by a barrier, not by load.
- A failure of the timeline after its stores were touched is delivered again until the consumer quarantines the observation; a store row that persistently conflicts therefore ends in quarantine, not in evidence.
- The watch tells a read from a write by a table of each store's calls that the compiler checks against `SessionTimelineTransaction`, so a new call of a timeline store does not compile until it is classified. The table is a judgement per call, not derived from the adapters: a read wrongly listed as a write would turn a refusal after it into a failure, and a write wrongly listed as a read could keep a partial application as evidence. A member the table does not name counts as a write.
- A failure of the effect's own ownership reads is returned with its code. No adapter fails those reads with a refusal's code; one would be confirmed as a G2 rejection, with nothing written (`design.md`, "Risks").

## Follow-ups

- The log name of a refused G2 observation, `execution.observation.rejected`, against the contract's "evidence" (`design.md`, "Follow-ups").
- Session lifecycle wiring to item 18's first sub-change (Q4).
- 13c2 `write-session-commands`, then 13c3 `redact-revealed-credentials-in-session-output`, which lands on `dev` before item 18 and before any promotion to `main` that carries this change.
- The four messages of items 21 and 38 in the schema tables, with their effects.

## Remaining gates

- The coordinator's architect check of the seven fixes that no later pass reviewed.
- Integration into dev by the coordinator (single pull request).
