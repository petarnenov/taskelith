# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 work item 8 in [docs/g1-plan.md](../../../docs/g1-plan.md), started under the owner's G1 authorization recorded there; the owner's decisions D2 and D3 are recorded in the plan. Base revision: `47a0931` on `dev`. Scope: the new private workspace package `packages/plugin-sdk` (`@taskelith/plugin-sdk`) with its manifest schema, registration function, and tests; the exact-pinned runtime dependency `ajv@8.20.0` in that package; JSON support in the shared package TypeScript configuration; the contract tooling rows of the dependency register and the regenerated inventory; and this change, which adds the `plugin-registration` capability.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one concept per source file (manifest schema and type, plugin API compatibility, registration), small functions, comments only for rationale and contracts.
- SOLID and hexagonal architecture: the SDK depends only on the kernel and ajv; ports are supplied by the host rather than hard-coded, and the plugin API version is the SDK's own constant (design decision 7). The package compiles with `"lib": ["ES2022"]` and `"types": []`, so it uses no Node API.
- Microkernel: no harness, provider, SCM, or SDLC framework is named in the source; tests use the port name `SdlcFramework` from architecture section 6 and a neutral plugin identifier.
- OpenAPI and document-first schemas: the manifest schema is a JSON Schema document written first and compiled at run time; its placement in the SDK rather than `packages/contracts` is justified in design decision 1, and the hand-written type with the generation follow-up in design decision 3.
- Docker: not applicable; the package is not runnable.
- Makefile and OpenSpec: checked through `make verify`; this change tracks the work.
- Coverage: the plugin SDK tests cover every line, branch, and function of the compiled package.

The published root package is unchanged: the root `package.json` is not modified, and package verification passed.

Evidence check: every link this change adds is repository-relative; the register row links to the ajv tag `v8.20.0` already cited.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree at base `47a0931` with the change uncommitted:

- `npm install --ignore-scripts` added `ajv@8.20.0` and its four dependencies (`fast-deep-equal@3.1.3`, `fast-uri@3.1.9`, `json-schema-traverse@1.0.0`, `require-from-string@2.0.2`) under the plugin SDK to `package-lock.json`.
- `npm run inventory:dependencies` regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`: 492 package paths, 14 with license coverage gaps, as before. The five new paths are the only non-development packages; each declares MIT, except `fast-uri` (BSD-3-Clause), and each ships a top-level license file, so none adds a gap.
- `npm audit --omit=dev --json` reported 0 vulnerabilities over 10 production dependency entries.
- `npm run openspec -- validate define-plugin-registration --strict` passed.
- `make verify` (with `OPENSPEC_TELEMETRY=0`) passed: the package contract and workspace boundary checks passed; 96 tests passed, 13 of them in the plugin SDK; coverage was 100% for lines, branches, and functions over all compiled product modules, including every plugin SDK module; every product module was in the coverage report; the dependency inventory was verified; strict OpenSpec validation passed (25 items); package verification passed.

## Independent review

Pending.

## Remaining gates

Independent review; integration into `dev`; promotion to `main`.
