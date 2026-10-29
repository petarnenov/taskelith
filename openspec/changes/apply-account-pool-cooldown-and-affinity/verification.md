# Verification: apply-account-pool-cooldown-and-affinity

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12b, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `f882c0ac` (#410, 12a): the `resumed-session` and `after-limit` selection inside the placement transaction (account pool contract sections 4.3, 4.4, and 4.7), which replaces 12a's refusal of those kinds, and the cooldown of a slot from a harness plugin's `limit` signal (section 5; agent harness port contract section 4.1), with gated races on PostgreSQL ([design](design.md), decisions 1 to 11). The coordinator Niki answered the design's questions Q1 to Q6 on 2026-10-29; the design records the answers verbatim, and the change applies them. Review pass 1 reported three Medium findings and one Low, all fixed ("Independent review").

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
- `0661b717` `docs: update the verification record of apply-account-pool-cooldown-and-affinity after the coordinator's answers` and `f0b262be` `docs: record the make verify of apply-account-pool-cooldown-and-affinity after the coordinator's answers`, the `make record` of a passing `make verify` on the tree of `0661b717`; review pass 1 ran on `f0b262be`.
- `80d2c9a0` `chore: cap a far reported reset before it becomes an instant` (pass 1, finding 1).
- `82739848` `chore: allow three rereads after a lost compare-and-set of a limit` (pass 1, finding 3), with contract section 12.
- `8fdbadb7` `docs: cap the reported reset in the harness-account-pools cooldown requirement and record the far reset and rereads fixes` (pass 1, finding 2; the proposal and design decisions 8 and 9 and answers Q5 and Q6 for findings 1 and 3).
- `8b282e5e` `docs: make review pass 2 conditional in the remaining gates of apply-account-pool-cooldown-and-affinity` (pass 1, finding 4).
- This record's update after pass 1, `docs: record review pass 1 of apply-account-pool-cooldown-and-affinity and its fixes`, with `passes.jsonl` and `findings.jsonl`, the tree that `make verify` ran on, and then the commit of `make record`. `route.json` is not routed again after review fixes; worker step 4 asks for it only before pass 1.

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
- Spec delta: OpenSpec refuses a modified requirement that drops a scenario, so "New-session selection in the placement transaction" is removed and its text, without the refusal of the other kinds, is added as "Slot request in the placement transaction" with its two other scenarios. The added requirement bodies are 368 to 436 characters. After pass 1 (finding 2), "Least-loaded selection with cooldown" of `harness-account-pools` is modified with all its scenarios kept; its body is 459 characters, and an archive of the change in a scratch copy of `openspec/` followed by `openspec validate --specs --strict` passed (71 items).
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

- `make verify`: passed, profile full, tree `39f0b06803b02932a2e5d9e8737461fc22a983fc`; tests 3678, pass 3669, fail 0, skipped 9; all files 99.42% lines, 92.78% branches, 98.83% functions.
- `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict`: passed, `Change 'apply-account-pool-cooldown-and-affinity' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 87 file(s); every pass summary file is valid: 67 file(s); every route file is valid: 23 file(s).`.
- Spec diff against the merge base `f882c0ac665f` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18510-402e-7b52-9114-917ef75705ab` | 0 | 0 | 3 | 1 |
<!-- make record: end -->

## Independent review

The brief assigns pass 1 to reviewer A `codex gpt-6-astra#medium`, pass 2 to reviewer B `claude claude-opus-5-5#medium`, and pass 3, only after a pass 2 with a Medium or worse finding, to reviewer A `codex gpt-6.1-sol#medium`, at most three passes and stopping at a Low-only pass (governance, policy version 8). Unreviewed fixes go to the coordinator by commit for the architect check before the archive.

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a18510-402e-7b52-9114-917ef75705ab`, on `f0b262be`. The worktree snapshot before and after the review was `55a4e0b67bbf653d8ee5dfaccbc697fa0442717c05561df6378fcd08bfcd2adb`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /Users/petarnenov/taskelith-worktrees/apply-account-pool-cooldown-and-affinity -`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-10-29T00:29:56.907Z. Model confirmation: `model: gpt-6-astra`, `reasoning effort: medium`, `sandbox: read-only` in the Codex log header, as `make review` printed them. `make review` printed "route: route.json was made for this tree" and "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 0, Medium 3, Low 1, matching the pass 1 line of `passes.jsonl`; all four fixed and recorded in `findings.jsonl`.
  1. Medium, error-handling (`packages/modules/scheduling/src/application/apply-slot-limit.ts`): the latest reset that `parseHarnessEvent` accepts, `9999-12-31T23:59:59.999999999Z`, rounded up into the year 10000, which `Instant` refuses, so the command returned `invalid` instead of applying the 7-day cap. Fixed in `80d2c9a0`: `SlotLimitReport` carries the reset as `resetsAtEpochMilliseconds`, and `cooldownAfterLimit` caps it against the database time before it becomes an `Instant`; a reset that is no date stays `invalid`. Design decision 8 says so (`8fdbadb7`).
  2. Medium, contract-drift (`openspec/specs/harness-account-pools/spec.md`): the requirement "Least-loaded selection with cooldown" and its scenario "Limit with reset time" forbade new sessions until the reported reset, which the 7-day cap contradicts. Fixed in `8fdbadb7`: a MODIFIED delta of the requirement in `specs/harness-account-pools/spec.md` caps the cooldown at 7 days, keeps every scenario, narrows "Limit with reset time" to a reset within 7 days, and adds "Limit with reset time past the cap"; the proposal names the capability. The tests "a reported reset is capped at seven days after now" and "a limit past the cap cools the slot for seven days" cover both scenarios at the cooldown; eligibility after a cooldown's end is 12a's rule.
  3. Medium, contract-drift (`packages/modules/scheduling/src/application/apply-slot-limit.ts`): the command made three applications in all, the first and two rereads, while answer Q6 accepted three rereads. Fixed in `82739848`: `SLOT_LIMIT_REREADS` (3) replaces `SLOT_LIMIT_APPLICATIONS`, so up to three rereads follow the first application; contract section 12 says so, and design decision 9, answer Q6, and the proposal (`8fdbadb7`).
  4. Low, docs (`verification.md`, "Remaining gates"): pass 2 was listed as unconditional. Fixed in `8b282e5e`: pass 2 only after a pass 1 with a Medium or worse finding, as pass 3 after pass 2; after pass 1 the gate names pass 2 as required.
- Fail-before. Findings 1 and 3: the two new tests and the reworked conflict test, which replaces the old one (13 → 15 tests), copied into `slot-cooldown.test.ts` of `f0b262be`, with `SLOT_LIMIT_REREADS` imported as an alias of `SLOT_LIMIT_APPLICATIONS`, which is all the source of `f0b262be` exports, ran after `npm run build` against that source: tests 15, pass 12, fail 3. "a limit that loses three compare-and-sets applies after its third reread" got `conflict`; "a limit that keeps losing its compare-and-set returns the conflict after three rereads" counted 3 writes, expected 4; and "the latest reset that the port accepts is capped at seven days, not refused" got `invalid` ("the reset time of the limit is not an instant"). Finding 2 changes the specification only, and finding 4 a record.
- After the fixes: `npm run build`, then `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts` gave tests 192, pass 192, fail 0; `npm run verify:comments` passed; `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict` valid; `make findings ARGS="validate"` valid. The `make verify` of the fixed tree is under "Generated checks".
- Pass 1 found Medium findings, and the fixes change code, tests, the specification, and the contract, so pass 2 by reviewer B is required.

## Limitations

- Nothing calls the new paths outside tests: the control plane's placement service passes no slot request (12d), and no relay applies a session's `limit` event (item 18).
- The default cooldown is passed by the caller; 12d's composition supplies it from the control-plane installation settings (design, answer Q2).
- A limit is keyed by the assignment, which item 18 must carry with each relayed signal (answer Q3); after three rereads the command returns a `conflict` that the caller may retry (answer Q6).
- A reported reset past the 7-day cap leaves the slot eligible before the provider's reset; a later limit cools it again (answer Q5).
- The race "a limit racing a placement that selects its slot commits only in a serial order" accepts either serial order and checks the one that ran; which order runs depends on the database, so a single run covers one of its two branches.
- Usage reports and authentication failures are not applied; 12e applies them (answer Q1).

## Remaining gates

- Review pass 2, required because pass 1 reported Medium findings, and pass 3 only if pass 2 reports a Medium or worse finding.
- The coordinator's architect check of any unreviewed fixes.
- The archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
