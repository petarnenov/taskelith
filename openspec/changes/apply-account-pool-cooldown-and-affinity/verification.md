# Verification: apply-account-pool-cooldown-and-affinity

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12b, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `f882c0ac` (#410, 12a): the `resumed-session` and `after-limit` selection inside the placement transaction (account pool contract sections 4.3, 4.4, and 4.7), which replaces 12a's refusal of those kinds, and the cooldown of a slot from a harness plugin's `limit` signal (section 5; agent harness port contract section 4.1), with gated races on PostgreSQL ([design](design.md), decisions 1 to 11). The coordinator Niki answered the design's questions Q1 to Q6 on 2026-10-29; the design records the answers verbatim, and the change applies them. No review pass has run yet.

## Revision

- Base: `dev` `f882c0ac` (the brief's checklist base and the branch's merge base with `origin/dev`); `git fetch origin` before routing showed `origin/dev` still at `f882c0ac`.
- `2c2c462c` `chore: start the apply-account-pool-cooldown-and-affinity change` (the brief's `checklist.json`, saved `--at f882c0ac665f46cdb766d18f20bfdf81bed9fadd --size M`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `d50099da` `chore: select resumed-session and after-limit slots and cool a slot on a limit signal`.
- `63d7acae` `docs: record the account pool cooldown and affinity design, spec delta, and contract updates`.
- `80d9533a` `docs: route the apply-account-pool-cooldown-and-affinity change` (`route.json`, unedited).
- `731a56dd` `docs: write the verification record of apply-account-pool-cooldown-and-affinity`. A `make verify` started on it was stopped by the author before its result, to make the two-limits race name the retried limit; it counts for nothing.
- `5f86a881` `chore: check which racing limit was retried by the slot's revision`: the race "two limits racing on one slot keep the later reported reset" asserted only that some limit was retried; it now derives the limit that committed second from the slot's revision, 5 when the later reset was written second and 4 otherwise, and asserts that this one was retried. Design decision 10 says so, changed in the record update below.
- `b0e26382` `docs: update the verification record of apply-account-pool-cooldown-and-affinity`, with design decision 10.
- `9532d527` `docs: delete the stale route of apply-account-pool-cooldown-and-affinity` and `6372755a` `docs: route the apply-account-pool-cooldown-and-affinity change again after the race test fix` (`route.json`, unedited; see "Checks").
- `1cf9047f` `docs: record the second route of apply-account-pool-cooldown-and-affinity` and `742d18ca` `docs: record the make verify of apply-account-pool-cooldown-and-affinity`, the `make record` of a passing `make verify` on the tree of `1cf9047f`, before the coordinator's answers.
- `a312b593` `chore: cap a reported reset at seven days and accept a limit for a removed slot as a no-op` (answers Q4 and Q5): `SLOT_REPORTED_RESET_MAXIMUM_MINUTES` (10080) in `slot-cooldown.ts`, exported by the package; `applySlotLimitInTransaction` returns a `removed` slot unchanged; three new tests in `slot-cooldown.test.ts`.
- `6518d084` `docs: record the coordinator's answers to the account pool cooldown questions and apply them to the contract and plan`: the design's "Coordinator answers" replace its open questions, with decisions 6, 7, and 9; the proposal, the spec delta, and task 1.2; contract sections 5, 9, 11, and 12 and `docs/g3-plan.md` row 12.
- `3696d3af` `docs: delete the stale route of apply-account-pool-cooldown-and-affinity after the answers' fixes` and `8b78cd74` `docs: route the apply-account-pool-cooldown-and-affinity change again after the answers' fixes` (`route.json`, unedited; see "Checks").
- This record's update after the answers, `docs: update the verification record of apply-account-pool-cooldown-and-affinity after the coordinator's answers`, the tree that `make verify` ran on, and then the commit of `make record`.

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12b only, as the brief scopes it. `selectSlotInTransaction` selects `resumed-session` and `after-limit` requests, and `applySlotLimitInTransaction` applies a plugin's `limit` event. Usage reports and authentication failures (section 5, "Load" and "Health") are not applied; they belong to the follow-up 12e `apply-account-pool-load-and-health-signals` (design, answer Q1). 12c (delivery), 12d (the other slot commands, the sweep, HTTP, the wire reasons, composition, the admitted pairs, key rotation), and item 18 (the relay of signals) are untouched; nothing new is wired into the composition.
- Affinity: a resumed session reads only its own slot and an `after-limit` request reads no pool of the limited harness, so no request kind moves a session to another slot or harness or rotates to another slot of a limited harness (sections 4.3 and 4.4). Waits are `waiting` outcomes with `provider-concurrency-exhausted`, never rejections, except `session-slot-withdrawn` for a resumed session's withdrawn slot, as section 4.3 says.
- Selection stays in the reservation transaction: all three kinds run inside `placeInTransaction` before `decidePlacement`, and only the insert of a placement writes the slot (section 4.7).
- No new third-party dependency; no wire change: `git diff f882c0ac` shows no change under `packages/contracts/`, and `make contract-compatibility` at `63d7acae` reported 0 breaking changes for every document against `f882c0ac665f`, `control-plane.openapi.json` at 0.3.0 included.
- Hexagonal: the selections and the cooldown rule are pure domain functions of `@taskelith/scheduling`; the limit command runs in the caller's capacity transaction through the ports `AssignmentRepository` and `AccountSlots`; no adapter changes. `npm run check:boundaries` passed.
- Neutrality and secrecy: the pool's new files are in the neutrality test's file list; the tests use opaque harness, slot, and mechanism identifiers and no real credential; the limit command reads no credential, and a test checks that its outcomes and failures hold no stored slot credential in their JSON and inspection forms.
- Contracts: account pool contract status line, section 5 ("Limit", the 7-day cap), section 9 (the cooldown test names the cap), section 11 ("Selection", and 12e and 12f in its last paragraph), and a new section 12, which states the key of a limit, item 18's obligation to carry the attempt's `AssignmentId`, the cap, the retryable `conflict`, and the no-op for a `removed` slot; `docs/g3-plan.md` row 12 names 12b, 12e, and 12f. Section 8 already says that a reinstated slot returns with its cooldown, as answer Q4 requires. The agent harness port contract and the capacity reservation contract are unchanged, as their text stays accurate.
- Spec delta: OpenSpec refuses a modified requirement that drops a scenario, so "New-session selection in the placement transaction" is removed and its text, without the refusal of the other kinds, is added as "Slot request in the placement transaction" with its two other scenarios. The added requirement bodies are 368 to 436 characters.
- Comments: `npm run verify:comments` passes.

## Fail-before

On a detached worktree of `f882c0ac` with the new and changed test files of `d50099da` copied in (`packages/modules/scheduling/test/slot-cooldown.test.ts`, `slot-selection.test.ts`, `slot-placement.test.ts`, and `packages/adapters/postgres/test/account-pool-selection.integration.test.ts`), `npm ci --ignore-scripts`, `npm run build`, and `node --experimental-strip-types --test` of those files against `make services-up` gave tests 21, pass 13, fail 8. `slot-cooldown.test.ts`, `slot-selection.test.ts`, and `account-pool-selection.integration.test.ts` failed at import, because the base exports no `applySlotLimitInTransaction`, `SLOT_LIMIT_APPLICATIONS`, or `selectAfterLimitSlot`. In `slot-placement.test.ts` every new case failed, because the base refuses both kinds with `invalid` (details `{ kind }`): "a resumed session reserves its own slot though another is less loaded, and writes it once", "a resumed session waits on its cooling slot and is rejected on a revoked one, writing no slot", "a session request naming another harness for its slot is invalid, and an unknown slot not found", "after a limit another harness is reserved and no other slot of the limited harness ever is", and "after a limit the limited slot is reserved again once its cooldown ended". The 13 passing cases are the unchanged ones of that file. The two cases of 12a that this change removes, "a resumed-session request fails the placement with invalid before sub-change 12b" and its `after-limit` twin, would fail after it.

After the coordinator's answers, `slot-cooldown.test.ts` of `a312b593`, without the line that pins `SLOT_REPORTED_RESET_MAXIMUM_MINUTES` and its import, which the source of `742d18ca` does not export, ran against the built source of `742d18ca`: tests 13, pass 10, fail 3. "a reported reset is capped at seven days after now" failed on a reset past the cap, which kept its reported time `2026-11-05T10:00:00.001Z`, while its reset at the cap passed; "a limit past the cap cools the slot for seven days" kept `2026-11-12T10:00:00.000Z`; and "a limit for a removed slot is accepted and writes nothing" found the slot cooled with revision 2. With the source of `a312b593` all 13 pass.

The gated PostgreSQL races are new tests, so their evidence is also a contrast: with `new PostgresDatabase(url, { serializationAttempts: 1 })` in a temporary copy of the file, all four failed in each of two runs (tests 4, pass 0, fail 4), each because a racer's transaction returned `unavailable`, "the transaction lost 1 serialization races in a row", so each race forces a serialization failure that only the retry resolves. With the default attempts they passed in each of three runs (tests 4, pass 4, fail 0). Both runs were repeated on the source of `5f86a881` with the same results.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test 'packages/modules/scheduling/test/*.test.ts'` after `npm run build` | `d50099da` | tests 187, pass 187, fail 0; with `--experimental-test-coverage` over the module's `dist`, the new and changed source files have 100 % lines and functions and 93.33 % to 100 % branches |
| `node --experimental-strip-types --test 'packages/modules/scheduling/test/*.test.ts'` after `npm run build` | `a312b593` | tests 190, pass 190, fail 0 |
| `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict` | `63d7acae` | `Change 'apply-account-pool-cooldown-and-affinity' is valid` |
| `npm run verify:archive` | `63d7acae` working tree | `Every active OpenSpec change archives into strictly valid specs.` |
| `make contract-compatibility` | `63d7acae` | 0 breaking changes for each of the six documents against `f882c0ac665f` |
| `make findings ARGS="route --change apply-account-pool-cooldown-and-affinity"` | `63d7acae` | "route: elevated (lines, contracts), rule version 2", features 803 lines and 12 files; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.70) and agrees; recommendation only, committed unedited as `80d9533a`. The brief names the reviewers at effort medium |
| `make findings ARGS="route --change apply-account-pool-cooldown-and-affinity"`, again | `9532d527` | Routed again before pass 1, as worker step 4 requires when fixes change the diff: `5f86a881` changed a test outside the change's directory, so the first `route.json` (`headCommit` `63d7acae`) was made for another tree, which the route gate of `make review` refuses. The stale `route.json` was deleted (`9532d527`) and the change routed again; committed unedited as `6372755a`. Result: "route: elevated (lines, contracts), rule version 2", features 807 lines and 12 files (before: 803 and 12); the same reviewer plan; shadow `jev-1.14.0` agrees (P(third) 0.70) |
| `make findings ARGS="route --change apply-account-pool-cooldown-and-affinity"`, a third time | `3696d3af` | Routed again before pass 1: `a312b593` changed the code and its test, and `6518d084` the contract and `docs/g3-plan.md`, all outside the change's directory, so the second `route.json` (`headCommit` `9532d527`) was made for another tree, which the route gate of `make review` refuses. The stale `route.json` was deleted (`3696d3af`) and the change routed again; committed unedited as `8b78cd74`. Result: "route: elevated (lines, contracts), rule version 2", features 848 lines and 12 files (before: 807 and 12); the same reviewer plan; shadow `jev-1.14.0` agrees (P(third) 0.70) |
| `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict` and `npm run verify:archive` | `6518d084` | `Change 'apply-account-pool-cooldown-and-affinity' is valid`; `Every active OpenSpec change archives into strictly valid specs.` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `1e56aab0b6d780535d7e6df3e93f5361a5053e86`; tests 3673, pass 3664, fail 0, skipped 9; all files 99.42% lines, 92.78% branches, 98.83% functions.
- `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict`: passed, `Change 'apply-account-pool-cooldown-and-affinity' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 87 file(s); every pass summary file is valid: 67 file(s); every route file is valid: 23 file(s).`.
- Spec diff against the merge base `f882c0ac665f` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run. The brief assigns pass 1 to reviewer A `codex gpt-6-astra#medium`, pass 2 to reviewer B `claude claude-opus-5-5#medium`, and pass 3, only after a pass 2 with a Medium or worse finding, to reviewer A `codex gpt-6.1-sol#medium`, at most three passes and stopping at a Low-only pass (governance, policy version 8). Unreviewed fixes go to the coordinator by commit for the architect check before the archive.

## Limitations

- Nothing calls the new paths outside tests: the control plane's placement service passes no slot request (12d), and no relay applies a session's `limit` event (item 18).
- The default cooldown is passed by the caller; 12d's composition supplies it from the control-plane installation settings (design, answer Q2).
- A limit is keyed by the assignment, which item 18 must carry with each relayed signal (answer Q3); after three applications the command returns a `conflict` that the caller may retry (answer Q6).
- A reported reset past the 7-day cap leaves the slot eligible before the provider's reset; a later limit cools it again (answer Q5).
- The race "a limit racing a placement that selects its slot commits only in a serial order" accepts either serial order and checks the one that ran; which order runs depends on the database, so a single run covers one of its two branches.
- Usage reports and authentication failures are not applied; 12e applies them (answer Q1).

## Remaining gates

- Review passes 1 and 2, and pass 3 if pass 2 reports a Medium or worse finding.
- The coordinator's architect check of any unreviewed fixes.
- The archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
