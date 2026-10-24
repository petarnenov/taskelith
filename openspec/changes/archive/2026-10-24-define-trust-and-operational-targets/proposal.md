## Why

The owner requested continuation of remaining authorized G0 tasks after the independent Codex review of the existing G0 foundation changes. The G0 foundation ledger (`docs/foundation.md`) and architecture delivery plan (`docs/architecture.md` section 13) require:
1. An explicit identity and trust model (operator bootstrap/recovery, project-scoped roles, worker enrollment/revocation, trusted-host execution boundary, and plugin capability scoping).
2. Explicit provisional operational targets (resource budgets, retention windows, availability, and recovery objectives) defined before implementation and benchmark measurements.
3. Hexagonal workspace/module boundary enforcement and full repository TypeScript typechecking (`src/`, `scripts/`, `test/`) in CI and `npm test`, since the current build only typechecks `src/cli.ts`.

## What Changes

- Define the G0 identity, enrollment, and trust boundary contract in `docs/trust-model.md`.
- Define provisional G0 operational targets, resource budgets, retention horizons, and RPO/RTO baselines in `docs/operational-targets.md`.
- Add `tsconfig.check.json` and `scripts/check-boundaries.ts` (with unit tests in `test/check-boundaries.test.ts`) to typecheck all repository TypeScript (`src/`, `scripts/`, `test/`) and enforce hexagonal layer, module, and composition-root import boundaries automatically in `npm test` and CI.
- Update `docs/foundation.md`, `docs/architecture.md`, `README.md`, `package.json`, and `.github/workflows/release.yml` to wire the new contracts and checks, while keeping unresolved owner decisions explicit.

## Capabilities

### New Capabilities
- `trust-and-operational-foundation`: Identity/trust model contract, provisional operational targets, and automated hexagonal boundary and repository typecheck enforcement.

### Modified Capabilities

None.

## Impact

Documentation, repository typechecking (`tsconfig.check.json`), hexagonal boundary validator (`scripts/check-boundaries.ts`), unit tests (`test/check-boundaries.test.ts`), and CI verification wiring. No changes to published CLI runtime behavior, `dist/` output, or package tarball contents.
