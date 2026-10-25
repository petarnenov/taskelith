# Verification: fix-predecessor-sweep

## Scope and source

Assigned on 2026-10-25 by the coordinator (Niki) to the UI worker (Desi): the three follow-ups that the review of `remove-predecessor-non-null-assertion` left, to be handed back to Niki. Base revision: `c84ca71` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-predecessor-sweep` on branch `fix-predecessor-sweep`. Scope: `PostgresFleetRegistry.expirePredecessors` in `packages/adapters/postgres/src/fleet-repositories.ts`, three tests in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`, the `installation-enrollment` delta, and this change. Commit type `chore`, as the coordinator set.

## Author self-check before review

- One rule for both registries: a predecessor expires exactly when the record holds one whose `validUntil` has passed, as `InMemoryFleetRegistry.expirePredecessors` already decides; the PostgreSQL column only finds candidates.
- The fleet conformance case "expired predecessors are dropped and recorded for revocation" already covers the rule through the port ("not yet" at the rotation time, "expired" after the grace window) and passes on both registries. A column that disagrees with its record cannot be produced through the port, so the three cases are adapter tests.
- Each new test fails without the change: with the old sweep, "cleared, and the sweep goes on" and "grace window" fail on their assertions, and "without an enrollment record" ends in `TypeError: Cannot read properties of null (reading 'credentials')`.
- The delta changes the scenario "Due row without a predecessor" (it now clears the column) and adds two; the requirement's text and "Grace window" are copied unchanged.
- Evidence check: no link added.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`; `make verify` pins the same Node through `scripts/with-pinned-node.sh` and starts its own services.

- `bash scripts/services.sh run postgres node --experimental-strip-types --test --test-name-pattern="predecessor|enrollment record|grace window" packages/adapters/postgres/test/fleet-conformance.integration.test.ts`: 6 passed with the change; the three new tests alone, with the old `fleet-repositories.ts` stashed: 0 passed, 3 failed.
- Before pass 1: `npm run openspec -- validate fix-predecessor-sweep --strict` passed; `npm run verify:comments` passed; `make verify` passed (963 tests, 0 failures; coverage 99.19 % lines, 92.01 % branches, 99.01 % functions; strict OpenSpec validation 54 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Pending.

## Limitations

- A due row without an enrollment record keeps its column; the sweep only filters it out.

## Remaining gates

- Coordinator integration into `dev` and archive.
