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
- **Obligation trace.** Every row's citation was read at `a3a0ac4c`: `docs/contracts/product-ports.md:28`, `:33`, `:179`, `:208`, `:230`, and `:271`; `docs/contracts/git-workspace.md:58` and `:89`; `packages/modules/workspace/src/domain/workspace.ts:105`; `apps/control-plane/src/application/task-service.ts:45`; `docs/architecture.md:317`; `openspec/specs/launch-authorization/spec.md:9`; `docs/contracts/capacity-reservation.md:19` to `:31`; `docs/contracts/agent-harness-port.md:89`; `docs/contracts/account-pool.md:33` and `:47`. Open rows: the project's integration branch (item 11), decision records (item 22), and model and effort per session (items 18 and 19); partly covered: council decisions on the board and in the inbox (G10), and, since pass 1, capacity budgets (G9) and the per-change workspace branch (item 16).
- **Spec delta.** `delivery-planning` adds "Intent and council delivery gates" (403 characters), "Authorized plans for G9 and G10" (171), and "Forward-compatibility obligations traced" (284; 452 after pass 1).
- **Sweep.** `docs/` and `openspec/specs/`, without archives, were searched for "not fixed", "Recorded, not authorized", "authorizes no implementation", "in that order", and the harness lists; the statements changed and those kept are in the proposal and design "Not changed".
- **Links.** Links in `docs/` are relative within `docs/` except in `docs/architecture.md`, which uses its absolute repository links; this change's records link only root-relative.

## Checks and results

Author checks on the working tree before the first commit:

- `npm run openspec -- validate schedule-intent-and-council-gates --strict`: `Change 'schedule-intent-and-council-gates' is valid`.
- `npm run openspec -- validate --all --strict`: `Totals: 72 passed, 0 failed (72 items)`.
- `npm run verify:links`: `Every checked link conforms.`
- `make verify` on `f17bcee8` (tree `70668be2`), docs-only profile: passed, exit 0; `make record` wrote the generated part below from its log.

## Route and make verify

- `make findings ARGS="route --change schedule-intent-and-council-gates"` on `f36f7e74`, committed unedited as `route.json` in `445b30a4`: `standard (no trigger), rule version 1`; pass 1, reviewer A: `codex gpt-6.1-sol#medium`; pass 2, reviewer B: `claude claude-opus-5-5#high`; shadow `jev-1.14.0` standard (0.88), agrees with the rule; recommendation only.
- `make verify` on `445b30a4` (tree `018b2687`), docs-only profile: the first run failed in `npm run verify:package` because `dist/cli.js` was missing, since the profile skips `make test`, which builds, and this fresh worktree had no build. After `npm run build`, which changes no tracked file, the second run passed, exit 0; totals below.

## Review pass 1

Reviewer A, Codex CLI (gpt-6.1-sol, effort medium), session `01a18294-e032-78a1-8c38-e7bb8a42d960`: 0 Critical, 0 High, 2 Medium, 0 Low, all fixed in `f03d178f` after merging `origin/dev` at `10fc3bbe` (`3b37c6c8`, no conflict).

- **M1 (docs).** The workspace row of the obligation trace is now partly covered: the base branch passed with each prepare (`docs/contracts/git-workspace.md:58`) is met; the per-change branch is open, because the contract names one branch per task (`:89`) while a card is one run of many tasks (`docs/contracts/product-ports.md:70`) and the push rule names the branch of the card's change (`:208`). Item 16 closes it through a versioned change of the item 6 contract. The citations were reread at `a3a0ac4c`.
- **M2 (spec-wording).** The requirement "Forward-compatibility obligations traced" names the four statuses the table uses, covered, partly covered, open, and not a G3 item, each with what it carries, and adds the scenario "Partly met obligation". The table's legend defines the same names; the capacity row became partly covered and the scheduling row covered.

Checks after the fixes:

- `npm run openspec -- validate --all --strict`: `Totals: 72 passed, 0 failed (72 items)`.
- `make findings ARGS="validate"`: `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).`
- `npm run verify:links`: `Every checked link conforms.`

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile docs-only, tree `70668be2be9d24746034664edc1a0db8344b3ff7`; no test totals in the log; no coverage totals.
- `npm run openspec -- validate schedule-intent-and-council-gates --strict`: passed, `Change 'schedule-intent-and-council-gates' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).`.
- Spec diff against the merge base `10fc3bbe6b7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18294-e032-78a1-8c38-e7bb8a42d960` | 0 | 0 | 2 | 0 |
<!-- make record: end -->

## Remaining gates

- Independent review, passes as `route.json` and the coordinator assign.
- Archive of the change on the branch.
- Integration into dev by the coordinator (single pull request).
