# Verification: author-sdlc-mapping-fixtures

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 item 10 of the [G1 work plan](../../../docs/g1-plan.md), assigned by the coordinating session (Niki) under the owner's authorization to start G1 items in dependency order; items 6 and 9 are merged. Base revision: `4a3e69e` on `dev`, with `origin/dev` at `37445fc` (the agent task protocol) merged in before the first commit. Scope: the new packages `packages/plugins/sdlc-openspec` and `packages/plugins/sdlc-speckit` (manifest, tsconfig, an empty `src/index.ts`, `fixtures/`, and `test/`), the workspace links in `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, and this change. Prepared in its own git worktree.

## Evidence

- OpenSpec fixtures: the three changes in `fixtures/working-copy/openspec/changes/` were copied with `cp -R` from `openspec/changes/archive/2026-10-24-<change>/`; the base specs were written with `git show 0729388^:openspec/specs/trust-and-operational-foundation/spec.md` and `git show 4f78d29^:openspec/specs/integration-flow/spec.md`. In the fixture working copy, the pinned CLI (`@fission-ai/openspec` 1.14.3) reported `validate --all --strict --json`: 5 passed, 0 failed (3 changes, 2 specs); `list --json` listed the three changes; `status --change <change> --json` reported the four schema artifacts as `done`. The files in `fixtures/expected/instructions/` are the `instruction` field of `instructions <artifact> --change <change> --json`.
- SpecKit fixtures: `fixtures/working-copy/` outside `specs/` was copied with `cp -R` from `docs/qualification/speckit-1.2.3/scaffold/`. The nine feature files were written by hand from `.specify/templates/{spec,plan,tasks}-template.md` and carry the derived label. The derived files were not run through SpecKit's `check-prerequisites`.
- Digests: `shasum -a 256` of every artifact file, of `node_modules/@fission-ai/openspec/schemas/spec-driven/schema.yaml` (`b6f28f30…`), and of the bundled `workflow.yml` (`177761c5…`); the tests recompute each.
- Running the OpenSpec CLI in the fixture working copy left `git status` unchanged.

## Author self-check before review

- Against ADR 0004: no framework-specific code or data enters `@taskelith/sdlc` or the conformance suite; the plugin packages have no source beyond an empty export, so the plugin boundary rule is untouched (`src/` imports nothing) and tests import `@taskelith/sdlc` as the boundary check allows; the packages follow the workspace package contract; coverage stays at 100% lines and functions and 99.86% branches; principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for fixtures without an interface, and `make verify` runs the new tests.
- Scope: no adapter, normaliser, port change, or boundary-rule change. The replaying stand-in in each test only returns the expected outcomes.
- Honest status: the SpecKit features are labelled derived in each file and in the README; nothing claims that SpecKit's agent steps ran.
- Evidence check: the change adds only repository-relative links.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, after `npm install --ignore-scripts` added the two workspace links:

- The first `make verify` failed typechecking (a cast in the replaying stand-in); fixed with an explicit object. The next failed `verify:dependencies` with "Dependency evidence drift: docs/dependencies/licenses.json"; `npm run inventory:dependencies` regenerated the evidence, which adds only the two private workspace packages.
- `make verify` passed: 206 tests passed, 0 failed (12 new); coverage 100% lines, 99.86% branches, 100% functions; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; "Verified 492 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)"; strict OpenSpec validation 31 passed, 0 failed (the fixture `openspec/` tree is not part of the repository's validation); package verification passed.
- `npm run openspec -- validate author-sdlc-mapping-fixtures --strict`: valid.
- After the pass-1 fixes: `make verify` passed: 207 tests passed, 0 failed (13 new); coverage 100% lines, 99.86% branches, 100% functions; boundary and coverage scope checks passed; dependency inventory verified (492 package paths); strict OpenSpec validation 31 passed; package verification passed.

## Independent review

Assigned reviewer (rotation): Antigravity CLI, `agy -p <prompt> --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>`, run from the worktree, with the prompt, log, and snapshot files in a scratch directory outside it. The log named `gemini-4-argon-medium` ("Argon (Medium)"). The prompt named AGENTS.md, all nine ADR 0004 principles, the governance review process, the agent task protocol, architecture section 6, the SDLC framework mapping, the SpecKit capture record, the draft port's design and spec, and this change's delta as criteria, and asked for every instance of each problem with severity, file, line, and fix. Each pass reviewed the uncommitted change on the base above. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1** (conversation `ac485b8a-8dbc-42a2-8dd6-e4c771260e2f`, snapshot `d76f1179a60342aa94dba11af3392c738096f4f3cd8f2583112e2c98ac0dbbb6`). The reviewer confirmed the byte-for-byte copies (archive, base specs at `0729388^` and `4f78d29^`, SpecKit scaffold), the derived labels, the package contract, and the boundary rules. Findings: 0 Critical, 0 High, 2 Medium, 3 Low. All accepted and resolved:
  1. Medium: the OpenSpec instruction rule did not cover the native `apply` and `archive` stages, which are not artifacts (`apply` has state-dependent instructions and `archive` has no `instruction` field). The README defines both; each fixture has an `apply` case (the CLI's all-tasks-done instruction, saved as `expected/instructions/apply.md`, with all four artifacts as inputs and no output) and an `archive` case that fails with `invalid`, like `verify` and `review`; the CLI test checks the `apply` text.
  2. Medium: SpecKit's native `implement` stage had no command mapping or instruction rule. `implement` maps to `speckit.implement.md`, the README defines its inputs (`spec`, `plan`, `tasks`) and empty outputs, and each fixture has an `implement` case.
  3. Low: the OpenSpec provenance tests did not cover `config.yaml`, the base specs, or extra files. A test checks the exact file list, the configuration against the repository's, and literal digests of both base specs, and the CLI test runs `validate --all --strict`, which also validates the base specs.
  4. Low: the derived-label check did not verify the named source change. Each SpecKit fixture records its source change, and the test compares the captured name.
  5. Low: task 2.1 was unchecked although `make verify` had run. Checked.
- **Pass 2** (conversation `787d1624-76a5-4613-b95a-daf15abd3f7c`, snapshot `009866b0b716a480bd703ab7299327c53418320294b0348841d172c299f2da21`). All five pass-1 findings confirmed resolved; the whole change reviewed again. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

## Limitations

- The SpecKit features are derived, not agent output.
- No fixture has invalid structure or a missing artifact.
- Finalization expects the archive date 2026-10-24; an adapter test must pin it and archive a copy.

## Remaining gates

- Integration into `dev` by the coordinating session, then archiving the change.
