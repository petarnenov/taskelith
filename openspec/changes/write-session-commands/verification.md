# Verification: write-session-commands

Assignment decided by the away delegate (Claude Fable 5.1, medium, run 20261109T222503Z-claude-32319) on 2026-11-10; the owner's 2026-11-02 roster named Zaki.

## Scope and source

Size M, developed by a briefed subagent. Source: G3 item 13, sub-change 13c2 (`docs/g3-plan.md` row 13), from the [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) sections 3, 9, and 12 "Item 13". Scope: `session.turn.deliver` for the turn that `nextDeliverableTurn` returns in the running generation, `session.response.deliver` from the transaction of `consumeResponse`, one `commandId` per turn and generation and per consumed response stored and reused, and the classified operation checked against the task's branch.

Not in scope and not done: `session.delegation-result.deliver` (item 38), `execution.scm-credential.refreshed` (item 21), revealed credentials in the redactor (13c3), session lifecycle wiring and the worker's side (item 18), HTTP, UI, and contract text other than `docs/contracts/session-timeline.md`. All packages touched are private; commit types `chore`, `test`, and `docs`.

No production path reaches these commands until item 18 adds `openSession` and `bindAttempt`. Verification is by tests, with the commands port covered against real PostgreSQL; nothing here is end-to-end coverage.

## Revision

- Base: `dev` `78a267444f4dd2847989dd37ef12ead78d20cbe4`; the brief's checklist was saved with `--at 78a267444f4dd2847989dd37ef12ead78d20cbe4 --size M`.
- The implementation, its tests, the dependency declarations, and these records are in the commits of branch `write-session-commands` on that base, listed by `git log 78a26744..HEAD`. `route.json` is committed unedited in its own commit after them.

## Environment

The host `GEO-PetarPetrov` (Linux 7.0.0-42-generic), Node.js v24.22.1, the `.nvmrc` pin, Docker 29.8.2. The targeted runs used `node --experimental-strip-types --test` on the built `dist/` packages, the integration files against the worktree's development services (`make services-up`, PostgreSQL, NATS, and Toxiproxy), stopped with `make services-down` before `make verify`.

## What was done

1. **Domain.** `packages/modules/execution/src/domain/session-commands.ts` is new: `dueCommands` computes the commands that a change of a session makes due, responses first, and `withCommandId` stores an ID. `session-records.ts` adds `Turn.deliveryCommands`, `ConsumedResponse.commandId`, and `RequestRecording.operation`; `session-requests.ts` adds `checkStandingRuleOperation` and the operation to `isSameRecording`.
2. **Service.** `session-timeline-service.ts`, `#written` calls `#withDueCommands` before `tx.sessions.replace`. `#consumed` runs the operation check after the domain's checks. `requestInput` digests the operation only when present. `session-events.ts` excludes `deliveryCommands` from the `turn-changed` comparison.
3. **Port and adapters.** `ports/session-timeline-store.ts` adds `SessionCommands`, `SessionCommandLog`, and `MINIMUM_SESSION_COMMAND_PROTOCOL`. The in-memory adapter records the commands; `PostgresSessionCommands` (`session-timeline-repositories.ts`) finds the attempt's assignment that has not ended and writes through Scheduling's `appendWorkerCommand`, which `capacity-commands.ts` and `scheduling/src/index.ts` now name and export.
4. **Control plane.** `session-observation-effects.ts` keeps the operation of `session.request.recorded`; `watched-timeline-stores.ts` classifies `commands.append` as a write; `composition/session-timeline.ts` supplies the digest, the task branch ref, and the log, and `composition/control-plane.ts` passes the `Logger`.
5. **Contract.** `docs/contracts/session-timeline.md` section 5.2 gains the rules 8 and 9, and section 2's code table names `unavailable`. No document sets a version or changelog rule for a contract text edit: `docs/governance.md`, `docs/architecture.md`, and `docs/contracts/` (which has no README) were checked; `worker-messages-and-terminal.md` section 13 versions only the AsyncAPI and OpenAPI documents, and none of those changes here. So the edit needs no version bump.

## Dependency and file limits

- `apps/control-plane` gains the production dependency `@taskelith/workspace` and the devDependency `@taskelith/git-workspace`, in `package.json` and `tsconfig.json` (the workspace contract requires its references), with `package-lock.json` and the regenerated `docs/dependencies/licenses.json` and `sbom.cdx.json` (`make dependency-inventory`). The boundary check accepted them.
- Non-test code files: 16, as forecast (the execution eight, the Scheduling two, the Postgres two, and the control plane four: `composition/control-plane.ts` passes the `Logger`). Their non-test lines: `git diff --numstat` of those directories and the new `session-commands.ts`: 396 lines added and 65 removed before pass 1 and 399 and 65 after its fixes, counting the two `package.json` and `tsconfig.json` files of `apps/control-plane` (395 and 65 without them), within the limit of 500.

## Fail-before

Each row mutated the named code in the source of the tree (then uncommitted), rebuilt with `npx tsc --build apps/control-plane/tsconfig.json`, ran the named files once, and restored the source from a copy taken just before it, then rebuilt.

| Mutation | Files run | Result |
| --- | --- | --- |
| No writer: `dueCommands` not called | `session-commands.test.ts`, `session-observation.integration.test.ts` | 54 tests, pass 30, fail 24: every turn and response command test and the integration test of a due command, killed before and after both commits |
| The operation check removed | `session-commands.test.ts` | 26, pass 22, fail 4: the three refusal cases and the operation before unavailable |
| The no-reader refusal of a response removed | the same and the integration file | 54, pass 51, fail 3: both service paths and the Postgres rollback |
| Stored IDs not excluded from `turn-changed` | `session-events.test.ts` | 6, pass 5, fail 1: "a stored command ID adds no event: a generation start publishes the session change alone" |
| The stored ID check of `dueTurn` always false | `session-commands.test.ts` | 26, pass 23, fail 3, the second change writing again |
| The operation left out of the recording digest | `session-commands.test.ts`, `session-observations.test.ts` | 57, pass 55, fail 2: the repeat with another operation, unit and through an observation |
| The effect drops the operation | `session-observations.test.ts` | 31, pass 30, fail 1 |
| The adapter's protocol version check removed | `session-observation.integration.test.ts` | 28, pass 25, fail 3: the commands port, the turn without a reader, and the response without a reader |
| Another digest for the task branch | `session-timeline-start.test.ts` | 8, pass 7, fail 1: the test that pins `sha256IdentifierDigest` |
| A turn or response ID stored for a `no-reader` command | `session-commands.test.ts` | 26, pass 23, fail 3: the turn and both response paths without a reader |

The row "A turn or response ID stored" replaces a first mutation that did not compile. Each mutation was reverted and the final tree rebuilt.

## Tests

- Targeted suites on the final source, against the worktree's services: `session-commands.test.ts`, `session-timeline-service.test.ts`, `session-events.test.ts`, `native-request-source.test.ts`, `session-output-tail.test.ts`, `session-requests.test.ts`, `session-observations.test.ts`, `session-timeline-start.test.ts`, `session-observation.integration.test.ts`, `native-answer-rollback.integration.test.ts`, `session-inbox.integration.test.ts`, `session-timeline-crash.integration.test.ts`, `session-timeline.integration.test.ts`: tests 246, pass 246, fail 0.
- Real PostgreSQL covers the commands port (`session-observation.integration.test.ts`): a written turn and response command checked against `TurnDeliveryCommand` and `ResponseDeliveryCommand` with `checkMessageSchema`; the worker's address; a turn's end through `ObservationService` committing the next turn's command, the cursor, and the session together; the port's refusals (version 1, no version, an ended assignment, no assignment, another ownership generation); the outbox backstop for a repeated ID; and a due command killed before and after `SessionTimelineCommit` and `OutboxCommit`.
- `npm run check:boundaries` passed; `npm run verify:comments` passed; `npm run openspec -- validate write-session-commands --strict` passed.
- `npm run openspec -- archive write-session-commands --yes` and `npm run openspec -- validate --all --strict` in a scratch copy of the tree passed (71 items passed, 0 failed), so no requirement of this change exceeds the validator's limit after archive; each requirement body is under 500 characters.
- `make verify` on the committed tree is in the generated part below.

## Author self-check and evidence check

- Self-check, by the briefing session before pass 1: it read `domain/session-commands.ts`, the diff of `session-timeline-service.ts`, and the edit of `session-timeline.md` against the brief's decisions and the review checklist in `checklist.json`, and checked the design note's load-bearing citations against the code. It did not read every test.
- Evidence check: `npm run verify:links` passed ("Every checked link conforms.") and `npm run verify:comments` passed. This change's records have no external links.

## Review

### Pass 1

- Reviewer: Codex CLI, model `gpt-6-astra`, effort `medium`, role A, read-only.
- Invocation: `make review CHANGE=write-session-commands PASS=1 ROLE=A REVIEWER='codex gpt-6-astra#medium'`, which printed `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only`. The model confirmation reported `gpt-6-astra`, effort `medium`, sandbox `read-only`. Session `01a1c28e-02ab-71e1-bd2b-2309d5f86d19`.
- Reviewed head `dee4a32d`. The snapshot before and after the pass was equal: `4a9e60cba4b646dec1e8734fd9fb10e916a4bcefcbe17dc84a9c2451b7ea3a23`.
- `route.json` recommended effort `high`; the authorized `medium` applied.
- Counts: Critical 0, High 0, Medium 2, Low 3, in `passes.jsonl` and `findings.jsonl`. Each finding was checked against the code and is correct; all five are fixed, and pass 2 checks the fixes.

| # | Severity | Finding | Test | Fix |
| --- | --- | --- | --- | --- |
| 1 | Medium | The delta left "Durable session timeline service" accepting a repeat on equal kind, turn, and text, while the code refuses a differing operation | Spec only; the tests "a recorded classified operation is stored, and a repeat with another operation is a conflict" and "a request recorded without an operation keeps the digest" already pin both digests | `3226eb30`: a MODIFIED requirement with the full living text, the optional operation in the digest, the old digest when absent, and two new scenarios; 489 characters in the requirement body; `proposal.md` names it |
| 2 | Medium | The in-memory adapter appended a repeated command ID that the PostgreSQL outbox refuses, and the old-record test relied on that | Fail-before below | `5e4a9987`: the adapter answers `conflict` for a held ID, after the no-reader check as in PostgreSQL; the fixture of "a stored session whose queued turn has neither an ID nor a command" has neither; "a written command whose stored ID was lost" covers the refusal |
| 3 | Low | The scenario said a stopped session or a turn of unknown acceptance writes no command | Mutation below | `3226eb30`: three scenarios, a failed change (no command), a stopped session, and a turn of unknown acceptance, the last two limited to `session.turn.deliver`; the last in that generation. New test "a stopped session writes no turn command but still delivers a response to its current turn" |
| 4 | Low | The no-reader rule covered every response, though the code skips a host's delegation result | Text only; `responseDue` skips it, and the test of the host's delegation result pins that no command is written | `3226eb30`: rule 9 of `docs/contracts/session-timeline.md` section 5.2, the requirement, and its scenario name a response of a principal or a standing rule, which produces `session.response.deliver` |
| 5 | Low | The commands port test restored the assignment as `running`, not an assignment state | No fail-before: the adapter only tests `state !== 'ended'`, so `running` and `offered` behave alike; mutation below | `9a0dac49`: the test restores `offered`, the state of the placed assignment, confirmed by a temporary `SELECT state FROM assignments` assertion during the integration run |

Fix round evidence, on the source rebuilt with `npx tsc --build apps/control-plane/tsconfig.json`, each change restored afterwards:

- Finding 2, the old test relied on the gap: the adapter's check alone, `session-commands.test.ts`: tests 26, fail 1, the old-record test, `expected success, got {"code":"conflict","message":"the outbox holds the command ...`.
- Finding 2, fail-before: the new tests against the adapter without the check: tests 28, pass 27, fail 1, "a written command whose stored ID was lost is refused by the outbox and the change rolls back", `expected a failure`. With the check: tests 28, pass 28.
- Finding 3, the new test is a characterization of behavior the code already had. Mutation control: `responseDue` returning nothing for a stopped session: tests 28, pass 27, fail 1, that test.
- Finding 5, mutation control: `PostgresSessionCommands.append` without the ownership generation check, `session-observation.integration.test.ts` against `scripts/services.sh run` services: tests 28, pass 27, fail 1, `another generation`; unmutated: tests 28, pass 28, also with the temporary state assertion, removed afterwards.
- `npm run openspec -- validate write-session-commands --strict`: valid. Scratch copy at `3226eb30` (`git archive`, with the worktree's `node_modules`): `npm run openspec -- archive write-session-commands --yes` applied `session-turn-model` `+ 4 added`, `~ 1 modified` and `observation-consumption` `~ 1 modified`; `npm run openspec -- validate --all --strict`: `Totals: 71 passed, 0 failed (71 items)`.

### Pass 2

- Reviewer: Claude Code, model `claude-fable-5-1`, effort `medium`, role B, read-only.
- Invocation: `make review CHANGE=write-session-commands PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium'`. The model was confirmed as `claude-fable-5-1` in the `modelUsage` of the last result line. Session `931ed9e8-6d4d-4b5d-a210-ce092a8642c8`.
- Reviewed head `71d8b782`. The snapshot before and after the pass was equal: `a66984024afe53cbd18c04ce32aeae6e3ec848c57ad40fcac8dad3b9598d4978`.
- All five fixes of pass 1 were confirmed by the reviewer.
- Counts: Critical 0, High 0, Medium 0, Low 4, in `passes.jsonl` and `findings.jsonl` with the outcome `fixed-unreviewed`. The pass is Low-only, so under governance no pass 3 runs and no pass reviews the fixes below.

### Pass 2 fixes (unreviewed)

These four fixes were reviewed by no pass; they await the coordinator's architect check (governance "Architect check of unreviewed fixes").

| # | Severity | Finding | Test | Fix |
| --- | --- | --- | --- | --- |
| 1 | Low | The records said "no running assignment", while the adapter accepts any assignment whose state is not `ended` | Text only | `6715d801`: `specs/session-turn-model/spec.md`, `proposal.md`, and this record say an assignment that has not ended |
| 2 | Low | No test asserted the delivery of the next generation after a turn of unknown acceptance | Passed at once; mutation below | `018250ee`: the test of `session-commands.test.ts` continues with `endGeneration(1)` and `started(subject, 2)` and asserts one `session.turn.deliver`, for the second turn, and none for the turn of unknown acceptance |
| 3 | Low | `TurnCommandRecord` collided with `TurnCommand`, a person's turn submission | Rename only; the compiler checks it | `8336333b`: renamed to `TurnDeliveryRecord` in `session-records.ts` and `index.ts` of the execution module |
| 4 | Low | The statuses of `respondToNativeRequest` did not name the 503 of a response that no worker can read | Text only | `29625f0a`: one sentence in `docs/contracts/control-plane-wire-contracts.md` section 9 names 503 under rule 9 of session timeline section 5.2 |

Finding 2's mutation control, on the source rebuilt with `npx tsc --build apps/control-plane/tsconfig.json` and restored afterwards: unmutated, `session-commands.test.ts`: tests 28, pass 28. With `dueTurn` picking a turn in state `outcome-unknown` before `nextDeliverableTurn`: tests 28, pass 27, fail 1, the extended test, `actual: [ 'turn-1' ], expected: [ 'turn-2' ]`.

Non-test code against the base `78a26744`, before the merge of `dev`: 16 files, 395 lines added and 65 removed (399 and 65 with the `package.json` and `tsconfig.json` of `apps/control-plane`), within the limits of 16 files and 500 lines.

- Architect check by the coordinator: _pending_.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c8062503e3f95a8354770c934140fc0f4a4adc93`; tests 5064, pass 5017, fail 0, skipped 47; all files 99.43% lines, 93.11% branches, 98.87% functions.
- `npm run openspec -- validate write-session-commands --strict`: passed, `Change 'write-session-commands' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 130 file(s); every pass summary file is valid: 110 file(s); every route file is valid: 63 file(s).`.
- Spec diff against the merge base `687c10f7f463` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1c28e-02ab-71e1-bd2b-2309d5f86d19` | 0 | 0 | 2 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `931ed9e8-6d4d-4b5d-a210-ce092a8642c8` | 0 | 0 | 0 | 4 |
<!-- make record: end -->

## Merge of dev

`origin/dev` at `687c10f7` (#453, `wire-account-pool-into-control-plane`) was merged into this branch by the merge commit `99f73428`, after both review passes, with no conflict. It touched the control-plane API, routes, and composition (`apps/control-plane/src/composition/control-plane.ts`, `settings.ts`, the new `account-pool.ts`), the account slot commands of Scheduling, the slot credential key, the secrets adapter, `control-plane.openapi.json`, one sentence of `docs/contracts/control-plane-wire-contracts.md`, and the living specs `account-pool-port` and `control-plane-api`; it did not touch `package-lock.json` or the living specs of this change's deltas. The reviewers saw the pre-merge tree: pass 1 reviewed `dee4a32d` and pass 2 `71d8b782`, and neither reviewed the merge nor the pass 2 fixes.

## Limitations

- Test fixtures that hold sessions without assignments use a `commands` port that answers `written` (`packages/adapters/postgres/test/session-timeline-fixtures.ts`, `apps/control-plane/test/native-answer-rollback.integration.test.ts`); only the integration tests named above use the real port.
- The response delivery and the turn delivery after `recordTurnRefused` are exercised at service level; no wire or worker test exercises them, as the worker's side is item 18.
- `docs/contracts/product-ports.md` section 5 wording remains "the card's change" (design, Q5).

## Remaining gates

- Independent review: passes 1 and 2 are recorded in "Review". Pass 2 is Low-only, so no pass 3 runs.
- The coordinator's architect check of the pass 2 fixes, which no pass reviews.
- Integration into `dev`.
