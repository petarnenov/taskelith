# Verification

Record of the change through review pass 3, the last pass; the review found no open findings (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28) for G3 item 17 (`docs/g3-plan.md`, row 17). Size M.
- **Base revision:** `a899d5d2` (`origin/dev`, merge of pull request #382).
- **Merge of dev:** `origin/dev` `f3a53f17` (merge of pull request #383, `adopt-process-performance-recommendations`) merged into the branch with merge commit `1206034c`, without conflicts. After review pass 1, `origin/dev` `9196804b` (pull requests #384, `fix-make-argument-expansion`; #385, `route-reviewers-by-change-complexity`, governance policy version 7; #386, `define-session-turn-model`) merged with merge commit `08677e80`, without conflicts.
- **Revision verified:** `56a63b3b` before review pass 1: the specs, the contract, and the AsyncAPI document (`454a056d`), then the domain, the conformance suite, and the tests (`56a63b3b`). After the merge of dev `9196804b` and the pass 1 fix (`ef9b0d27`): `e1fca2ec`, tree `ea31edaa`. After the pass 2 fixes: `e578bfd5`, tree `d8e84155` ("Checks and results").
- **Scope:** head-bound SDLC gates and gate evidence; the code head owned by the SDLC module and refined by the workspace module (design decision 1); staleness for a new code head; no restored approval after an artifact edit; rejection of evidence from another head; the SDLC AsyncAPI document 0.4.0; a head-bound gate in the gate repository suite; the Git workspace contract sections 5 and 14.
- **Out of scope:** the review and verification stages (item 21), auto-merge (item 23), the SCM plugin (item 20), the UI, and the evidence record's `codeRevision` and the merge queue's `CodeHead` (design decision 1 (i), chosen by the coordinator: the follow-up change `align-code-head-names`).

## Environment

The owner's 2020 Intel iMac: macOS 26.6.2 (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm.

## Author self-check

- **Contract first.** `454a056d` holds the proposal, the design, `checklist.json` saved with the brief's invocation, the three spec deltas, the AsyncAPI document, and the Git workspace contract, before the code commit `56a63b3b`.
- **Spec deltas,** as of the pass 2 fixes: added `sdlc-gates` "Head-bound gates" (350 characters), "Evidence bound to its gate and generation" (261), "Evidence bound to the code head" (348), "Invalidation by a new code head" (321), "Approval not restored by an artifact edit" (310); `sdlc-workflow-model` "Code-head identity" (364); `sdlc-wire-contracts` "Code head on the wire" (407); and modified `sdlc-gates` "Gate transitions" (378), copied from the living text of `9196804b` with only the WHEN of its scenario "Reopening a gate" changed (review pass 2, M1). Before pass 1 all were added requirements; the counts of each round are in "Pass 1 fixes" and "Pass 2 fixes".
- **Scenarios and tests.** "Reopen without a code head" and "Edit reverted": `an artifact edit, even one that restores the content, does not restore an approval`; "Evidence from another head": `evidence from another code head is rejected`; "Gate without a code head": `a gate without a code head ignores code heads`; "New head after approval": `a new code head makes head-bound evidence stale`; "Same head": `a head-bound gate keeps a copy of its head through other changes`; "Same tree, other commit": `isSameCodeHead needs the repository, the commit, and the tree to match`, all in `packages/modules/sdlc/test/code-head-binding.test.ts`; "Head-bound gate event": `a head-bound gate and its evidence carry the full code head on the wire` in `packages/contracts/test/contracts.test.ts`.
- **Architecture.** The SDLC module still depends only on the kernel and names no VCS: its code head has opaque `CodeObjectId` names; the workspace module, which already depends on the SDLC module, refines them as `GitObjectId`. No workspace export changes its name. `npm run check:boundaries` passes.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `chore`: only private packages (`@taskelith/sdlc`, `@taskelith/workspace`, `@taskelith/contracts`) and documents change; the published `taskelith` package does not.

## Checks and results

Author checks, run on `56a63b3b` and its working tree:

- `npm run openspec -- validate bind-evidence-to-code-head --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run build`: passed.
- `npm run check:boundaries` (type check of sources, tests, and scripts, and the boundary check): passed.
- `npm run verify:comments`, `npm run verify:links`, `npm run verify:archive`: passed.
- `make findings ARGS="validate"`: 59 findings files and 39 pass summary files valid.
- `node --experimental-strip-types --test 'packages/modules/*/test/*.test.ts' packages/contracts/test/*.test.ts`: 786 tests, 785 pass, 0 fail, 1 skipped.
- Coverage of `packages/modules/sdlc/dist/domain/*.js` over `packages/modules/sdlc/test/*.test.ts` with `--experimental-test-coverage`: `code-head.js` and `gate.js` 100% lines, branches, and functions.
- `make contract-compatibility`: the SDLC AsyncAPI document has 132 breaking changes against `a899d5d2`, declared by 0.4.0; the other documents have none; it passed. The author ran it before noticing that it starts the `oasdiff` image with `docker run --network none` for the two OpenAPI documents, outside the brief's rule of no Docker command; it is part of `make verify` and runs again there. The coordinator (Niki, 2026-10-28) accepted that container.
- `make verify` after the merge of dev, on `5657fbc6` (tree `b91b0e27`), ended 08:42 local, 2026-10-28: passed, profile full, stamp written; 45 suites, tests 2658, pass 2651, fail 0, cancelled 0, skipped 7; coverage 99.36% lines, 92.52% branches, 99.06% functions. `make test` took the Docker slot itself; the head-bound gate of the gate repository suite passed against PostgreSQL in it (`PostgreSQL gates: gates read back as stored and are listed by their run`). `make record` wrote "Generated checks" from its log, and `make record-check` passed.

- `make findings ARGS="route --change bind-evidence-to-code-head"` on `ef9b0d27`, committed unedited as `route.json` in `19fdd475`. The route record arrived with governance policy version 7 in the merge of dev `08677e80`, after review pass 1, so it ran before the `make verify` of the pass 1 fixes instead of before pass 1. Output: `route: elevated (lines, capabilities, contracts), rule version 1`; pass 1, reviewer A: `codex gpt-6.1-sol#high`; pass 2, reviewer B: `claude claude-opus-5-5#xhigh`; shadow `jev-1.14.0` elevated (0.98), agreeing with the rule. It is a recommendation only.
- `make verify` after the pass 1 fix, on `19fdd475` (tree `b47faba3`): passed, profile full; tests 2903, pass 2896, fail 0, skipped 7. Its `make contract-compatibility` reported 219 breaking changes of the SDLC AsyncAPI document against `9196804b`, declared by 0.4.0, which made design decision 7's count stale; `e1fca2ec` updated it, and `make verify` ran again.
- `make verify` on `e1fca2ec` (tree `ea31edaa`), ended 11:38 local, 2026-10-28: passed, profile full, stamp written; 45 suites, tests 2903, pass 2896, fail 0, cancelled 0, skipped 7; coverage 99.37% lines, 92.66% branches, 99.08% functions; 219 breaking changes of the SDLC AsyncAPI document against `9196804b`, declared by 0.4.0; the head-bound gate of the gate repository suite passed against PostgreSQL (`PostgreSQL gates: gates read back as stored and are listed by their run`). `make record` wrote "Generated checks" from its log.
- `make verify` after the pass 2 fixes, on `e578bfd5` (tree `d8e84155`), ended 12:07 local, 2026-10-28: passed, profile full, stamp written; 45 suites, tests 2908, pass 2901, fail 0, cancelled 0, skipped 7; coverage 99.37% lines, 92.68% branches, 99.08% functions; 306 breaking changes of the SDLC AsyncAPI document against `9196804b`, declared by 0.4.0, as the breakdown in "Breaking changes of the SDLC AsyncAPI document" counts them; the gate repository suite passed against PostgreSQL (`PostgreSQL gates: gates read back as stored and are listed by their run`). `make record` wrote "Generated checks" from its log. No fresh route record: the protocol routes once, before pass 1 (worker step 4).

## Fails before the change

- With `packages/modules/sdlc/src` and `packages/modules/workspace/src` of `a899d5d2` restored and built, `code-head-binding.test.ts` fails to load: `The requested module '@taskelith/sdlc' does not provide an export named 'isGateOutdatedByCodeHead'` (0 pass, 1 fail). The sources were restored afterwards.
- A probe on that base build, with the base API only, showed each gap: a gate opened with a `codeHead` that is approved stays passed after a new head, because `markGateStale` with the unchanged specification is rejected and nothing else marks it; after a specification edit and its revert, `reopenGate` and the superseded approval pass the gate again; and an approval at another head passes the gate. On `56a63b3b` the same probe stops at `reopenGate`, which refuses the head-bound gate.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `d8e84155d11ebdc4fb225eb090c97661a4c3d6c1`; tests 2908, pass 2901, fail 0, skipped 7; all files 99.37% lines, 92.68% branches, 99.08% functions.
- `npm run openspec -- validate bind-evidence-to-code-head --strict`: passed, `Change 'bind-evidence-to-code-head' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 63 file(s); every pass summary file is valid: 43 file(s); every route file is valid: 2 file(s).`.
- Spec diff against the merge base `9196804b89c6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18144-6e30-7fd3-b8e6-1788fa5b1766` | 0 | 1 | 0 | 0 |
| 2 | B | `claude claude-opus-5-5#high` | `c3aae8d2-0f3a-49f9-a676-1d81016d7b40` | 0 | 0 | 3 | 7 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a181fd-23d2-7ab0-bb97-773ed00e5953` | 0 | 0 | 0 | 0 |
<!-- make record: end -->

## Independent review

Reviewer A, passes 1 and 3: Codex CLI (`gpt-6.1-sol`); reviewer B, pass 2: Claude Code (`claude-opus-5-5`).

### Review pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, session `01a18144-6e30-7fd3-b8e6-1788fa5b1766`; run by the coordinator.
- **Revision reviewed:** `cf335fe8`, before the merge of dev `9196804b`.
- **Invocation:** `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** model, reasoning effort, read-only sandbox, and session ID in the output header, as the coordinator reported them.
- **Snapshot:** before and after the pass identical, as the coordinator reported it.
- **Result:** Critical 0, High 1, Medium 0, Low 0, as in `passes.jsonl` line 1 and `findings.jsonl` line 1. File lines are those of `cf335fe8`.
- **H1, contract-drift** (`packages/modules/sdlc/src/domain/gate.ts:105`, `reopenGateAtCodeHead` at line 148): a superseded approval could pass a head-bound gate again. Approved at head A, made stale by an artifact edit, reopened with the original subject at A, the gate accepted the old approval and passed; the same held after a new head B made it stale and the gate was reopened at A. The check compared only the subject and the code head, so it could not tell evidence of an earlier decision from new evidence, against `sdlc-gates` "Approval not restored by an artifact edit"; `code-head-binding.test.ts:86` covered only a reopening at a third commit. Resolution: see "Pass 1 fixes".

### Pass 1 fixes

Reviewed by reviewer B in pass 2, which found the fix correct for a single gate.

- **H1 fix** (`ef9b0d27`, design decision 8): the three evidence kinds take an optional `gateGeneration`, the generation of the pending gate they were recorded for, and `recordGateEvidence` rejects evidence for a head-bound gate whose `gateGeneration` is not the gate's generation, or is missing, with `precondition-failed` (`accepts only evidence recorded for its current generation`). A gate turns pending only when opened or reopened, at a new generation, so a superseded approval names an earlier generation. The SDLC AsyncAPI document 0.4.0 adds `gateGeneration` to the three evidence kinds; the spec deltas `sdlc-gates` "Evidence bound to the code head" (402 characters, new scenario "Evidence for another generation") and "Approval not restored by an artifact edit" (306, new scenario "Reopened at the approved head") and `sdlc-wire-contracts` "Code head on the wire" (365), the Git workspace contract section 14, the gate repository suite, and the contracts test change with it. Files: `packages/modules/sdlc/src/domain/gate.ts`, `gate-evidence.ts`, `src/ports/repository-conformance.ts`, `test/code-head-binding.test.ts`, `packages/contracts/documents/sdlc.asyncapi.json`, `packages/contracts/test/contracts.test.ts`, `docs/contracts/git-workspace.md`, and this change's proposal, design, tasks, and spec deltas.
- **Tests.** In `packages/modules/sdlc/test/code-head-binding.test.ts`: `a superseded approval does not pass a gate reopened at its head after an artifact edit` and `a superseded approval does not pass a gate reopened at its head after another head` (scenario "Reopened at the approved head"; the second also covers a return to the approved head after an approval at the other head), and `a head-bound gate needs evidence recorded for its current generation` (scenario "Evidence for another generation").
- **Fails before the fix.** With the test file of the fix on `767cf592` (the sources before the fix), after `npm run build`, `node --experimental-strip-types --test packages/modules/sdlc/test/code-head-binding.test.ts`: tests 10, pass 7, fail 3, the three new tests, each because recording the superseded or unbound approval succeeded (`actual: true`, `expected: false` on `result.ok`). After the fix: tests 10, pass 10.
- **Author checks after the fix,** on its working tree: `npm run build`, `npm run check:boundaries`, `npm run verify:comments`, `npm run verify:links`: passed; `npm run openspec -- validate bind-evidence-to-code-head --strict`: valid; `node --experimental-strip-types --test 'packages/modules/*/test/*.test.ts' packages/contracts/test/*.test.ts`: tests 875, pass 874, fail 0, skipped 1; coverage of `packages/modules/sdlc/dist/domain/*.js` over the SDLC tests: `code-head.js`, `gate-evidence.js`, and `gate.js` 100% lines, branches, and functions.

### Review pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, session `c3aae8d2-0f3a-49f9-a676-1d81016d7b40`; run by the coordinator.
- **Revision reviewed:** `ca72039c`, which includes the pass 1 fix `ef9b0d27`.
- **Invocation:** `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** `claude-opus-5-5` in the `modelUsage` and the session ID in the last `"type":"result"` line of the log.
- **Snapshot:** before and after the pass identical; the reviewer changed no file.
- **Result:** Critical 0, High 0, Medium 3, Low 7, as in `passes.jsonl` line 2 and `findings.jsonl` lines 2 to 11. File lines are those of `ca72039c`. The reviewer found the pass 1 fix correct for a single gate.
- **M1, contract-drift** (`openspec/specs/sdlc-gates/spec.md:26`): the living "Gate transitions" scenario "Reopening a gate" lets any failed, stale, or blocked gate reopen with a subject, while `reopenGate` now refuses a head-bound gate; the delta only adds requirements, so both would hold after archive.
- **M2, contract-drift** (`packages/modules/sdlc/src/domain/gate.ts:202`): evidence names no gate, and every gate opens at generation 1, so an approval for gate X at a head passes a new gate Y with the same kind, subject, and head, and one approval passes two parallel gates.
- **M3, scope** (`gate.ts:202`): exempting gates without a code head from the generation binding extended the coordinator's decision about the head; for such a gate an artifact edit, `markGateStale`, a revert, and `reopenGate` with the old subject still let the old approval pass.
- **Low:** L1 (`gate-evidence.ts:150`), `parseEvidenceFacts` does not validate `gateGeneration` or `codeHead.repository`; L2 (`sdlc.asyncapi.json:896`, `:987`), `GateReopened` says a head-bound gate reopens only for a new code head; L3 (delta `sdlc-gates/spec.md:41`), "Edit reverted" does not name the reopened generation; L4 (`docs/contracts/git-workspace.md:247`, `:235`), the naming follow-up is called a recommendation and not named, and the item 17 pending entry is unchanged; L5 (`verification.md:21`), character counts from before the pass 1 fix; L6 (`code-head-binding.test.ts:104`), a `markGateStale` call refused only by the state machine; L7 (`code-head-binding.test.ts:181`), the transition check before the head binding is untested.
- **Resolutions:** see "Pass 2 fixes".

### Pass 2 fixes

Reviewed by reviewer A in pass 3, which found them fixed ("Review pass 3").

- **M2 and M3 fix** (`82783edd`, design decision 8 with the coordinator's decisions after pass 2): the three evidence kinds take an optional `gateId` as well as `gateGeneration`, and `recordGateEvidence` accepts evidence for any gate, with or without a code head, only when `gateId` equals the gate's id (`accepts only evidence recorded for it`) and `gateGeneration` its generation (`accepts only evidence recorded for its current generation`), after the kind, subject, and head checks, otherwise `precondition-failed`. A gate without a code head still accepts evidence at any head or none (design decision 6). The SDLC AsyncAPI document 0.4.0 adds `gateId` (an `Identifier`) to the three evidence schemas. The SDLC and execution repository conformance suites and every test that records evidence name the gate and its generation. Files: `packages/modules/sdlc/src/domain/gate.ts`, `gate-evidence.ts`, `src/ports/repository-conformance.ts`, the SDLC tests `code-head-binding`, `gate-evidence`, `gate`, `stage-progress`, `task-admission`, and `task-admission-service`, `packages/modules/execution/src/ports/repository-conformance.ts`, `packages/modules/execution/test/fixtures.ts`, `packages/contracts/documents/sdlc.asyncapi.json`, and `packages/contracts/test/contracts.test.ts`.
- **L1 fix** (`82783edd`): `parseEvidenceFacts` validates `codeHead.repository` as a `RepositoryId`, `gateId` as a `GateId`, and `gateGeneration` with `parseGeneration`, and fails with `invalid` and the field `codeHead`, `gateId`, or `gateGeneration`.
- **L2 fix** (`82783edd`): the `GateReopened` description and summary say "and a head-bound gate for a subject at a code head".
- **M1, L3, and L4 fixes** (`0fb9d3cf`): a `MODIFIED` "Gate transitions" in the `sdlc-gates` delta, the living text with only the WHEN of "Reopening a gate" changed to name `reopenGate` for a gate without a code head and `reopenGateAtCodeHead` for a head-bound one; the new requirement "Evidence bound to its gate and generation" (scenarios "Evidence for another gate" and "Evidence for another generation"), "Evidence bound to the code head" reduced to the head, "Approval not restored by an artifact edit" for every gate (new scenario "Edit reverted without a code head"), and the THEN of "Edit reverted" naming the reopened generation; `sdlc-wire-contracts` "Code head on the wire" with `gateId`; the Git workspace contract section 13 marks item 17 met for the gates and evidence of `@taskelith/sdlc`, with `codeRevision` and `CodeHead` pending `align-code-head-names`, and section 14 names that follow-up as the coordinator's choice of 2026-10-28. Proposal, design decisions 5, 7, and 8, and tasks change with them.
- **L5 fix** (this record): the author self-check gives the character counts as of the pass 2 fixes.
- **L6 and L7 fixes** (`82783edd`): `an artifact edit, even one that restores the content, does not restore an approval` now makes the passed gate stale with `EDITED_SPEC`, checks the `reopenGate` refusal and a reopening at the approved head, then the path through another head; the new test `reopening checks the transition before the head binding` expects `cannot change from passed to pending` from `reopenGate` and `reopenGateAtCodeHead` on a passed head-bound gate and a passed gate without a code head.
- **Tests and scenarios.** In `packages/modules/sdlc/test/code-head-binding.test.ts`: `an approval for one gate does not pass another gate with the same kind, subject, and head` (scenario "Evidence for another gate": a parallel gate, and a new gate after the first went stale); `every gate needs evidence recorded for it at its current generation` (scenario "Evidence for another generation", with and without a code head); `a gate without a code head does not take a superseded approval after an edit and its revert` (scenario "Edit reverted without a code head"). In `packages/modules/sdlc/test/gate-evidence.test.ts`: `evidence keeps the gate, generation, and code head it was recorded for` and `evidence parsers reject an invalid gate, generation, or code head repository` (L1). "Reopening a gate": `reopenGate replaces the subject and clears the decision and block reason` in `gate.test.ts` and the reopening tests of `code-head-binding.test.ts`.
- **Fails before the fix.** With the new and changed tests in the working tree and the sources of `86364d58` (before the fix), after `npm run build`, `node --experimental-strip-types --test packages/modules/sdlc/test/code-head-binding.test.ts packages/modules/sdlc/test/gate-evidence.test.ts`: tests 21, pass 16, fail 5. The failing tests are the five new tests of M2, M3, and L1: the parallel and later gate, every gate's generation and id, and the revert without a code head because recording the evidence succeeded (`actual: true`, `expected: false` on `result.ok`); `evidence keeps the gate, ...` because the parsed evidence lacked `gateId`; `evidence parsers reject ...` because `gateId: ''` parsed (`actual: false`, `expected: 'invalid'` on the error code). The L6 and L7 tests passed before the fix: they pin behaviour that already held and that the reviewer found untested. After the fix: tests 21, pass 21.
- **Author checks after the fix,** on its working tree: `npm run build`, `npm run check:boundaries`, `npm run verify:comments`, `npm run verify:links`: passed; `npm run openspec -- validate bind-evidence-to-code-head --strict`: valid; `node --experimental-strip-types --test 'packages/modules/*/test/*.test.ts' packages/contracts/test/*.test.ts`: tests 880, pass 879, fail 0, skipped 1; coverage of `packages/modules/sdlc/dist/domain/*.js` over the SDLC tests: `code-head.js`, `gate-evidence.js`, and `gate.js` 100% lines, branches, and functions.

### Breaking changes of the SDLC AsyncAPI document

Owner-approved record requirement: every breaking change that `make contract-compatibility` reports for `packages/contracts/documents/sdlc.asyncapi.json` against the merge base `9196804b` with `origin/dev`, grouped by action, path prefix (the first two path segments), and the changed element. The list comes from the script's own `asyncapiContractChanges` over the `@asyncapi/diff` output of the base and head documents, run by a helper outside the repository; its total equals the count of the script's run, 306, and of the final `make verify` below. The parser dereferences every `$ref`, so one new property counts once in each schema, message, channel message, and operation message that embeds it; for example `gateId` counts 27 times under `/components/schemas`: the three evidence schemas, each embedded by the gate's `decision`, and those again in the event schemas that carry a gate.

| Action | Path prefix | Changed element | Count | Domain reason |
| --- | --- | --- | --- | --- |
| `add` | `/channels/sdlcEvents` | property `codeHead` | 20 | Intended: the optional code head of a head-bound gate and of its evidence (design decisions 2 and 7), in the gate and in each of the three evidence kinds wherever a schema embeds them |
| `add` | `/channels/sdlcEvents` | property `gateGeneration` | 15 | Intended: the optional generation that evidence was recorded for (design decision 8, pass 1 H1), in each evidence kind wherever a schema embeds it |
| `add` | `/channels/sdlcEvents` | property `gateId` | 15 | Intended: the optional gate that evidence was recorded for (design decision 8, pass 2 M2), in each evidence kind wherever a schema embeds it |
| `add` | `/components/messages` | property `codeHead` | 20 | Intended: the optional code head of a head-bound gate and of its evidence (design decisions 2 and 7), in the gate and in each of the three evidence kinds wherever a schema embeds them |
| `add` | `/components/messages` | property `gateGeneration` | 15 | Intended: the optional generation that evidence was recorded for (design decision 8, pass 1 H1), in each evidence kind wherever a schema embeds it |
| `add` | `/components/messages` | property `gateId` | 15 | Intended: the optional gate that evidence was recorded for (design decision 8, pass 2 M2), in each evidence kind wherever a schema embeds it |
| `add` | `/components/schemas` | property `codeHead` | 34 | Intended: the optional code head of a head-bound gate and of its evidence (design decisions 2 and 7), in the gate and in each of the three evidence kinds wherever a schema embeds them |
| `add` | `/components/schemas` | property `gateGeneration` | 27 | Intended: the optional generation that evidence was recorded for (design decision 8, pass 1 H1), in each evidence kind wherever a schema embeds it |
| `add` | `/components/schemas` | property `gateId` | 27 | Intended: the optional gate that evidence was recorded for (design decision 8, pass 2 M2), in each evidence kind wherever a schema embeds it |
| `add` | `/components/schemas` | schema `CodeHeadIdentity` | 1 | Intended: the new code-head schema, repository, commit, and tree (sdlc-wire-contracts "Code head on the wire") |
| `add` | `/components/schemas` | schema `CodeObjectId` | 1 | Intended: the new object-name schema, with the pattern of 40 or 64 lowercase hexadecimal characters that rejects abbreviated names |
| `add` | `/operations/sendSdlcEvent` | property `codeHead` | 40 | Intended: the optional code head of a head-bound gate and of its evidence (design decisions 2 and 7), in the gate and in each of the three evidence kinds wherever a schema embeds them |
| `add` | `/operations/sendSdlcEvent` | property `gateGeneration` | 30 | Intended: the optional generation that evidence was recorded for (design decision 8, pass 1 H1), in each evidence kind wherever a schema embeds it |
| `add` | `/operations/sendSdlcEvent` | property `gateId` | 30 | Intended: the optional gate that evidence was recorded for (design decision 8, pass 2 M2), in each evidence kind wherever a schema embeds it |
| `edit` | `/channels/sdlcEvents` | description | 2 | Intended: the descriptions of `GateStale` and `GateReopened` name staleness for a new code head and reopening at a code head (pass 2 L2) |
| `edit` | `/components/messages` | description | 2 | Intended: the descriptions of `GateStale` and `GateReopened` name staleness for a new code head and reopening at a code head (pass 2 L2) |
| `edit` | `/components/messages` | summary | 2 | Intended: the summaries of `GateStale` and `GateReopened`, with the same text as their descriptions |
| `edit` | `/components/schemas` | description | 2 | Intended: the descriptions of `GateStale` and `GateReopened` name staleness for a new code head and reopening at a code head (pass 2 L2) |
| `edit` | `/operations/sendSdlcEvent` | description | 4 | Intended: the descriptions of `GateStale` and `GateReopened` name staleness for a new code head and reopening at a code head (pass 2 L2) |
| `edit` | `/operations/sendSdlcEvent` | summary | 4 | Intended: the summaries of `GateStale` and `GateReopened`, with the same text as their descriptions |
| | | **Total** | **306** | |

No group is unintended. The 16 `edit` changes are text only; the 290 `add` changes are optional properties and new schemas.

**Version rule.** `scripts/check-contract-compatibility.ts` compares each document with its text at the merge base of `HEAD` and `origin/dev` (lines 9-10); `declaresBreakingChange` declares breaking changes by a higher major version or, while the major version is 0, a higher minor version (lines 35-43); `compatibilityProblems` reports breaking changes only when the version does not declare them (lines 50-54); ADR 0004 principle 6 (contract-first OpenAPI and AsyncAPI). The SDLC document is 0.3.0 on dev `9196804b` and 0.4.0 on this branch; this change introduced 0.4.0, so the one minor bump declares every breaking change against the base, and the check passes.

### Review pass 3

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, session `01a181fd-23d2-7ab0-bb97-773ed00e5953`; run by the coordinator.
- **Revision reviewed:** `0f43c846`, which includes the pass 2 fixes `82783edd` and `0fb9d3cf` and their records.
- **Invocation:** `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** model, reasoning effort `medium`, read-only sandbox, and session ID in the output header, as the coordinator reported them.
- **Snapshot:** before and after the pass identical, as the coordinator reported it.
- **Result:** Critical 0, High 0, Medium 0, Low 0, as in `passes.jsonl` line 3; no `findings.jsonl` line.
- **Checks by the reviewer:** M1 to M3 and L1 to L7 fixed, each with its regression test; the breakdown of the SDLC AsyncAPI breaking changes recomputed with `asyncapiContractChanges`: the 20 groups match "Breaking changes of the SDLC AsyncAPI document", 306 = 290 `add` + 16 `edit`, no unintended group, the cited lines of `scripts/check-contract-compatibility.ts` and ADR 0004 principle 6 correct, and the version 0.3.0 -> 0.4.0; 50 targeted tests run, 50 pass; `npm run verify:comments` passes.
- **Review end:** three passes done, the cap of governance "Conditional third pass"; no open findings.

## Limitations

- No service marks a run's gates stale when its head moves; item 21 does.
- An evidence record's `codeRevision` cannot decide a head-bound gate until the follow-up change `align-code-head-names` (design decision 1 (i)), which must land before G3 item 21.
- Whether every gate requires a code head is G3 item 21's decision (design decision 6, option (a) chosen by the coordinator). Since the pass 2 fixes every gate, with or without a code head, accepts evidence only for its id and generation (design decision 8).

## Remaining gates

- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
