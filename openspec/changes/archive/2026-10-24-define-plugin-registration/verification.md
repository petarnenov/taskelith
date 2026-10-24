# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 work item 8 in [docs/g1-plan.md](../../../docs/g1-plan.md), started under the owner's G1 authorization recorded there; the owner's decisions D2 and D3 are recorded in the plan. Base revision: `47a0931` on `dev`. Scope: the new private workspace package `packages/plugin-sdk` (`@taskelith/plugin-sdk`) with its manifest schema, registration function, and tests; the exact-pinned runtime dependency `ajv@8.20.0` in that package; JSON support in the shared package TypeScript configuration; the contract tooling rows of the dependency register and the regenerated inventory; and this change, which adds the `plugin-registration` capability.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one concept per source file (manifest schema and type, the ajv adapter, plugin API compatibility, registration), small functions, comments only for rationale and contracts.
- SOLID and hexagonal architecture: the SDK depends only on the kernel and ajv; ports are supplied by the host rather than hard-coded, and the plugin API version is the SDK's own constant (design decision 7). The package compiles with `"lib": ["ES2022"]` and `"types": []`, so it uses no Node API.
- Microkernel: no harness, provider, SCM, or SDLC framework is named in the source; tests use the port name `SdlcFramework` from architecture section 6 and a neutral plugin identifier.
- OpenAPI and document-first schemas: the manifest schema is a JSON Schema document written first and compiled at run time; its placement in the SDK rather than `packages/contracts` is justified in design decision 1, and the hand-written type with the generation follow-up in design decision 3.
- Docker: not applicable; the package is not runnable.
- Makefile and OpenSpec: checked through `make verify`; this change tracks the work.
- Coverage: the plugin SDK tests cover every line, branch, and function of the compiled package.

The published root package is unchanged: the root `package.json` is not modified, and package verification passed.

Evidence check: every link this change adds is repository-relative; the register row links to the ajv tag `v8.20.0` already cited.

## Checks

Before review, Node v24.22.1, npm 12.2.1, in the worktree at base `47a0931` with the change uncommitted; the result was committed as `0f6bcab`:

- `npm install --ignore-scripts` added `ajv@8.20.0` and its four dependencies (`fast-deep-equal@3.1.3`, `fast-uri@3.1.9`, `json-schema-traverse@1.0.0`, `require-from-string@2.0.2`) under the plugin SDK to `package-lock.json`.
- `npm run inventory:dependencies` regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`: 492 package paths, 14 with license coverage gaps, as before. The five new paths are the only non-development packages; each declares MIT, except `fast-uri` (BSD-3-Clause), and each ships a top-level license file, so none adds a gap.
- `npm audit --omit=dev --json` reported 0 vulnerabilities over 10 production dependency entries.
- `npm run openspec -- validate define-plugin-registration --strict` passed.
- `make verify` (with `OPENSPEC_TELEMETRY=0`) passed: the package contract and workspace boundary checks passed; 96 tests passed, 13 of them in the plugin SDK; coverage was 100% for lines, branches, and functions over all compiled product modules, including every plugin SDK module; every product module was in the coverage report; the dependency inventory was verified; strict OpenSpec validation passed (25 items); package verification passed.

## Independent review

Assigned reviewer (rotation): Claude Code 2.1.310 with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt passed on stdin and run from the worktree; the JSON output's `modelUsage` reports `claude-fable-5-1`. The prompt named the ADR 0004 principles and asked for every instance of a problem. Before and after each pass, a SHA-256 snapshot of `git ls-files -co --exclude-standard` in the worktree was taken.

- **Pass 1 — session `f94b354b-be39-4f58-822e-ad8e4206ba55`, reviewed `0f6bcab` (diff `47a0931...HEAD`).** A first invocation ended with `Error: No messages returned from query` and no output; it was rerun unchanged. Snapshots (332 files) before and after the completed run were equal. The reviewer reproduced strict OpenSpec validation, the type check, the 96 tests, 100% plugin SDK coverage, the lockfile integrity, and the absence of ajv strict-mode warnings; it could not run `make verify`, because its Node and npm differ from the pins. Findings: 0 Critical, 0 High, 1 Medium, 4 Low, all accepted and fixed in `3e5a6a8`:
  1. Medium: the exported `satisfiesCaretRange` returned wrong answers for inputs its signature accepts (`1.2.3-beta` and `1.2` satisfied `^1.2.3`; a range without `^` was silently parsed). It now accepts only release versions and `^MAJOR.MINOR.PATCH` ranges and returns `false` for anything else; tests cover the reported inputs, and the specification has a new requirement, "Caret range semantics", with an "Unsupported forms" scenario, split out of "Compatible plugin API only".
  2. Low: the schema declared `$schema` 2020-12 while the design called it reusable from AsyncAPI, and the evaluation's shared-schema rule omits `$schema`. The declaration is removed (`Ajv2020` defaults to 2020-12); design decision 2, the proposal, the specification, and the schema description say so and list the annotation keywords.
  3. Low: the validator was compiled at import, and ajv's `ErrorObject` lived beside the domain type. A new `manifest-schema-validator.ts` adapter compiles on first use and returns the manifest or readable violations; no ajv type leaves it (design decision 8).
  4. Low: the counts in the register's audit section and in `docs/dependency-inventory.md` described the earlier lockfile. Both are now labelled as evidence of their own change and state what item 8 added: 492 installation paths, 143 bundled entries, 483 license/notice files, 467 deduplicated SBOM components, and 14 reviewed gaps.
  5. Low: this record tied evidence only to the base revision and an uncommitted diff. Checks after the fixes are recorded below against the fix commit.

After the fixes, Node v24.22.1, npm 12.2.1, `make verify` (with `OPENSPEC_TELEMETRY=0`) passed on the tree of `3e5a6a8`: boundary checks; 97 tests, 14 in the plugin SDK; 100% line, branch, and function coverage over all compiled product modules, including every plugin SDK module; the dependency inventory; strict OpenSpec validation (25 items); package verification. The Medium finding required pass 2.
- **Pass 2 — session `04640c77-5789-410a-9861-f1dcefe84f15`, reviewed `3e5a6a8` (diff `47a0931...HEAD`, with attention to the pass 1 fixes).** Snapshots (333 files) before and after the pass were equal. The reviewer confirmed each pass 1 fix, reproduced strict OpenSpec validation (25 items), the 97 tests (14 in the plugin SDK), 100% coverage, the lockfile, and the inventory counts, and found that edge inputs (`__proto__` keys, overlong values, leading zeros, Unicode, newlines) are rejected; it again could not run `make verify` because of its Node and npm versions. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. All accepted and fixed without another pass, as the review process allows for a Low-only pass; **these fixes have not been independently reviewed**:
  1. The "Manifest field formats" requirement omitted the 64-character limit on `version` and `pluginApiRange` and the 64-capability limit that the schema enforces; it now states them, its scenario adds 65 capabilities, and the tests cover 65 capabilities and an overlong `version`.
  2. "Holds no state" conflicted with the memoized validator; the "Library-level registration" requirement now says the function keeps no registry of admitted plugins.
  3. Pass 1's fixes were identified only by commit message; they now name `3e5a6a8`.
  4. Design decision 2 called `$id` an annotation; it now says the identifier `$id` and the annotations `title` and `description`.
  5. The `PLUGIN_API_VERSION` test accepted leading zeros that the compatibility rule rejects; it now uses the strict release pattern and checks that the version satisfies its own caret range.

After the pass 2 fixes, Node v24.22.1, npm 12.2.1, `make verify` (with `OPENSPEC_TELEMETRY=0`) passed on the tree of the commit `chore: resolve the second review pass of the plugin registration`: boundary checks; 97 tests, 14 in the plugin SDK; 100% line, branch, and function coverage over all compiled product modules, including every plugin SDK module; the dependency inventory; strict OpenSpec validation (25 items); package verification.

Remaining findings: 0.

## Remaining gates

Integration into `dev`; promotion to `main`.
