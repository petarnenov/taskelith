# Verification: fix-predecessor-sweep

## Scope and source

Assigned on 2026-10-25 by the coordinator (Niki) to the UI worker (Desi): the three follow-ups that the review of `remove-predecessor-non-null-assertion` left, to be handed back to Niki. Base revision: `c84ca71` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-predecessor-sweep` on branch `fix-predecessor-sweep`. Scope: `PostgresFleetRegistry.expirePredecessors` in `packages/adapters/postgres/src/fleet-repositories.ts`, the domain predicate `expiredPredecessor` in `packages/modules/fleet/src/domain/enrollment.ts` (exported and used by `InMemoryFleetRegistry` too), three tests in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`, the `installation-enrollment` delta, and this change. Commit type `chore`, as the coordinator set: `@taskelith/fleet` and `@taskelith/postgres` are private workspace packages, and `docs/releases.md` reserves `fix` for the published `taskelith` package.

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
- After the pass-1 fixes: the six sweep tests and the fleet module's tests passed (6 and 22), and `make verify` passed again (963 tests, 0 failures; same coverage; 54 strict validations).

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort medium, run from the worktree as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with the prompt and output outside the worktree.

- **Pass 1 — session `d7f742c3-8d6b-4456-b58f-c1d96129e786`, head `c1ae3e5`.** The JSON `modelUsage` confirmed `claude-fable-5-1`; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `6a0a08b802b8b4f61e4a1bad5762ea9d52e64b2a540d9246bdd2bd7c5e7af838` before and after the pass. The reviewer confirmed the rule against the in-memory registry and the domain's grace window, the repair through `#write`, the filter, the transaction and locking, that each test fails without the change, the decision not to add a conformance case, the delta, and the scope. Findings: 0 Critical, 0 High, 0 Medium, 4 Low. Because the pass found only Low findings, they were fixed without another review pass, as the review process allows; these fixes are unreviewed:
  1. The expiry rule was written twice, in both registries. It is now the domain predicate `expiredPredecessor`, used by both.
  2. The test of a row without a record did not prove that the row is left alone. It now compares the row before and after the sweep.
  3. `chore` for a behavior fix. Kept as the coordinator set; the rationale is recorded under Scope and source.
  4. "A due column" in a test name. It is "a due row whose predecessor is still in its grace window".

## Limitations

- A due row without an enrollment record keeps its column; the sweep only filters it out.

## Remaining gates

- Coordinator integration into `dev` and archive.
