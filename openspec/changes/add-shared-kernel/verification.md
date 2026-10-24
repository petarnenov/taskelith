# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 work item 2 in [docs/g1-plan.md](../../../docs/g1-plan.md), started under the owner's G1 authorization recorded there. Base revision: `41787eb` on `dev`; `origin/dev` at `c5848a9`, which contains item 1, was merged into the branch afterwards. Scope: the new private workspace package `packages/kernel` (`@taskelith/kernel`) with its tests, and this change, which adds the `shared-kernel` capability. It depends on item 1, `establish-g1-workspace`, which supplies the npm workspace, the package build, the test and coverage globs, and the boundary rules for packages.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one concept per source file, small functions, validation isolated in constructors, comments only for rationale and contracts.
- SOLID and hexagonal architecture: the kernel has no runtime dependency, imports nothing outside its own `src/`, compiles with `"types": []` so no Node API is available, and reads no clock or random source; identifier and time generation are left to ports owned by modules (design decision 1).
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

Pending.

## Remaining gates

Independent review; integration into `dev`; promotion to `main`.
