## Context

G0 requires establishing the identity/trust boundary, provisional operational targets, and automated hexagonal workspace boundary checks before G1 domain/SDLC contracts and G2 execution are implemented. Currently, `tsconfig.json` only typechecks `src/**/*.ts`, leaving `scripts/*.ts` and `test/*.ts` out of automated `tsc` verification, and no automated boundary checker enforces the hexagonal rules defined in `docs/architecture.md` section 6 (R03, R30, R36).

## Goals / Non-Goals

Provide concrete, reviewable G0 contracts for identity/trust and provisional operational targets, and enforce full TypeScript typechecking plus hexagonal import rules in `npm test` and CI. Do not implement runtime authentication endpoints, database schemas, or worker daemons in this change, and do not select unqualified third-party agent harnesses or SCM integrations without owner scope confirmation.

## Decisions

1. **Identity and trust contract (`docs/trust-model.md`):**
   - Separate installation identity, operator principals, project roles (`owner`, `maintainer`, `operator`, `viewer`), worker identities, and attempt-scoped execution tokens.
   - Require one-time, short-lived enrollment tokens exchanged for per-worker credentials; support explicit rotation, immediate revocation of future launch authority, and recovery-epoch fencing.
   - Define the initial worker boundary as explicitly enrolled trusted hosts with per-workspace credential scoping, while keeping in-process plugins documented as trusted code scoped by SDK ports (not an OS sandbox).

2. **Provisional operational targets (`docs/operational-targets.md`):**
   - Record concrete provisional targets before measurements occur: worker and project/run resource budgets (CPU, memory, disk, concurrent attempts, child delegation sharing), stream/journal/evidence/tombstone retention windows, and provisional RPO/RTO and latency budgets for 10, 100, and 1000 worker tiers.
   - Distinguish provisional targets from measured results and operator-specific production SLAs.

3. **Automated boundary and repository typechecking (`tsconfig.check.json`, `scripts/check-boundaries.ts`):**
   - Keep `tsconfig.json` scoped to `src/**/*.ts` so `npm run build` emits only `dist/cli.js` for the published package.
   - Add `tsconfig.check.json` (`noEmit: true`, `allowImportingTsExtensions: true`) covering `src/**/*.ts`, `scripts/**/*.ts`, and `test/**/*.ts`.
   - Implement `scripts/check-boundaries.ts` to scan product and repository TypeScript/code for:
     - Prohibited Go source files (`*.go`, `go.mod`, `go.sum`) or Go bridges (R02, R36).
     - Hexagonal layer violations under `src/` and future `packages/` / `apps/`: `domain` importing `application`, `ports`, `adapters`, `plugins`, or infrastructure SDKs; `application` or `ports` importing concrete `adapters`, `plugins`, or infrastructure SDKs; cross-module internal imports bypassing public `index.ts` exports; and SPA (`apps/web`) importing server/worker modules or Node built-ins (R03).
   - Test the boundary checker against valid and invalid synthetic directory trees in `test/check-boundaries.test.ts`.

## Risks / Trade-offs

Provisional operational targets are baseline engineering budgets to judge G2–G7 tests against, not claims of already measured capacity. The boundary checker validates current `src/` and any future `packages/`/`apps/` directories; rules will be exercised by unit fixtures now and by real modules as G1+ packages are added.
