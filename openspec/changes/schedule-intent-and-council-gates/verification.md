# Verification

Record of the author's work before review; it names the checks that have not run yet (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28), recording the owner's decisions of 2026-10-28 that approved the coordinator's three recommendations on the timing of ADR 0013: `schedule-intent-and-council-gates`, size S-M, documentation only.
- **Base revision:** `a3a0ac4c` (`origin/dev`, merge of pull request #393, `declare-contract-breaking-changes`).
- **Scope:** ADR 0016; the obligation trace and the scope notes of items 11 and 22 in `docs/g3-plan.md`; the delivery sequence and section 15 of `docs/architecture.md`; the status notes of ADR 0013, ADR 0014, and ADR 0003 and the amendment of ADR 0003 decision 1; the harness order sentence of `docs/integration-candidates.md`; the `delivery-planning` spec delta.
- **Out of scope:** the G9 and G10 plans, any G3 item other than the scope notes, and the statements design "Not changed" lists.

## Environment

The owner's 2020 Intel iMac: macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm.

## Author self-check

- **Owner decisions.** ADR 0016 decisions 1 to 6 state the brief's three decisions: the trace (1), G9 with its start, overlap, and exit evidence (2), G10 (3), the ADR 0003 amendment (4), the order before G8 (5), and authorization only as gate plans (6). The G10 exit evidence in the architecture row is the author's reading of ADR 0014 (design D5).
- **Obligation trace.** Every row's citation was read at `a3a0ac4c`: `docs/contracts/product-ports.md:28`, `:33`, `:179`, `:208`, `:230`, and `:271`; `docs/contracts/git-workspace.md:58` and `:89`; `packages/modules/workspace/src/domain/workspace.ts:105`; `apps/control-plane/src/application/task-service.ts:45`; `docs/architecture.md:317`; `openspec/specs/launch-authorization/spec.md:9`; `docs/contracts/capacity-reservation.md:19` to `:31`; `docs/contracts/agent-harness-port.md:89`; `docs/contracts/account-pool.md:33` and `:47`. Open rows: the project's integration branch (item 11), decision records (item 22), and model and effort per session (items 18 and 19); partly covered: council decisions on the board and in the inbox (G10).
- **Spec delta.** `delivery-planning` adds "Intent and council delivery gates" (403 characters), "Authorized plans for G9 and G10" (171), and "Forward-compatibility obligations traced" (284).
- **Sweep.** `docs/` and `openspec/specs/`, without archives, were searched for "not fixed", "Recorded, not authorized", "authorizes no implementation", "in that order", and the harness lists; the statements changed and those kept are in the proposal and design "Not changed".
- **Links.** Links in `docs/` are relative within `docs/` except in `docs/architecture.md`, which uses its absolute repository links; this change's records link only root-relative.

## Checks and results

Author checks on the working tree before the first commit:

- `npm run openspec -- validate schedule-intent-and-council-gates --strict`: `Change 'schedule-intent-and-council-gates' is valid`.
- `npm run openspec -- validate --all --strict`: `Totals: 72 passed, 0 failed (72 items)`.
- `npm run verify:links`: `Every checked link conforms.`

## Route and make verify

To be completed after the route.

## Remaining gates

- Independent review, passes as `route.json` and the coordinator assign.
- Archive of the change on the branch.
- Integration into dev by the coordinator (single pull request).
