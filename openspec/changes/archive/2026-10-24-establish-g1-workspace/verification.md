# Verification: establish-g1-workspace

## Scope and source

G1 item 1 of the [G1 work plan](../../../docs/g1-plan.md). Owner decision D1 on 2026-10-24: npm workspaces with private packages under `packages/`, each created with its first real use. The owner authorized starting the next task and merging completed, reviewed tasks without separate approval. Base revision: `41787eb` on `dev`. Scope: `package.json`, `package-lock.json` (workspace list only), `tsconfig.check.json`, `tsconfig.package.json` (new), `scripts/build-workspaces.ts` and `scripts/workspace-packages.ts` (new), `scripts/check-coverage-scope.ts`, `scripts/check-boundaries.ts`, `scripts/dependency-inventory.ts`, their tests, `docs/dependencies/licenses.json` (provenance hashes of the root manifest, lockfile, and inventory script), architecture section 6, ADR 0004 principle 9, and this change. Prepared in a git worktree.

## Author self-check before review

- No workspace package is created; the kernel is the next item.
- `docs/architecture.md` is packaged, so its link to the G1 plan is an absolute URL pinned to commit `1feb58b`, which is on `dev`.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree:

- From a state without `coverage/`, `make verify` passed: 29 tests passed, 0 failed; coverage 100% lines, branches, and functions; "No workspace packages to build."; "Every product module is in the coverage report."; dependency inventory verified; strict OpenSpec validation 19 passed; package verification passed.
- End-to-end check with a temporary `@taskelith/kernel` package (private, `exports` to `dist/`, its own `tsconfig.json`, a test importing it by name): the build compiled it, its test ran, coverage listed its `dist/`, and an added untested module failed the scope check with "Product modules missing from the coverage report: packages/kernel/src/extra.ts". The first attempt failed because the kernel rule rejected the kernel's own test importing `@taskelith/kernel`; the kernel and plugin rules now apply to `src/` only. Package verification passed with the package present. Dependency inventory generation first failed with "Linked package cannot establish inventory: node_modules/@taskelith/kernel"; after the inventory change it skipped the package and the SBOM listed it as a private component. The temporary package was removed and the inventory regenerated.
- After the pass-1 fixes, from a state without `coverage/`: `make verify` passed with 33 tests, coverage 100%, strict OpenSpec validation 19 passed, and package verification. A second end-to-end check from a clean state used two temporary packages, `@taskelith/kernel` and `@taskelith/sdlc` depending on it, with tests importing each by name: the contract check passed, `tsc --build` compiled the kernel first, 35 tests passed, coverage listed both packages' `dist/`, the build information file was written to `dist/.tsbuildinfo`, inventory generation and package verification passed. Removing the module's project reference made the build fail with "Workspace package contract: packages/modules/sdlc: tsconfig.json references must be exactly its workspace dependencies: [\"../../kernel\"]". The temporary packages were removed and the inventory regenerated; the link and evidence checks passed.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`. The worktree's SHA-256 snapshot was identical before and after each pass.

- **Pass 1.** Findings: 0 Critical, 2 High, 9 Medium, 3 Low. All accepted and resolved:
  1. High: builds were not ordered by package dependencies. A package contract now requires project references matching workspace dependencies, `tsc --build` orders by them, workspace packages build before the root, and a clean build of a dependent package was checked.
  2. High: named workspace imports bypassed the module and web rules. The checker resolves `@taskelith/` names to the package's public entry and applies the same rules.
  3. Medium: relative imports bypassed package encapsulation. A relative import that crosses product packages now fails.
  4. Medium: package sources could import development code. The rule now covers every package's `src/`, including its own tests.
  5. Medium: module tests inherited production restrictions. Module rules now skip `test/`.
  6. Medium: export-map subpaths were rejected without a stated policy. The contract allows exactly one root export, the check message says "root export", and the design and architecture state the policy and its reason.
  7. Medium: directory imports bypassed the domain rule. The rule now matches `application` and `ports` without a trailing slash.
  8. Medium: inventory link exclusions trusted unvalidated links. Links must have a safe key and target a declared workspace package with the same name that the lockfile lists; four invalid cases are tested.
  9. Medium: coverage includes could match dependency code. Coverage now excludes `**/node_modules/**`, and the design statement is corrected.
  10. Medium: the package TypeScript and declaration contract was unspecified. The shared `tsconfig.package.json` and the contract check define it.
  11. Medium: workspace packages had no package verification. The build checks each package's contract and its `dist/index.js` and `dist/index.d.ts`; the root's distribution constraint is enforced by the boundary check.
  12. Low: build information could land outside `dist/`. The shared base writes it to `dist/.tsbuildinfo`.
  13. Low: the new architecture link was unversioned. It is pinned to a commit.
  14. Low: the inventory change was described as only the root manifest hash. The proposal and this record name all three provenance inputs.
- **Pass 2.** Pass-1 findings 3, 5, 6, 8, 9, 10, 12, 13, and 14 confirmed resolved; findings 1, 2, 4, 7, and 11 resolved except for the gaps below. Findings: 0 Critical, 1 High, 4 Medium, 0 Low. All accepted and resolved:
  1. High: `package.json` `imports` aliases bypassed the boundary rules. Workspace packages may not declare `imports`, and the boundary check rejects `#` specifiers in product code.
  2. Medium: `optionalDependencies` were omitted from the expected references. Included.
  3. Medium: a dependency listed in several sections produced duplicate expected references. Deduplicated.
  4. Medium: the domain rule missed sibling `application` and `ports` files. The rule now matches file extensions as well as directories.
  5. Medium: comments or trailing commas in `tsconfig.json` crashed the contract check. It now uses TypeScript's configuration parser and reports parse errors with the file path.
- **Pass 3 (final).** All pass-2 resolutions confirmed present. Findings: 0 Critical, 1 High, 3 Medium, 1 Low. All were fixed after the final pass and are unreviewed:
  1. High: `import()` with an options argument and template-literal specifiers in `import()` and `require()` were not extracted. Both forms are now recognized, with regressions.
  2. Medium: relative imports through `node_modules` workspace links escaped package classification. Relative imports that reach `node_modules/` or `dist/` now fail.
  3. Medium: relative imports of build output escaped ownership and layer checks. Covered by the same rule.
  4. Medium: a single-file layer such as `domain.ts` was classified as the module root. The importing side now recognizes layer files as well as directories.
  5. Low: the architecture overstated the kernel and plugin rules. It now distinguishes workspace packages, relative imports, and external libraries.
  After these fixes `make verify` passed with 34 tests.
  The coverage scope command test copies scripts to a temporary directory; because the copied script now imports TypeScript, the test links the repository's `node_modules` there. After these fixes `make verify` passed with 34 tests.

Owner decision on 2026-10-24, in the project conversation: merge with the fixes made after the final pass (option 1).

## Remaining gates

None for this change; G1 continues with the shared kernel.
