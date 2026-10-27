# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 work item 2 in [docs/g1-plan.md](/docs/g1-plan.md), started under the owner's G1 authorization recorded there. Base revision: `41787eb` on `dev`; `origin/dev` at `c5848a9`, which contains item 1, was merged into the branch afterwards. Scope: the new private workspace package `packages/kernel` (`@taskelith/kernel`) with its tests, and this change, which adds the `shared-kernel` capability. It depends on item 1, `establish-g1-workspace`, which supplies the npm workspace, the package build, the test and coverage globs, and the boundary rules for packages.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one concept per source file, small functions, validation isolated in constructors, comments only for rationale and contracts.
- SOLID and hexagonal architecture: the kernel has no runtime dependency, imports nothing outside its own `src/`, compiles with `"types": []` so no Node API is declared, and reads no clock or random source (a review rule, because ECMAScript `Date.now` remains typed); identifier and time generation are left to ports owned by modules (design decision 1).
- Microkernel: no harness, provider, SCM, or SDLC framework is named in the kernel.
- OpenAPI: the kernel defines no wire contract; wire validation stays with the generated schemas (design decision 8).
- Makefile and OpenSpec: checked through `make verify`; this change tracks the work.
- Coverage: the kernel tests cover every line, branch, and function of the compiled package.
- Docker: not applicable; the package is not runnable.

Evidence check: the change adds no external link.

## Checks

Before item 1 was merged, with Node v24.22.1 and npm 12.2.1, the package was built with `tsc --build packages/kernel/tsconfig.json` and its tests were run through a local, uncommitted `node_modules/@taskelith/kernel` link: 16 tests passed, and every compiled kernel module had 100% line, branch, and function coverage. The tests type-checked against the root compiler options. `openspec validate add-shared-kernel --strict` passed.

After merging `origin/dev` at `c5848a9` and moving the package `tsconfig.json` to the item 1 package contract (`extends ../../tsconfig.package.json`, `"types": []`), `npm install --ignore-scripts` added the workspace link to `package-lock.json`, and `npm run inventory:dependencies` regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json` (487 package paths; the SBOM lists `@taskelith/kernel` as a private component). In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed: the package contract and workspace boundary checks passed, 50 tests passed, coverage was 100% for lines, branches, and functions over all compiled product modules including every kernel module, every product module was in the coverage report, the dependency inventory was verified, strict OpenSpec validation passed (21 items), and package verification passed.

## Independent review

Assigned reviewer (rotation): Claude Code 2.1.310 with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt passed on stdin and run from the worktree; the JSON output's `modelUsage` reports `claude-fable-5-1`. The prompt named the ADR 0004 principles and asked for every instance of a problem. SHA-256 snapshots of `git ls-files -co --exclude-standard` in the worktree (274 files) before and after the pass were equal.

- **Pass 1 — session `2b97965a-9195-4056-b55e-19a67a84ccc3`, reviewed `0a155f4` (diff `c5848a9...HEAD`).** The reviewer reproduced strict OpenSpec validation, the 16 kernel tests, 100% kernel coverage, and the boundary rules. Findings: 0 Critical, 0 High, 0 Medium, 8 Low. All accepted and fixed without another pass, as the review process allows for a Low-only pass; **these fixes have not been independently reviewed**:
  1. Design decision 1 implied that `"types": []` keeps the clock and random source out, but the default `lib` still declared DOM APIs. The package `tsconfig.json` now sets `"lib": ["ES2022"]`, and the design and self-check state that not calling `Date.now` or `Math.random` remains a review rule.
  2. The identifier failure message said "without spaces"; it now says "without whitespace", like the specification.
  3. The event type format was described as "lowercase segments" while digits, hyphens, and trailing hyphens were accepted. Segments are now lowercase letters, digits, and inner hyphens, each starting with a letter; code, design, and specification say so, and tests cover trailing, leading, and doubled hyphens.
  4. The "first invalid field" test changed one field per case. A test with two invalid fields now expects the first.
  5. Three scenarios described future modules and could not be tested by this change. They now describe kernel behavior: the declared identifier kinds, `ok` and `err` values, and the exact metadata fields.
  6. The coverage requirement demanded 100% that `make verify` does not enforce. It now requires the enforced 75% thresholds and recording kernel coverage in verification evidence.
  7. Design decision 6 called per-producer sequence execution-only, while architecture section 9 states it for events generally. Sequence is now deferred to the wire envelopes of G1 item 13, in the design, the specification, and the code comment.
  8. `MAX_EVENT_TYPE_LENGTH` was private while the test hard-coded the limit. It is now exported, and the tests use it.

After the fixes, `make verify` passed: 51 tests, 100% line, branch, and function coverage over all compiled product modules including the kernel, strict OpenSpec validation (21 items), dependency inventory, and package verification.

Remaining findings: 0.

## Remaining gates

Integration into `dev`; promotion to `main`.
