# Verification

Record before the review passes, which are pending (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28) for G3 item 17 (`docs/g3-plan.md`, row 17). Size M.
- **Base revision:** `a899d5d2` (`origin/dev`, merge of pull request #382).
- **Merge of dev:** `origin/dev` `f3a53f17` (merge of pull request #383, `adopt-process-performance-recommendations`) merged into the branch with merge commit `1206034c`, without conflicts.
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

## Fails before the change

- With `packages/modules/sdlc/src` and `packages/modules/workspace/src` of `a899d5d2` restored and built, `code-head-binding.test.ts` fails to load: `The requested module '@taskelith/sdlc' does not provide an export named 'isGateOutdatedByCodeHead'` (0 pass, 1 fail). The sources were restored afterwards.
- A probe on that base build, with the base API only, showed each gap: a gate opened with a `codeHead` that is approved stays passed after a new head, because `markGateStale` with the unchanged specification is rejected and nothing else marks it; after a specification edit and its revert, `reopenGate` and the superseded approval pass the gate again; and an approval at another head passes the gate. On `56a63b3b` the same probe stops at `reopenGate`, which refuses the head-bound gate.

## Independent review

None yet; the coordinator assigns the passes.

## Limitations

- The gate repository suite's new head-bound case runs against the PostgreSQL adapter only in `make verify` (Docker); the author ran it against the in-memory adapter.
- No service marks a run's gates stale when its head moves; item 21 does.
- An evidence record's `codeRevision` cannot decide a head-bound gate until the follow-up change `align-code-head-names` (design decision 1 (i)), which must land before G3 item 21.
- Whether every gate requires a code head is G3 item 21's decision (design decision 6, option (a) chosen by the coordinator).

## Remaining gates

- `make verify` on the final committed tree and `make record-check` before pass 1.
- Review passes 1 and 2 (and 3 if needed) with their records.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
