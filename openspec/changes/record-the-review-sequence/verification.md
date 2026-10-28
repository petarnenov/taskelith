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
- **One rule.** `git grep -n -i -E "conditional third pass|alternating|reviewers A and B|reviewer A for passes"` outside `openspec/changes/archive/` and this change finds only governance's history in "Policy version" and in "Review sequence" ("replacing version 5's ..."), the living spec text that this change's delta replaces at archive, and one unrelated test constant (`apps/control-plane/test/placement-service.test.ts`). The scripts' messages name the pass and role, not alternating reviewers.
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

- `make verify`: passed, profile full, tree `4e6d49dacec91ed787c1b7147dcba710e51ff901`; tests 3480, pass 3471, fail 0, skipped 9; all files 99.39% lines, 92.67% branches, 98.92% functions.
- `npm run openspec -- validate record-the-review-sequence --strict`: passed, `Change 'record-the-review-sequence' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 80 file(s); every pass summary file is valid: 60 file(s); every route file is valid: 16 file(s).`.
- Spec diff against the merge base `aff291bbfb41` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The `effect` routing section still compares only the reviewers of passes 1 and 2 with the route (design.md "Risks").
- The Jev reference rates come from records reviewed under the conditional third pass rule (design.md D9).
- No review under the new sequence has run yet; this change's own review is its first.

## Remaining gates

- Independent review passes 1 to 3 of the review sequence, as the coordinator assigns them.
- Architect check by the coordinator of every fix that no later pass reviews.
- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
