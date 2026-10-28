# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki) for the change `record-the-review-sequence`, size M, commit type `chore`, from the owner's review sequence decision of 2026-10-28 and the owner's confirmation of the wide scope the same day. Scope items 1 to 6, as [design.md](design.md) D1 to D9 implement them: governance policy version 8 with "Review sequence", its assignment, replacement, cap, and architect check; the protocol, `AGENTS.md`, and the three skills; the key `claude claude-opus-5-5#medium`; per-pass route defaults (rule version 2) and `ROLE` defaulted from `PASS`; roles kept by pass; and the Jev criteria. Out of scope: routed effort, which stays unauthorized, any other process lever, and `docs/fleet.md`.

- **Base revision:** `aff291bb` (`origin/dev`, merge of pull request #403).
- **Coordinator decisions:** Q1 to Q6 of 2026-10-28 (Niki, as architect): N1 for network tasks, R1 for the roles, rule version 2 with a schema `oneOf` by version, P2 for pass 3, efforts keyed per pass, and opus at `medium` with `#high` kept (design.md D2 to D8).
- **Implementation:** `fbea70a4`: the scripts, schemas, governance, protocol, `AGENTS.md`, skills, tests, and this change's proposal, design, spec delta, tasks, and `checklist.json`. `5216cde6` commits `route.json` unedited, from `make findings ARGS="route --change record-the-review-sequence"` on the clean tree of `fbea70a4`. It recorded tier `elevated` (triggers `lines`, `files`; 458 lines in 21 files), rule version 2, recommending `codex gpt-6-astra#high`, `claude claude-opus-5-5#xhigh`, and `codex gpt-6.1-sol#high` for pass 3. The shadow router `jev-1.14.0`, asked with the new criteria, answered P(third) 0.80 at threshold 0.4, tier `elevated`, in 274 ms, and agreed. The brief's reviewers and efforts stand (governance "Routed effort").
- **Checklist:** saved with the brief's invocation, `--at 0d15b095642e331fe47cd82c5d959bdc3ac09d2c --size M`, before this branch was created from `aff291bb`.

## Environment

macOS (Darwin 25.6.0), Node.js from `.nvmrc` through nvm.

## Author self-check

- **Scope.** No routed effort is authorized: the `elevated` efforts (pass 1 `high`, pass 2 `xhigh`, pass 3 `high`) stay recommendations, and `make review` still prints that the authorized effort applies. `docs/fleet.md` is untouched. Jev stays shadow-only at threshold 0.4.
- **One rule.** After the pass 1 fixes (`e05565aa`), `git grep -n -i -E "conditional third pass|alternating|reviewers A and B|reviewer A for passes" -- . ':!openspec/changes/archive/' ':!openspec/changes/record-the-review-sequence/'` finds only: governance's history in "Policy version" (line 3), in "Review sequence" ("replacing version 5's ...", line 31), and in "Tasks during the change to version 8" (line 46, the rule of versions 5 to 7); `openspec/specs/review-process/spec.md` lines 8, 28, 410, 414, 424, 474, and 534, which this change's delta renames or replaces at archive, line 4, the Purpose, which a delta cannot change (see "Follow-ups"), and line 185, the history requirement "Changes under the one-reviewer rule"; and the unrelated test constant `ALTERNATING` (`apps/control-plane/test/placement-service.test.ts` lines 372, 385, 393, and 401). Before pass 1 the search also found the UI proof of concept's Reviews badge and its README, which this record missed (pass 1 finding 2). The scripts' messages name the pass and role, not alternating reviewers.
- **Compatibility.** Rule version 1 keeps its reviewer table and thresholds; the archived `route.json` files validate (`make findings ARGS="validate"`, see "Generated checks"), and `test/review-route-record.test.ts` "a record of rule version 1 with two pass plans stays valid" checks a version 1 record against the new schema.
- **Roles.** `finding.schema.json` and `pass.schema.json` keep `A` and `B`; only the role description changes. No archived record is edited.
- **Spec.** The modified and added requirements have at most 496 characters; `npm run verify:archive`, which `make verify` runs, archives the change into strictly valid specs. Every scenario of each modified requirement keeps its name, as the pinned OpenSpec requires.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `chore`, without attribution.

## Evidence check

- **External facts.** None; the change depends on no external page.
- **Links.** The records link only inside the change directory or root-relative; `npm run verify:links` passes.

## Fail-before

The changed and new test files were run against the scripts of `aff291bb` (`git archive` into `/private/tmp/claude-503/-Users-petarnenov-taskelith/0427c315-6988-45ca-8b27-69ae57925400/scratchpad/old`, log `/private/tmp/claude-503/-Users-petarnenov-taskelith/0427c315-6988-45ca-8b27-69ae57925400/scratchpad/fail-before.log`): 121 tests, 17 failed. They include "the table holds the nine authorized reviewers, opus at medium and high", "the reviewer table of rule version 2 plans the review sequence", "an empty ROLE defaults to the role of the pass", "make review takes no ROLE and defaults it from PASS", "the request sends the pinned model and the one third pass question", "the route recommends the reviewer that its plans name for pass 3", and "the pass plan count must match the rule version". "a record of rule version 1 with two pass plans stays valid" passed before and after, as a regression guard. With the change all of them pass.

## Checks

- `node --experimental-strip-types --test test/review-route*.test.ts test/findings-route.test.ts test/review-run.test.ts test/reviewer-invocations.test.ts test/findings.test.ts` before the commit: 258 of 258 passed.
- `npm run openspec -- validate record-the-review-sequence --strict`: `Change 'record-the-review-sequence' is valid`.
- `make verify` on the clean tree of `5216cde6` passed on its first run, profile full, no rerun (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/0427c315-6988-45ca-8b27-69ae57925400/scratchpad/verify1.log`).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4a504f7a4bd7dda505e9ca98fb3ddcc801019241`; tests 3481, pass 3472, fail 0, skipped 9; all files 99.39% lines, 92.66% branches, 98.92% functions.
- `npm run openspec -- validate record-the-review-sequence --strict`: passed, `Change 'record-the-review-sequence' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 80 file(s); every pass summary file is valid: 60 file(s); every route file is valid: 16 file(s).`.
- Spec diff against the merge base `aff291bbfb41` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a183ec-253d-7343-9562-cd4589026abd` | 0 | 0 | 0 | 2 |
<!-- make record: end -->

## Review

### Pass 1

Reviewer A: Codex CLI, `codex gpt-6-astra#medium`, the brief's reviewer of pass 1, on `df1f1c4c`, invoked as `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`, started 2026-10-28T19:10:53Z, session `01a183ec-253d-7343-9562-cd4589026abd`. The reviewer's header reported model `gpt-6-astra`, effort `medium`, and sandbox `read-only`. The worktree snapshot was `28e36b6c064181059b17f539d83050d63fd773ac4e669ca91ad462daa1dba07d` before and after the pass. Counts: Critical 0, High 0, Medium 0, Low 2, recorded in `findings.jsonl`. The pass is Low-only, so it ends the review under governance "Review sequence": both findings are fixed without another pass and are `fixed-unreviewed`.

1. **Low, docs, UI badge.** `docs/ui-poc/src/screens/Reviews.tsx:306` showed `Reviewers A and B per task`, and `docs/ui-poc/README.md:61` quoted it as current. Fixed in `e05565aa`: the badge reads `Assigned reviewer per pass`, and the README quotes it, keeping the note that the published version 7 build predates the badge changes; nothing is republished.
2. **Low, evidence mismatch.** The "One rule" self-check claimed that the stale wording search found only history, the replaced spec, and a test constant, though it also found finding 1's places, so task 4.3 was ticked too early. Fixed in this record: the search was rerun after finding 1, and "One rule" records its exact exclusions and every match.

### Unreviewed fixes

No later pass reviews these fixes; each is marked unreviewed for the coordinator's architect check (governance "Architect check of unreviewed fixes").

1. Pass 1 finding 1 (`e05565aa`): `docs/ui-poc/src/screens/Reviews.tsx:306` and `docs/ui-poc/README.md:61`.
2. Pass 1 finding 2: the "One rule" self-check of this record.
3. Coordinator decision U1 (`e05565aa`): `docs/governance.md:46`, "Tasks during the change to version 8": the owner's decision of 2026-10-28 applies from that decision, not from version 8 reaching `dev`; a task whose pass 1 ran before it finishes under the rule of versions 5 to 7, and a task briefed on or after it follows "Review sequence". The spec delta and the protocol are unchanged, because they refer to governance for the rule in force.
4. Worker finding U3 (`e05565aa`): `make review` printed `the authorized medium applies (policy version 7)` for this change's own pass 1, under policy version 8. `scripts/review-run.ts:34` adds `GOVERNANCE_POLICY_VERSION = 8`, used by the recommendation at line 260, and the comments at lines 40 and 245 to 246 no longer name a version. `test/review-run.test.ts` expects `(policy version 8)`, and the new test "the policy version that make review names is the governance one" compares the constant with the "Policy version" line of `docs/governance.md`. Fail-before: with the scripts of `df1f1c4c` and the changed expectations, the recommendation test failed (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/0427c315-6988-45ca-8b27-69ae57925400/scratchpad/fail-before-u3-regex.log`, 25 of 26 passed); with the new test as well, the file failed to load on the missing export (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/0427c315-6988-45ca-8b27-69ae57925400/scratchpad/fail-before-u3.log`). With the fix, 27 of 27 tests of `test/review-run.test.ts` pass.
5. Coordinator-approved badge fix (`bd778b9e`): `docs/ui-poc/src/screens/Reviews.tsx:309` reads `After pass 3: fixes checked by the architect` instead of `After pass 3 the owner decides open Critical, High, Medium`; `docs/ui-poc/README.md` does not quote that badge.

Architect check (Niki, 2026-10-28): unreviewed fixes e05565aa (F1, F2, U1, U3) and bd778b9e (pass 3 badge) checked and accepted; no later review.

## Limitations

- The `effect` routing section still compares only the reviewers of passes 1 and 2 with the route (design.md "Risks").
- The Jev reference rates come from records reviewed under the conditional third pass rule (design.md D9).
- This change's own review is the first under the new sequence; it ended with the Low-only pass 1.

## Follow-ups

- The Purpose of `openspec/specs/review-process/spec.md` still says "two alternating reviewers per change"; a delta cannot change a Purpose, so a spec-maintenance change updates it.
- `make findings ARGS="effect"` compares only the reviewers of passes 1 and 2 with the route when it reports whether a review followed the route; pass 3 is not compared.

## Remaining gates

- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
