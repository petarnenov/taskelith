# Verification: fix-roles-and-stage-mapping-docs

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the owner's request, after a review of the Mantine UI proof of concept against the implemented backend found two records that disagree with the code and the trust contract; to be handed to the coordinator (Niki). Base revision: `69e5bd2` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-roles-and-stage-mapping-docs` on branch `fix-roles-and-stage-mapping-docs`. Scope: `docs/g3-plan.md` (one sentence), `docs/sdlc-framework-mapping.md` (a dated note, two table cells that point to it, and the gap sentence), and this change. Documentation only, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- `docs/trust-model.md` section 3 lists four roles: `installation-owner`, `project-maintainer`, `project-operator`, `project-viewer`; the G3 plan now names all four.
- The note matches `stagesOf` in `packages/plugins/sdlc-openspec/src/openspec-framework.ts` (artifact stages with intake or specification obligations, then `apply`, platform-managed `verify` and `review`, native `archive`) and `SPECKIT_WORKFLOW` in `packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts` (`specify` with intake and specification, platform-managed `review-spec` and `review-plan`, `plan`, `tasks`, `implement`).
- Evidence check: the change adds two relative links (ADR 0009 and ADR 0010) and no external link.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc` (the shell default is older; `make verify` pins the same Node through `scripts/with-pinned-node.sh`), in the worktree, before pass 1 at `60d0a4a`, again on the pass-1 fixes committed as `fbf2064`, and again after the pass-2 fixes: `npm run openspec -- validate fix-roles-and-stage-mapping-docs --strict` passed; `make verify` passed (strict OpenSpec validation 51 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort medium, run from the worktree as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with the prompt and output outside the worktree.

- **Pass 1 — session `9b677dbb-7b3e-4417-b9bf-d47a8c85b57f`, head `60d0a4a`.** The JSON `modelUsage` confirmed `claude-fable-5-1`; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `fe13ea06d2ec10a3d2b0b498bdf73bbea0b125a65424be32c4e3f957eb03636b` before and after the pass. The reviewer confirmed the role list against the trust model, both stage graphs against the code, and `skip_specs`. Findings: 0 Critical, 0 High, 2 Medium, 4 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the table and the note contradicted each other. The two affected cells point to the note, and the gap sentence excludes the rows the note supersedes.
  2. Medium: the checks named no results or environment. This section records both.
  3. Low: `clarify` was called an agent step inside `specify`. The note says it is not a stage and stays an agent command outside the workflow.
  4. Low: the G4 adapter was said to implement the fixture today. The note says the test-only normaliser passes it today and the adapter will (ADR 0010).
  5. Low: "two places" while more differences were listed. The note says the graphs differ for both frameworks.
  6. Low: the proposal named no capability. It names the unchanged requirements of `sdlc-framework-mapping` and `delivery-planning`.

- **Pass 2 — session `f472e671-95b1-43e7-b78f-1ff3f60cb459`, head `fbf2064`.** The JSON `modelUsage` confirmed `claude-fable-5-1`; the snapshot was `0b615df8b3a3c57330f1a09c233e8fca9c9353ebf0e880cb8499de1b2086f7ef` before and after the pass. The reviewer confirmed all six pass-1 resolutions and the whole change again. Findings: 0 Critical, 0 High, 0 Medium, 6 Low. Because the pass found only Low findings, they were fixed without another review pass, as the review process allows; these fixes are unreviewed:
  1. The cell marker did not match the legend's `**(gap)**`. The cell keeps `**(gap)**` and adds the pointer as plain text.
  2. "Every (gap) row" while the markers are per cell. Now "Every (gap) cell".
  3. The scope still said "a dated note" only. The proposal, design, tasks, and this record name the two cells and the gap sentence.
  4. The evidence check named one link. It names both relative links.
  5. The checks did not name the revision or the toolchain. They name `fbf2064` and how Node.js 24.22.1 is selected.
  6. The pass-1 snapshot digest was shortened. Both digests are given in full.

## Limitations

None.

## Remaining gates

- Coordinator integration into `dev` and archive.
