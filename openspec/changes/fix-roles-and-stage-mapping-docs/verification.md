# Verification: fix-roles-and-stage-mapping-docs

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the owner's request, after a review of the Mantine UI proof of concept against the implemented backend found two records that disagree with the code and the trust contract; to be handed to the coordinator (Niki). Base revision: `69e5bd2` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-roles-and-stage-mapping-docs` on branch `fix-roles-and-stage-mapping-docs`. Scope: `docs/g3-plan.md` (one sentence), `docs/sdlc-framework-mapping.md` (a dated note), and this change. Documentation only, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- `docs/trust-model.md` section 3 lists four roles: `installation-owner`, `project-maintainer`, `project-operator`, `project-viewer`; the G3 plan now names all four.
- The note matches `stagesOf` in `packages/plugins/sdlc-openspec/src/openspec-framework.ts` (artifact stages with intake or specification obligations, then `apply`, platform-managed `verify` and `review`, native `archive`) and `SPECKIT_WORKFLOW` in `packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts` (`specify` with intake and specification, platform-managed `review-spec` and `review-plan`, `plan`, `tasks`, `implement`).
- Evidence check: the change adds one relative link to ADR 0009 and no external link.

## Checks

In the worktree, Node v24.22.1: `npm run openspec -- validate fix-roles-and-stage-mapping-docs --strict` and `make verify`.

## Independent review

Pending.

## Limitations

None.

## Remaining gates

- Coordinator integration into `dev` and archive.
