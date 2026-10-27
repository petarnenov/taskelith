## Why

G1 item 1 in the [G1 work plan](/docs/g1-plan.md). The owner chose npm workspaces with private packages under `packages/`, each created with its first real use (decision D1, 2026-10-24). Before the kernel and the first module can be added, the build, tests, coverage gate, dependency inventory, and boundary check must handle workspace packages.

## What Changes

- Declare the architecture's `packages/` paths as npm workspaces in the root manifest; add no package yet.
- Define a workspace package contract (private, `@taskelith/<directory name>`, one root export with types, a `tsconfig.json` extending the shared `tsconfig.package.json`, project references matching its workspace dependencies) and check it before building.
- Build every existing workspace package with `tsc --build`, ordered by those references and before the root package (`scripts/build-workspaces.ts`), succeeding when none exists.
- Run tests under each package's `test/`, measure coverage over each package's `dist/`, and extend the coverage scope check to each package's `src/`.
- Skip workspace packages, which are first-party code, in the dependency inventory, accepting only links that point to a declared workspace package under the same name, while still inventorying packages installed inside them.
- Resolve workspace package names in the boundary check so that the existing module and web rules apply to named imports; apply the layer rules inside a package's `src/` and not to module tests; forbid relative imports across packages, subpath imports, development code imported from any package's `src/`, and workspace imports from the published root package; add kernel and plugin rules.
- Typecheck package sources and tests.
- Record the layout in architecture section 6 and amend ADR 0004 principle 9.

## Capabilities

### New Capabilities
- `workspace-packages`: the npm workspace layout and how verification handles its packages.

### Modified Capabilities
- `engineering-principles`: the coverage threshold covers every workspace package.
- `trust-and-operational-foundation`: typechecking and boundary rules cover workspace packages, the kernel, and plugins.

## Impact

`package.json`, `package-lock.json`, `tsconfig.check.json`, the new `tsconfig.package.json`, `scripts/`, `test/`, the dependency inventory's provenance hashes (root manifest, lockfile, and inventory script), architecture section 6, and ADR 0004. The published npm package is unchanged.
