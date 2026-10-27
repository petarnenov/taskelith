# Verification: route-reviewers-by-change-complexity

## Scope and source

Coordinator brief of 2026-10-28, size M, relaying the owner's idea of the same day and the plan agreed with the coordinator: choose the reviewer and effort of each change by its complexity before review, with a deterministic rule router as the permanent floor, a TypeSafe AI Jev adapter in shadow mode only, a hexagonal port `ReviewRouter`, the command `make findings ARGS="route --change <name>"`, and measurement through `effect` and a one-time offline evaluation. Out of scope: letting Jev decide above the floor. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `/docs/agent-task-protocol.md`, in the git worktree `route-reviewers-by-change-complexity` on the branch of the same name. Base revision: `3f23516a` on `dev`.

Phase 1, recorded here so far: research, design, and contract. Sequencing: `docs/governance.md`, `docs/agent-task-protocol.md`, and `scripts/findings.ts` are left untouched until `adopt-process-performance-recommendations` lands on `dev`; their edits are planned in `design.md` "Planned edits". Commit types `docs`, `chore`, and `test`: nothing here is in the published package.

## Review plan

- Reviewer A, passes 1 and 3: Claude Code (claude-fable-5-1), because the review depends on external facts (the Jev API, terms, and pricing in `design.md` "External facts") and governance "External facts" requires network access, which Codex CLI (gpt-6.1-sol) lacks.
- Reviewer B, pass 2: Claude Code (claude-opus-5-5), effort `high`.
- The two share a harness, which the owner's reviewer assignment of 2026-10-27 allows for tasks that need network access (on the branch `normalize-reviewer-keys`, not yet on `dev` at the base revision).

## Checks

Phase 1, on the working tree before the phase 1 commit:

- `make findings ARGS="checklist --capability review-process,agent-task-protocol --files scripts/** --save route-reviewers-by-change-complexity --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --size M"`: `Saved the checklist to openspec/changes/route-reviewers-by-change-complexity/checklist.json.`; its printed text is in `design.md` "Review checklist".
- `docs/review-findings/route.schema.json` compiles with ajv 2020 in strict mode next to the finding and checklist schemas, accepts a sample record with a failed and with an answered shadow, and rejects an unknown property (scratch script, not committed).

- `npm run openspec -- validate route-reviewers-by-change-complexity --strict`: `Change 'route-reviewers-by-change-complexity' is valid`.
- Requirement bodies: 486, 452, 405, 462, 258, 448, 397, and 430 characters in the `review-process` delta, 413 in the `agent-task-protocol` delta.
- `npm run verify:links`: `Every checked link conforms.`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run verify:findings`: `Every findings file is valid: 53 file(s); every pass summary file is valid: 33 file(s).`
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`
- `make verify` was not run in phase 1: the phase changes no code, test, or build input, and the full test suite runs in phase 2.

## Remaining gates

- Phase 2 implementation and tests; phase 3 integration; author self-check and evidence check; independent review; archive.
- Owner actions before the shadow router can answer (`design.md` "Owner actions").
- Integration into dev by the coordinator (single pull request).
