# Verification

Record of the change through review pass 1 and its fix; later passes are pending (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28) for G3 item 17 (`docs/g3-plan.md`, row 17). Size M.
- **Base revision:** `a899d5d2` (`origin/dev`, merge of pull request #382).
- **Merge of dev:** `origin/dev` `f3a53f17` (merge of pull request #383, `adopt-process-performance-recommendations`) merged into the branch with merge commit `1206034c`, without conflicts. After review pass 1, `origin/dev` `9196804b` (pull requests #384, `fix-make-argument-expansion`; #385, `route-reviewers-by-change-complexity`, governance policy version 7; #386, `define-session-turn-model`) merged with merge commit `08677e80`, without conflicts.
- **Revision verified:** `56a63b3b`: the specs, the contract, and the AsyncAPI document (`454a056d`), then the domain, the conformance suite, and the tests (`56a63b3b`).
- **Scope:** head-bound SDLC gates and gate evidence; the code head owned by the SDLC module and refined by the workspace module (design decision 1); staleness for a new code head; no restored approval after an artifact edit; rejection of evidence from another head; the SDLC AsyncAPI document 0.4.0; a head-bound gate in the gate repository suite; the Git workspace contract sections 5 and 14.
- **Out of scope:** the review and verification stages (item 21), auto-merge (item 23), the SCM plugin (item 20), the UI, and the evidence record's `codeRevision` and the merge queue's `CodeHead` (design decision 1 (i), chosen by the coordinator: the follow-up change `align-code-head-names`).

## Environment

The owner's 2020 Intel iMac: macOS 26.6.2 (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm.

## Author self-check

- **Contract first.** `454a056d` holds the proposal, the design, `checklist.json` saved with the brief's invocation, the three spec deltas, the AsyncAPI document, and the Git workspace contract, before the code commit `56a63b3b`.
- **Spec deltas.** All are added requirements, so no living text is copied: `sdlc-gates` "Head-bound gates" (350 characters), "Evidence bound to the code head" (381), "Invalidation by a new code head" (321), "Approval not restored by an artifact edit" (288); `sdlc-workflow-model` "Code-head identity" (364); `sdlc-wire-contracts` "Code head on the wire" (289).
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

## Fails before the change

- With `packages/modules/sdlc/src` and `packages/modules/workspace/src` of `a899d5d2` restored and built, `code-head-binding.test.ts` fails to load: `The requested module '@taskelith/sdlc' does not provide an export named 'isGateOutdatedByCodeHead'` (0 pass, 1 fail). The sources were restored afterwards.
- A probe on that base build, with the base API only, showed each gap: a gate opened with a `codeHead` that is approved stays passed after a new head, because `markGateStale` with the unchanged specification is rejected and nothing else marks it; after a specification edit and its revert, `reopenGate` and the superseded approval pass the gate again; and an approval at another head passes the gate. On `56a63b3b` the same probe stops at `reopenGate`, which refuses the head-bound gate.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `b91b0e270ce8e2653ac42229088a008f3d59a912`; tests 2658, pass 2651, fail 0, skipped 7; all files 99.36% lines, 92.52% branches, 99.06% functions.
- `npm run openspec -- validate bind-evidence-to-code-head --strict`: passed, `Change 'bind-evidence-to-code-head' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s).`.
- Spec diff against the merge base `f3a53f172dc2` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Reviewer A, passes 1 and 3: Codex CLI (`gpt-6.1-sol`); reviewer B, pass 2: assigned by the coordinator.

### Review pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, session `01a18144-6e30-7fd3-b8e6-1788fa5b1766`; run by the coordinator.
- **Revision reviewed:** `cf335fe8`, before the merge of dev `9196804b`.
- **Invocation:** `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** model, reasoning effort, read-only sandbox, and session ID in the output header, as the coordinator reported them.
- **Snapshot:** before and after the pass identical, as the coordinator reported it.
- **Result:** Critical 0, High 1, Medium 0, Low 0, as in `passes.jsonl` line 1 and `findings.jsonl` line 1. File lines are those of `cf335fe8`.
- **H1, contract-drift** (`packages/modules/sdlc/src/domain/gate.ts:105`, `reopenGateAtCodeHead` at line 148): a superseded approval could pass a head-bound gate again. Approved at head A, made stale by an artifact edit, reopened with the original subject at A, the gate accepted the old approval and passed; the same held after a new head B made it stale and the gate was reopened at A. The check compared only the subject and the code head, so it could not tell evidence of an earlier decision from new evidence, against `sdlc-gates` "Approval not restored by an artifact edit"; `code-head-binding.test.ts:86` covered only a reopening at a third commit. Resolution: see "Pass 1 fixes".

### Pass 1 fixes

Not yet reviewed; reviewer B checks them in pass 2.

- **H1 fix** (`FIX_COMMIT`, design decision 8): the three evidence kinds take an optional `gateGeneration`, the generation of the pending gate they were recorded for, and `recordGateEvidence` rejects evidence for a head-bound gate whose `gateGeneration` is not the gate's generation, or is missing, with `precondition-failed` (`accepts only evidence recorded for its current generation`). A gate turns pending only when opened or reopened, at a new generation, so a superseded approval names an earlier generation. The SDLC AsyncAPI document 0.4.0 adds `gateGeneration` to the three evidence kinds; the spec deltas `sdlc-gates` "Evidence bound to the code head" (402 characters, new scenario "Evidence for another generation") and "Approval not restored by an artifact edit" (306, new scenario "Reopened at the approved head") and `sdlc-wire-contracts` "Code head on the wire" (365), the Git workspace contract section 14, the gate repository suite, and the contracts test change with it. Files: `packages/modules/sdlc/src/domain/gate.ts`, `gate-evidence.ts`, `src/ports/repository-conformance.ts`, `test/code-head-binding.test.ts`, `packages/contracts/documents/sdlc.asyncapi.json`, `packages/contracts/test/contracts.test.ts`, `docs/contracts/git-workspace.md`, and this change's proposal, design, tasks, and spec deltas.
- **Tests.** In `packages/modules/sdlc/test/code-head-binding.test.ts`: `a superseded approval does not pass a gate reopened at its head after an artifact edit` and `a superseded approval does not pass a gate reopened at its head after another head` (scenario "Reopened at the approved head"; the second also covers a return to the approved head after an approval at the other head), and `a head-bound gate needs evidence recorded for its current generation` (scenario "Evidence for another generation").
- **Fails before the fix.** With the test file of the fix on `767cf592` (the sources before the fix), after `npm run build`, `node --experimental-strip-types --test packages/modules/sdlc/test/code-head-binding.test.ts`: tests 10, pass 7, fail 3, the three new tests, each because recording the superseded or unbound approval succeeded (`actual: true`, `expected: false` on `result.ok`). After the fix: tests 10, pass 10.
- **Author checks after the fix,** on its working tree: `npm run build`, `npm run check:boundaries`, `npm run verify:comments`, `npm run verify:links`: passed; `npm run openspec -- validate bind-evidence-to-code-head --strict`: valid; `node --experimental-strip-types --test 'packages/modules/*/test/*.test.ts' packages/contracts/test/*.test.ts`: tests 875, pass 874, fail 0, skipped 1; coverage of `packages/modules/sdlc/dist/domain/*.js` over the SDLC tests: `code-head.js`, `gate-evidence.js`, and `gate.js` 100% lines, branches, and functions.

## Limitations

- No service marks a run's gates stale when its head moves; item 21 does.
- An evidence record's `codeRevision` cannot decide a head-bound gate until the follow-up change `align-code-head-names` (design decision 1 (i)), which must land before G3 item 21.
- Whether every gate requires a code head is G3 item 21's decision (design decision 6, option (a) chosen by the coordinator). A gate without a code head is not bound to its generation either (design decision 8), so G1's `reopenGate` with a restored subject still accepts an earlier approval of that subject.

## Remaining gates

- `make record-check` before pass 1, and `make verify` again after each round of review fixes.
- Review passes 1 and 2 (and 3 if needed) with their records.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
