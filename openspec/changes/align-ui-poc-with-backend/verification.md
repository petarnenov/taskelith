# Verification: align-ui-poc-with-backend

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the owner's request, to be handed to the coordinator (Niki). Base revision: `95262b4`, the head of `record-mantine-ui-poc`, which this branch is stacked on; that branch's base is `9bb8013` on `dev`. Prepared in the git worktree `../taskelith-worktrees/align-ui-poc-with-backend` on branch `align-ui-poc-with-backend`. Scope: `docs/ui-poc/` (source and README), two phrases of `docs/g3-plan.md`, and this change with its `product-ui` delta.

Source: the owner asked for a review of the Mantine proof of concept with a focus on the backend already implemented in the project. Three read-only subagent reviews compared it with `dev` at `69e5bd2` (SDLC domain and plugins; execution, scheduling, and workers; control plane, contracts, and persistence). The owner then asked for three follow-ups: (1) rework the proof of concept to the backend's model, (2) fix the `product-ui` scenario that contradicts the supervisor identity contract, and (3) fix two backend docs, which is the separate change `fix-roles-and-stage-mapping-docs`. This change covers (1) and (2).

Outside the repository: the rebuilt proof of concept is published as the private artifact `M8VnvLLCrAMiBPrkKezGzk`; version 4 matched head `dcb91d6`, and version 5 matches the pass-1 fixes.

## Author self-check before review

- The stage graphs in `docs/ui-poc/src/screens/board-data.ts` match `stagesOf` in `packages/plugins/sdlc-openspec/src/openspec-framework.ts` (artifact stages `proposal`, `specs`, `design`, `tasks`, then `apply`, platform-managed `verify` and `review`, native `archive`) and `SPECKIT_WORKFLOW` in `packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts`.
- Gate states, evidence kinds, stage states, admission kinds, waiting reasons, admission pressure causes, attempt outcomes, roles, the plugin API version, the OpenSpec manifest, and the registration failure codes use the names in `packages/modules/sdlc`, `packages/modules/scheduling`, `packages/modules/execution`, `packages/plugin-sdk`, `docs/contracts/`, and `docs/trust-model.md`.
- The delta removes "Harness activity indicator" and adds "Session activity indicator" with the four unchanged scenarios and two new ones; the pinned OpenSpec rejects both a MODIFIED block that drops a scenario and a requirement both removed and added under one name.
- In a browser (Playwright on the local build, 1440 × 900 and 390 × 844): all ten screens render without console errors; no page scrolls horizontally at 390 px; the run drawer shows stages and gates; reconciling the uncertain attempt ends it as operator-resolved; the inbox's first spec approval shows the conflict and the second is confirmed by the simulated server; the viewer persona sees runtime approval and drain disabled and no "New task" or "Enroll worker" button.
- `tsc -p .` on the reference source passed in the scratch build directory. Version 4 was 919,319 bytes with SHA-256 `a2f88738ae1001c4aa83a710089bd6876b7dc54917bf33509adae81c90cd8d00`; after the pass-1 fixes, version 5 is 920,277 bytes with SHA-256 `55023064efef85afe8478d93f310998e8cfd4aaa679ae46eef2947fc58d30021`.
- Evidence check: no new external link; the artifact link in the README stays marked as an unversioned private page.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`; `make verify` pins the same Node through `scripts/with-pinned-node.sh`. Before pass 1: `npm run openspec -- validate align-ui-poc-with-backend --strict` passed; `make verify` passed (strict OpenSpec validation 51 passed, 0 failed; every active change, including the stacked `record-mantine-ui-poc`, archives into strictly valid specs; package verification passed). After the pass-1 fixes: the same checks passed again (51 strict validations, archive dry run, package verification).

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort medium, run from the worktree as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with the prompt and output outside the worktree.

- **Pass 1 — session `017b21a2-bd74-492e-a837-a8b0c0d685fb`, head `dcb91d6`.** The JSON `modelUsage` listed `claude-fable-5-1` and also `claude-opus-5-5`, which the CLI used internally; the review itself ran on `claude-fable-5-1`. The snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `22c9a4381fa1933cb6f1f1d389a5d192d4fcc91f44ecec21a068e5e662615e68` before and after the pass. The reviewer confirmed the stage graphs, states, reasons, quotas, manifest, roles, plan item numbers, the delta, and the comment rule. Findings: 0 Critical, 0 High, 5 Medium, 14 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the run's native reference was a path. It is now the bare change or feature name, as the plugins return it; artifact revisions keep their paths.
  2. Medium: an invented outcome `killed`. Outcomes are `exited` (code or signal), `operator-resolved`, and `not-started`, with a separate `cancelled` flag.
  3. Medium: the platform-managed `verify` stage had a running agent session, and the session screen showed verify as an agent tool call. The run's session has ended and its note names platform verify; the session screen shows verify as a platform step.
  4. Medium: Codex appeared without a G4 marker. Every Codex session badge, worker, pool, and reviewer is marked.
  5. Medium: the gates per stage were presented as backend facts. The README and design say that the stage graph is the backend's and the gates per stage are illustrative.
  6. Low: `offered` was an attempt phase. It is now a separate assignment field.
  7. Low: the turn state was presented as a backend fact. The type and the README say that turns come with G3 items 4 and 13.
  8. Low: the stale-spec run spoke of an implementation admission. It now names the planning admission.
  9. Low: the spec approval's generation differed between the inbox and the board. Both say generation 4.
  10. Low: the plugin screen used `not assessed` and `admitted`. It uses "no register entry" and "registered (ok)".
  11. Low: the `product-ui` Purpose still says "harness activity indicator". Recorded under Limitations; a delta cannot change the Purpose.
  12. Low: the stage graph is shown linearly. The README and design say so, with the `design` example.
  13. Low: Claude Code runs on Linux while it is not qualified there. Those session badges are marked "qualification pending".
  14. Low: "Claim the installation" is not a backend term. The step signs in with the bootstrap credential to create the first installation-owner.
  15. Low: hardcoded worker counts. They are derived from the worker data.
  16. Low: live sessions were counted by label. The derived status has a `live` flag.
  17. Low: silent defaults invented facts. A missing waiting reason shows "Queued" and a missing outcome "Ended · outcome unknown".
  18. Low: two timers had no cleanup. The turn confirmation and the task creation run in effects that clear them.
  19. Low: the drawer hard-coded the attempt and the inbox ID, and the inbox kept two states for one conflict. The drawer uses the run's attempt and inbox ID, and the inbox has one conflict state.

## Limitations

- Sample data stay illustrative; digests, IDs, and counts are not taken from a real run.
- The trust model names no role for reconciling an uncertain attempt; the proof of concept gives it to `project-maintainer` and the README lists it as open for item 28.
- The `product-ui` Purpose still names "the harness activity indicator of 2026-10-25"; it is the decision's historical name, and a delta cannot change the Purpose.
- Screenshots could not be taken in this session (the browser tool timed out); the browser checks above were made through the page's DOM.

## Remaining gates

- Coordinator integration into `dev` after `record-mantine-ui-poc`, and archive.
