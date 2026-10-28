# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki) for the change `improve-jev-route-request`, size M, commit type `chore`: scope items 1 to 7 as [design.md](design.md) "Decisions" D1 to D7 implement them. They cover one `noul` question `third` with criteria from governance "Conditional third pass", a `context` with leave-one-out reference rates, the redacted and clipped proposal `content`, the `touches` flags removed from the request, `THIRD_PASS_THRESHOLD` 0.4, Jev kept shadow-only, and the Brier score and AUC of P(third) in `effect` and `route-evaluation`. Out of scope: an ablation option, rule v1, routed effort, and other review process changes.

- **Base revision:** `1234e540` (`origin/dev`, merge of pull request #399).
- **Implementation:** `4e5738a1`: the scripts, schema, protocol text, tests, fixture, and this change's proposal, design, spec delta, tasks, and `checklist.json`. `32c920a9` commits `route.json` unedited, from `make findings ARGS="route --change improve-jev-route-request"` on the clean tree of `4e5738a1`. It recorded tier `elevated` (triggers `lines`, `files`; 1,090 lines in 22 files), rule version 1, recommending `codex gpt-6.1-sol#high` and `claude claude-opus-5-5#xhigh`. The shadow router `jev-1.14.0`, asked with the new request, answered P(third) 0.80 at threshold 0.4, tier `elevated`, in 267 ms, and agreed. The brief's reviewers and efforts stand (governance "Routed effort").
- **Coordinator decisions:** on 2026-10-28 the coordinator approved, as architect decisions, the full-archive leave-one-out reference rates, the exclusion of several-artifact changes from them (design.md D2), and redaction before clipping (D3); design.md "Risks" records the threshold re-tuning.
- **Checklist:** saved with the brief's invocation, `--at 1234e540009aa623ed24c5a278de2fdf81f5aaf0 --size M`.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64 iMac), Node.js 24.22.1 from `.nvmrc`. `JEV_MAF_LAB` was set in the environment; it was checked only by presence.

## Author self-check

- **Scope.** Rule v1 (`scripts/review-route-rules.ts`, the trigger thresholds, the reviewer table) is unchanged; `route.json` still records `touches` in `features`. Nothing routes on the shadow answer, and no routed effort is added.
- **Request.** `shadowState` sends `context`, `linesChanged`, `filesChanged`, `capabilities`, `externalFacts`, `size`, `capabilityHistory`, and `content`; `jevRequestBody` asks only `third`. The criteria were the brief's text verbatim; after review pass 1 the false criterion is the coordinator's wording of 2026-10-28 (see "Review pass 1").
- **Compatibility.** The 11 archived `route.json` files and the archived `evaluation.jsonl`, which hold the earlier answer shape, stay valid (`make findings ARGS="validate"`: 12 route files valid, this change's included).
- **Spec.** The modified and added requirements have 463, 483, and 358 characters; `npm run verify:archive` archives the change into strictly valid specs.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `chore` and `docs`, without attribution.

## Evidence check

- **Live answer shape.** The constructed fixture follows `NoulAnswer` of `https://api.typesafe.ai/openapi.json` (`info.version` 0.2.0, read 2026-10-28). The live route of `32c920a9` parsed as `answered`, so the live response had that shape; its body was not stored.
- **Reference rates.** At `1234e540`, `referenceRates` counts 70 single-artifact reviewed changes, 49% with a third pass, and by band 13% of 23, 39% of 18, and 80% of 20 (computed offline with the module on the git environment; design.md D2). The experiment's reference was 32% over its 50 lines.
- **Credential absence.** Counted with `grep -cF` on the variable's value, printing only counts: 0 in `route.json`, 0 in the route run's output (`/private/tmp/claude-503/-Users-petarnenov-taskelith/04759add-0e0e-434a-a407-5bdae2048b83/scratchpad/route-run.log`), 0 in each `make verify` log (`/private/tmp/claude-503/-Users-petarnenov-taskelith/04759add-0e0e-434a-a407-5bdae2048b83/scratchpad/verify-1.log` and `verify-2.log` beside it), 0 in the fail-before log, and no tracked file at `HEAD` contains it (`git grep -cF`).
- **Links.** The records link only inside the change directory or root-relative; `npm run verify:links` passes.

## Fail-before

The new tests' assertions on the request were run against the scripts of `1234e540` (`git archive` into `/private/tmp/claude-503/-Users-petarnenov-taskelith/04759add-0e0e-434a-a407-5bdae2048b83/scratchpad/old`, with a scratch test `test/fail-before.test.ts` there; log `/private/tmp/claude-503/-Users-petarnenov-taskelith/04759add-0e0e-434a-a407-5bdae2048b83/scratchpad/fail-before.log`): 3 of 3 failed. The old state held `touches`, its questions were `tier` and `passes`, and it had no `context` or `content`. With the change, `test/review-route-jev.test.ts` "the request state carries no touches flags" and its neighbors pass.

## Checks

- `node --experimental-strip-types --test test/review-route*.test.ts test/findings-route.test.ts` before the commit: 184 of 184 passed.
- `npm run openspec -- validate improve-jev-route-request --strict`: `Change 'improve-jev-route-request' is valid`.
- `make verify` on the clean tree of `32c920a9` passed on its first run, no rerun. After the coordinator decisions, `make verify` on the clean tree of `23d30381` passed on its first run, no rerun (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/04759add-0e0e-434a-a407-5bdae2048b83/scratchpad/verify-2.log`); the generated part below records it.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `2023d48e02a0a0aff8ed2909a99ae21291925e5b`; tests 3340, pass 3325, fail 0, skipped 15; all files 99.47% lines, 92.67% branches, 99.06% functions.
- `npm run openspec -- validate improve-jev-route-request --strict`: passed, `Change 'improve-jev-route-request' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 76 file(s); every pass summary file is valid: 56 file(s); every route file is valid: 12 file(s).`.
- Spec diff against the merge base `1234e540009a` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a1837a-ac3f-7181-9293-d3a23ffbb5b0` | 0 | 1 | 1 | 0 |
<!-- make record: end -->

## Limitations

- No response to the new question is stored; the test fixture is constructed from the OpenAPI document (design.md D8).
- The reference rates now count the changes archived after the experiment, so the base rate (49%) is higher than the experiment's (32%), and most changes may be shadow-elevated at 0.4. The coordinator approved keeping these rates on 2026-10-28; the threshold is re-tuned at the re-evaluation (design.md "Risks").
- Changes without a recorded `route.json` or evaluation line count in the overall rate but in no lines band.
- Redaction covers whole PEM private key blocks, the finding validator's secret patterns, and runs of 40 or more token characters; a shorter secret of another shape would be sent.

## Remaining gates

- Independent review passes 1 and 2 (pass 3 only as governance "Conditional third pass" requires) by the coordinator-assigned reviewers.
- Re-evaluation of Jev: after 30 to 40 new changes have been routed with this request and archived, the owner decides to keep or drop Jev from the `effect` report's P(third) Brier score and AUC (design.md D7).
- Integration into dev by the coordinator (single pull request)

## Review pass 1

Reviewer A, Codex CLI `codex gpt-6.1-sol#medium`, session `01a1837a-ac3f-7181-9293-d3a23ffbb5b0`, started 2026-10-28T17:06:56.869Z. `make review CHANGE=improve-jev-route-request PASS=1 ROLE=A REVIEWER='codex gpt-6.1-sol#medium' PROMPT=<scratch> LOG=<scratch>` ran `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C <worktree> -` with the environment `PATH`, `HOME`, `USER`, `LANG`, `TERM`, and `TMPDIR`; the header reported model `gpt-6.1-sol`, effort `medium`, and sandbox `read-only`. Route gate: `route.json` was made for this tree and recommends effort `high`; the authorized `medium` applied (policy version 7). The worktree snapshot was `8b8e1ba849bec92ad0153625341f2e151cb16b5ed910e156659c81224504cb62` before and after. Findings: 0 Critical, 1 High, 1 Medium, 0 Low, both fixed in `e6e35714`. The reviewer noted that its sandbox blocked the 3 local HTTP server tests (`listen EPERM`); `make verify` runs them.

- **H1 (redaction).** `SECRET_PATTERNS` matches only the header line of a PEM private key, and the run pattern only runs of 40 or more token characters, so a key with shorter base64 lines, for example 32 characters, kept its body in the content sent to TypeSafe. `redactedExcerpt` now first replaces the whole block (`PEM_BLOCK` in `scripts/review-route-jev.ts`), through its end line or, without one, to the end of the text, before the other patterns and the clip. New tests cover 32-character body lines, standard 64-character lines, and a truncated block without an end line. `SECRET_PATTERNS` is unchanged, so the findings validation that tests values against it behaves as before; design.md D3 says so.
- **M1 (contract-drift).** The false criterion described only a pass 2 with Medium or Low findings and missed a clean pass 2 and a review ending after a Low-only pass, which governance "Conditional third pass" allows. By the coordinator's architect decision of 2026-10-28 (the earlier sentence was the coordinator's, not the owner's) it is now "No third pass will be needed: the review ends after a Low-only pass, or pass 2 finds no Critical or High issue and its fixes, if any, touch only records and documentation."; the true criterion is unchanged. The test and design.md D1 follow; D1 records that the wording changed after the experiment and that the re-evaluation gate after 30 to 40 changes (D7) covers any calibration shift. `route.json` stays as recorded, because later passes do not route.
