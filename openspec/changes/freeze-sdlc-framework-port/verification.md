# Verification: freeze-sdlc-framework-port

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G1 item 12 of the [G1 work plan](../../../docs/g1-plan.md). The coordinating session (Niki) assigned it, with the owner's 2026-10-25 port-access decision. Items 10 and 11 are merged. Base revision: `61d180b` on `dev`. Prepared in its own git worktree from a fresh `origin/dev`.

Scope:

- the port, its new capability module, the port entry, and the root exports in `packages/modules/sdlc/` (`src/ports/sdlc-framework.ts`, `src/ports/sdlc-framework-capabilities.ts`, `src/ports/sdlc-framework-conformance.ts`, `src/port.ts`, `src/index.ts`, `package.json`, `test/sdlc-framework-port.test.ts`);
- the plugin SDK (`src/index.ts`, `src/plugin-api.ts`, the manifest schema description, `package.json`, `tsconfig.json`, and two tests);
- the OpenSpec adapter (`openspec-framework.ts`, `openspec-plugin.ts`, and the deleted `sdlc-framework-shapes.ts`);
- the SpecKit stub (`test/speckit-normaliser.ts`, `test/speckit-mapping-fixtures.test.ts`, `src/index.ts`, `fixtures/README.md`, `package.json`, `tsconfig.json`);
- `scripts/check-boundaries.ts`, `scripts/workspace-packages.ts`, and their tests;
- ADR 0009, contract tooling section 9, the Purpose of the main `sdlc-framework-port` spec, the workspace entries in `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, and this change.

## Evidence

- `archive <change> --yes --json` with the pinned `@fission-ai/openspec` 1.14.3, `OPENSPEC_TELEMETRY=0`, and `DO_NOT_TRACK=1`, on a scratch copy of the OpenSpec fixture working copy outside the repository:
  - archiving `fix-boundary-entrypoint` printed `{ archive: { change, archivedAs, path, specsUpdated, totals }, root }` and exited 0;
  - with the target `2026-10-25-document-worktree-pitfalls` already present, it printed `archive: null`, a `root`, and a `status` entry `archive_target_exists`, and exited 1.

  Contract tooling section 9 records this.
- The SpecKit normaliser passes all 29 SpecKit mapping cases through `runSdlcFrameworkConformance` with no findings, without changes to the cases or the port's operations. The OpenSpec adapter still passes its cases.
- The port-entry dependency test failed as intended when a compiled module of the entry was changed to load another module. It passed again after a clean rebuild.
- Archive dry run: in a scratch copy of `openspec/`, `archive freeze-sdlc-framework-port --yes` applied `+ 4, ~ 4, - 0, → 1`, and `validate --all --strict` passed 33 of 33. Every requirement line of the archived specs is under 500 characters. This ran on the final specs at `323fa8b`.

## Author self-check before review

- ADR 0004:
  - The port entry and the SDK re-export keep plugins behind the SDK (hexagonal, microkernel). The boundary check enforces the type-only, port-entry-only rule.
  - The capability parser is split from the port contract, so each module has one responsibility.
  - Coverage stays above 75% for lines, branches, and functions.
  - Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation: there is no new interface or image, and `make verify` runs the new tests.
- Scope: no SpecKit adapter or CLI spawning, no wire contracts, and no UI. Item 6's archived design is left as written, and its open question is closed by ADR 0009 and the new requirements.
- Comments: every comment that the change adds or edits is at most two lines of at most 80 characters. A script over the diff against `61d180b` checked this.
- Honest status: ADR 0009 and `design.md` state that the run found no OpenSpec-specific shape, and that the revision was made for stability. They also state that a stage with several outputs is assessed, not exercised.
- Evidence check: the change cites only repository-relative documents. The CLI output it records was observed with the pinned CLI, as described above.

## Checks

In the worktree, with Node v24.22.1, npm 12.2.1, Docker 29.5.2 running, and macOS 26.6.2 on x86_64. `npm install --ignore-scripts` updated the workspace entries, and `npm run inventory:dependencies` regenerated the dependency evidence.

- `make verify` passed at `f5f75a1`: 254 tests passed and 0 failed. Coverage was 99.63% lines, 95.68% branches, and 99.27% functions. The boundary and coverage scope checks passed, and no undeclared contract breaking change was found. The dependency inventory verified 681 package paths, strict OpenSpec validation passed 34 of 34, and package verification passed.
- `make verify` passed again after the pass-1 fixes, before commit `323fa8b`: 255 tests passed and 0 failed. Coverage was 99.63% lines, 95.68% branches, and 99.27% functions. All other checks passed as before.
- `npm run openspec -- validate freeze-sdlc-framework-port --strict`: valid.

## Independent review

Assigned reviewer: Codex CLI 0.164.0, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The prompt, output, and snapshot files were kept in a scratch directory outside the worktree. The prompt named these criteria:

- `AGENTS.md`, including the comment rule;
- ADR 0004, the governance review process, and the architecture;
- the touched specs and the 500-character limit for requirements.

It asked for every instance of each problem with its severity, file, line, and fix.

- **Pass 1** (session `01a16fd5-457a-72c2-a2be-1f2389e29e43`; the header named model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`). It reviewed `61d180b..f5f75a1`. The snapshot before and after was `75514fa0c2da28070bfc9f83017535bc3c5cc5be5e2661f0790b72d88f76f6af`, equal. Findings: 0 Critical, 0 High, 2 Medium, 2 Low. All were accepted and resolved in `323fa8b`:
  1. Medium: the domain layer rule did not cover the new port entry, so domain code could import `@taskelith/sdlc/port`. The rule now treats `src/port.ts` like `ports/`, and a test covers both the named and the relative import.
  2. Medium: the port entry loaded domain code through `ports/sdlc-framework.ts`. The capability parser moved to `ports/sdlc-framework-capabilities.ts`, and the port contract imports only the kernel's `Result` type. A test follows the compiled imports of the entry.
  3. Low: the workspace-packages delta had contradictory scenarios about `./port`. The requirement now makes `./port` optional and module-only, and the scenarios agree.
  4. Low: ADR 0009 and `design.md` presented a stage with several outputs as exercised. Both now say that the shape is assessed but not exercised by the fixtures.
- **Pass 2** (session `01a16fda-3ed1-7201-a284-2784a8fff301`; the same model, reasoning effort, and sandbox were confirmed in the header). It confirmed the resolution of all four pass-1 findings and reviewed `61d180b..323fa8b` again. The snapshot before and after was `988402379b941abff5078d0aa4b1276aa15b1d9b77d9c4e6e439c9dd766d45be`, equal. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

No unreviewed fixes. This record and the checked task boxes were written after pass 2.

## Limitations and remaining gates

- The normaliser reads the bundled workflow with a line reader for the pinned layout, not with a YAML parser. The SpecKit adapter (G4) replaces it.
- `PLUGIN_API_VERSION` `0.2.0` instead of `1.0.0` is the author's choice, recorded in the design. The coordinator may raise it with the owner.
- Remaining gates: integration into `dev` and archive by the coordinator.
