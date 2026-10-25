# Verification: align-ui-poc-with-backend

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the owner's request, to be handed to the coordinator (Niki). Base revision: `95262b4`, the head of `record-mantine-ui-poc`, which this branch is stacked on; that branch's base is `9bb8013` on `dev`. Prepared in the git worktree `../taskelith-worktrees/align-ui-poc-with-backend` on branch `align-ui-poc-with-backend`. Scope: `docs/ui-poc/` (source and README), two phrases of `docs/g3-plan.md`, and this change with its `product-ui` delta.

Source: the owner asked for a review of the Mantine proof of concept with a focus on the backend already implemented in the project. Three read-only subagent reviews compared it with `dev` at `69e5bd2` (SDLC domain and plugins; execution, scheduling, and workers; control plane, contracts, and persistence). The owner then asked for three follow-ups: (1) rework the proof of concept to the backend's model, (2) fix the `product-ui` scenario that contradicts the supervisor identity contract, and (3) fix two backend docs, which is the separate change `fix-roles-and-stage-mapping-docs`. This change covers (1) and (2).

Outside the repository: the rebuilt proof of concept is version 4 of the private artifact `M8VnvLLCrAMiBPrkKezGzk` and matches `docs/ui-poc/`.

## Author self-check before review

- The stage graphs in `docs/ui-poc/src/screens/board-data.ts` match `stagesOf` in `packages/plugins/sdlc-openspec/src/openspec-framework.ts` (artifact stages `proposal`, `specs`, `design`, `tasks`, then `apply`, platform-managed `verify` and `review`, native `archive`) and `SPECKIT_WORKFLOW` in `packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts`.
- Gate states, evidence kinds, stage states, admission kinds, waiting reasons, admission pressure causes, attempt outcomes, roles, the plugin API version, the OpenSpec manifest, and the registration failure codes use the names in `packages/modules/sdlc`, `packages/modules/scheduling`, `packages/modules/execution`, `packages/plugin-sdk`, `docs/contracts/`, and `docs/trust-model.md`.
- The delta removes "Harness activity indicator" and adds "Session activity indicator" with the four unchanged scenarios and two new ones; the pinned OpenSpec rejects both a MODIFIED block that drops a scenario and a requirement both removed and added under one name.
- In a browser (Playwright on the local build, 1440 × 900 and 390 × 844): all ten screens render without console errors; no page scrolls horizontally at 390 px; the run drawer shows stages and gates; reconciling the uncertain attempt ends it as operator-resolved; the inbox's first spec approval shows the conflict and the second is confirmed by the simulated server; the viewer persona sees runtime approval and drain disabled and no "New task" or "Enroll worker" button.
- `tsc -p .` on the reference source passed in the scratch build directory; the build is 919,319 bytes with SHA-256 `a2f88738ae1001c4aa83a710089bd6876b7dc54917bf33509adae81c90cd8d00`.
- Evidence check: no new external link; the artifact link in the README stays marked as an unversioned private page.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`; `make verify` pins the same Node through `scripts/with-pinned-node.sh`. Before pass 1: `npm run openspec -- validate align-ui-poc-with-backend --strict` passed; `make verify` passed (strict OpenSpec validation 51 passed, 0 failed; every active change, including the stacked `record-mantine-ui-poc`, archives into strictly valid specs; package verification passed).

## Independent review

Pending.

## Limitations

- Sample data stay illustrative; digests, IDs, and counts are not taken from a real run.
- The trust model names no role for reconciling an uncertain attempt; the proof of concept gives it to `project-maintainer` and the README lists it as open for item 28.
- Screenshots could not be taken in this session (the browser tool timed out); the browser checks above were made through the page's DOM.

## Remaining gates

- Coordinator integration into `dev` after `record-mantine-ui-poc`, and archive.
