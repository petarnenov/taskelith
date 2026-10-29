# Verification: apply-account-pool-cooldown-and-affinity

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12b, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `f882c0ac` (#410, 12a): the `resumed-session` and `after-limit` selection inside the placement transaction (account pool contract sections 4.3, 4.4, and 4.7), which replaces 12a's refusal of those kinds, and the cooldown of a slot from a harness plugin's `limit` signal (section 5; agent harness port contract section 4.1), with gated races on PostgreSQL ([design](design.md), decisions 1 to 11). The design's open coordinator questions Q1 to Q6 are pending; the change takes the conservative option of each. No review pass has run yet.

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
- This record's last update before `make verify`, `docs: record the second route of apply-account-pool-cooldown-and-affinity`, the tree that `make verify` ran on, and then the commit of `make record`.

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12b only, as the brief scopes it. `selectSlotInTransaction` selects `resumed-session` and `after-limit` requests, and `applySlotLimitInTransaction` applies a plugin's `limit` event. Usage reports and authentication failures (section 5, "Load" and "Health") are not applied (design, question Q1). 12c (delivery), 12d (the other slot commands, the sweep, HTTP, the wire reasons, composition, the admitted pairs, key rotation), and item 18 (the relay of signals) are untouched; nothing new is wired into the composition.
- Affinity: a resumed session reads only its own slot and an `after-limit` request reads no pool of the limited harness, so no request kind moves a session to another slot or harness or rotates to another slot of a limited harness (sections 4.3 and 4.4). Waits are `waiting` outcomes with `provider-concurrency-exhausted`, never rejections, except `session-slot-withdrawn` for a resumed session's withdrawn slot, as section 4.3 says.
- Selection stays in the reservation transaction: all three kinds run inside `placeInTransaction` before `decidePlacement`, and only the insert of a placement writes the slot (section 4.7).
- No new third-party dependency; no wire change: `git diff f882c0ac` shows no change under `packages/contracts/`, and `make contract-compatibility` at `63d7acae` reported 0 breaking changes for every document against `f882c0ac665f`, `control-plane.openapi.json` at 0.3.0 included.
- Hexagonal: the selections and the cooldown rule are pure domain functions of `@taskelith/scheduling`; the limit command runs in the caller's capacity transaction through the ports `AssignmentRepository` and `AccountSlots`; no adapter changes. `npm run check:boundaries` passed.
- Neutrality and secrecy: the pool's new files are in the neutrality test's file list; the tests use opaque harness, slot, and mechanism identifiers and no real credential; the limit command reads no credential, and a test checks that its outcomes and failures hold no stored slot credential in their JSON and inspection forms.
- Contracts: account pool contract status line, section 11 ("Selection"), and a new section 12; `docs/g3-plan.md` row 12 names 12b. The agent harness port contract and the capacity reservation contract are unchanged, as their text stays accurate.
- Spec delta: OpenSpec refuses a modified requirement that drops a scenario, so "New-session selection in the placement transaction" is removed and its text, without the refusal of the other kinds, is added as "Slot request in the placement transaction" with its two other scenarios. Requirement bodies are 368 to 419 characters.
- Comments: `npm run verify:comments` passes.

## Fail-before

On a detached worktree of `f882c0ac` with the new and changed test files of `d50099da` copied in (`packages/modules/scheduling/test/slot-cooldown.test.ts`, `slot-selection.test.ts`, `slot-placement.test.ts`, and `packages/adapters/postgres/test/account-pool-selection.integration.test.ts`), `npm ci --ignore-scripts`, `npm run build`, and `node --experimental-strip-types --test` of those files against `make services-up` gave tests 21, pass 13, fail 8. `slot-cooldown.test.ts`, `slot-selection.test.ts`, and `account-pool-selection.integration.test.ts` failed at import, because the base exports no `applySlotLimitInTransaction`, `SLOT_LIMIT_APPLICATIONS`, or `selectAfterLimitSlot`. In `slot-placement.test.ts` every new case failed, because the base refuses both kinds with `invalid` (details `{ kind }`): "a resumed session reserves its own slot though another is less loaded, and writes it once", "a resumed session waits on its cooling slot and is rejected on a revoked one, writing no slot", "a session request naming another harness for its slot is invalid, and an unknown slot not found", "after a limit another harness is reserved and no other slot of the limited harness ever is", and "after a limit the limited slot is reserved again once its cooldown ended". The 13 passing cases are the unchanged ones of that file. The two cases of 12a that this change removes, "a resumed-session request fails the placement with invalid before sub-change 12b" and its `after-limit` twin, would fail after it.

The gated PostgreSQL races are new tests, so their evidence is also a contrast: with `new PostgresDatabase(url, { serializationAttempts: 1 })` in a temporary copy of the file, all four failed in each of two runs (tests 4, pass 0, fail 4), each because a racer's transaction returned `unavailable`, "the transaction lost 1 serialization races in a row", so each race forces a serialization failure that only the retry resolves. With the default attempts they passed in each of three runs (tests 4, pass 4, fail 0). Both runs were repeated on the source of `5f86a881` with the same results.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test 'packages/modules/scheduling/test/*.test.ts'` after `npm run build` | `d50099da` | tests 187, pass 187, fail 0; with `--experimental-test-coverage` over the module's `dist`, the new and changed source files have 100 % lines and functions and 93.33 % to 100 % branches |
| `npm run openspec -- validate apply-account-pool-cooldown-and-affinity --strict` | `63d7acae` | `Change 'apply-account-pool-cooldown-and-affinity' is valid` |
| `npm run verify:archive` | `63d7acae` working tree | `Every active OpenSpec change archives into strictly valid specs.` |
| `make contract-compatibility` | `63d7acae` | 0 breaking changes for each of the six documents against `f882c0ac665f` |
| `make findings ARGS="route --change apply-account-pool-cooldown-and-affinity"` | `63d7acae` | "route: elevated (lines, contracts), rule version 2", features 803 lines and 12 files; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.70) and agrees; recommendation only, committed unedited as `80d9533a`. The brief names the reviewers at effort medium |
| `make findings ARGS="route --change apply-account-pool-cooldown-and-affinity"`, again | `9532d527` | Routed again before pass 1, as worker step 4 requires when fixes change the diff: `5f86a881` changed a test outside the change's directory, so the first `route.json` (`headCommit` `63d7acae`) was made for another tree, which the route gate of `make review` refuses. The stale `route.json` was deleted (`9532d527`) and the change routed again; committed unedited as `6372755a`. Result: "route: elevated (lines, contracts), rule version 2", features 807 lines and 12 files (before: 803 and 12); the same reviewer plan; shadow `jev-1.14.0` agrees (P(third) 0.70) |

<!-- make record: begin -->
<!-- make record: end -->

## Independent review

Not yet run. The brief assigns pass 1 to reviewer A `codex gpt-6-astra#medium`, pass 2 to reviewer B `claude claude-opus-5-5#medium`, and pass 3, only after a pass 2 with a Medium or worse finding, to reviewer A `codex gpt-6.1-sol#medium`, at most three passes and stopping at a Low-only pass (governance, policy version 8). Unreviewed fixes go to the coordinator by commit for the architect check before the archive.

## Limitations

- Nothing calls the new paths outside tests: the control plane's placement service passes no slot request (12d), and no relay applies a session's `limit` event (item 18).
- The default cooldown is passed by the caller; no installation setting stores it (design, question Q2).
- A limit is keyed by the assignment and applied whatever the reservation's or the slot's state (design, questions Q3 and Q4); a reported reset is not bounded (Q5); rereads stop after three applications (Q6).
- The race "a limit racing a placement that selects its slot commits only in a serial order" accepts either serial order and checks the one that ran; which order runs depends on the database, so a single run covers one of its two branches.
- Usage reports and authentication failures are not applied (Q1).

## Remaining gates

- The coordinator's answers to the design's questions Q1 to Q6, and any change they require.
- Review passes 1 and 2, and pass 3 if pass 2 reports a Medium or worse finding.
- The coordinator's architect check of any unreviewed fixes.
- The archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
