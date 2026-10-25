# Verification: remove-predecessor-non-null-assertion

## Scope and source

Assigned on 2026-10-25 by the coordinator (Niki) to the UI worker (Desi), as a follow-up from Pepi on G2 item 13, and handed back to Niki. Base revision: `51fb660` on `dev`. Prepared in the git worktree `../taskelith-worktrees/remove-predecessor-non-null-assertion` on branch `remove-predecessor-non-null-assertion`. Scope: `PostgresFleetRegistry.expirePredecessors` in `packages/adapters/postgres/src/fleet-repositories.ts`, one test in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`, and this change. Commit type `chore`, as the coordinator set. The requirement is unchanged, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- The check follows the in-memory registry's idiom (`packages/modules/fleet/src/adapters/in-memory-fleet.ts`, `expirePredecessors`): skip a worker without a predecessor and count only expired ones. The fleet conformance case "expired predecessors are dropped and recorded for revocation" still passes on both registries.
- The new test fails without the fix: with the old code it ends in `TypeError: Cannot read properties of undefined (reading 'validUntil')`.
- No other method, query, or column handling changed.
- Evidence check: no link added.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`; `make verify` pins the same Node through `scripts/with-pinned-node.sh` and starts its own services.

- `bash scripts/services.sh run postgres node --experimental-strip-types --test --test-name-pattern="no predecessor" packages/adapters/postgres/test/fleet-conformance.integration.test.ts`: 0 passed, 1 failed with the old `fleet-repositories.ts` (stashed); 1 passed with the fix.
- Before pass 1: `npm run openspec -- validate remove-predecessor-non-null-assertion --strict` passed; `npm run verify:comments` passed; `make verify` passed (930 tests, 0 failures; coverage 99.15 % lines, 91.93 % branches, 98.89 % functions; strict OpenSpec validation 53 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Pending.

## Limitations

- A row whose `predecessor_valid_until` is set while its record holds no predecessor stays selectable and is skipped on every sweep until its next write; clearing the column is outside this change's scope.

## Remaining gates

- Coordinator integration into `dev` and archive.
