# Verification: implement-account-pool-slot-store

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12a, developed by a briefed subagent of the worker session Pepi for the coordinator Niki: the slot records with their PostgreSQL adapter, the encrypted slot credential store with its key in `control-plane/`, the add-slot command with the slot limit of an admitted pair (account pool contract section 7.1), and the least-loaded selection of a `new-session` request inside the placement transaction (sections 3.2, 4.2, 4.5, and 4.7), with the conformance suites on the in-memory doubles and the PostgreSQL adapters ([design](design.md), decisions 1 to 10). No review pass has run yet.

## Revision

- Base: `dev` `8b18c540` (the brief's checklist base); `origin/dev` `027a18fa` (#408, `continue-after-context-warning`) was fast-forwarded into the branch before its first commit, so the branch starts at `027a18fa` and has no merge commit.
- `885a69ec` `chore: start the implement-account-pool-slot-store change` (the brief's `checklist.json`, saved `--at 8b18c540`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `be2bc190` `chore: store account slots and encrypted slot credentials and select slots in placement`.
- `6a8f0261` `docs: record the account pool slot store design and contract updates`.
- `436f3ef2` `docs: route the implement-account-pool-slot-store change` (`route.json`, unedited).

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12a only. 12b (cooldown from signals, affinity on resume, the selection after a limit) and 12c (delivery) are untouched; a `resumed-session` or `after-limit` request fails the placement with `invalid` (design, decision 8). No HTTP operation, slot command other than adding, sweep, or composition wiring is added (design, Q4).
- No new third-party dependency: the cipher uses `node:crypto`; `@taskelith/postgres` declares the cipher interface it needs and only its tests use `@taskelith/secrets`, already a development dependency.
- Hexagonal: selection, eligibility, and the add-slot command are in `@taskelith/scheduling`; SQL in `@taskelith/postgres`; the cipher in `@taskelith/secrets`; the key file in `@taskelith/control-plane-store`.
- Secrecy: tests use generated values without a known shape and no real credential; the database rows, the failures of `reveal`, the add-slot command, and a store that cannot commit, and the string, JSON, and inspection forms of the cipher are checked for the credential or key text.
- Concurrency on PostgreSQL: two placements racing for the last unit of a slot, two add-slot commands racing for the last allowed slot, and the conformance case of concurrent credential stores, each in transactions of their own.
- Contracts: account pool contract sections 6.1 and 7.1 and new section 11, capacity reservation contract section 13 "Provider credentials", control-plane wire contracts version note, `control-plane.openapi.json` 0.4.0 with its declaration; `make contract-compatibility` reports no undeclared breaking change.
- Comments: `npm run verify:comments` passes. OpenSpec requirements are 189 to 401 characters.

## Fail-before

On a detached worktree of `027a18fa` with the new and changed test files of `be2bc190` copied in (`packages/modules/scheduling/test/slot-selection.test.ts`, `slot-placement.test.ts`, `account-pool.test.ts`, `resource-admission.test.ts`, `board-obstacle-mirror.test.ts`, `packages/modules/execution/test/product-ports.test.ts`, `packages/contracts/test/control-plane-contracts.test.ts`, `packages/adapters/secrets/test/slot-credential-cipher.test.ts`, `packages/adapters/control-plane-store/test/slot-credential-key.test.ts`, and `packages/adapters/postgres/test/account-pool.integration.test.ts`, `resource-admission.integration.test.ts`, `migrations.integration.test.ts`, and `test-database.ts`), `npm run build` and `node --experimental-strip-types --test` of those files against `make services-up` gave tests 138, pass 95, fail 43. Every new test failed: the files `slot-selection.test.ts`, `slot-placement.test.ts`, `account-pool.test.ts`, `slot-credential-cipher.test.ts`, `slot-credential-key.test.ts`, and `account-pool.integration.test.ts` at import, because the base exports no `InMemoryAccountSlots`, `selectNewSessionSlot`, `AesGcmSlotCredentialCipher`, `openSlotCredentialKey`, or `PostgresSlotCredentials`; "a slot admits exactly its own concurrency limit, and each reservation records it" and "two placements racing for the last unit of a slot reserve it at most once"; "the account pool migration checks slot values and its down migration removes its tables" and "migrations apply once, record their checksums, and create the schema"; and the changed cases "each failed check gives its reason, the first in contract order", "the board's rejecting reasons equal Scheduling's" (passing on the base, failing once Scheduling's list grew), "PLACEMENT_REJECTING_REASONS holds the contract's values, frozen", and "the control-plane document is OpenAPI 3.1.0 at version 0.4.0 and every reference resolves". The other failures of that run were existing PostgreSQL tests, because the copied `test-database.ts` truncates tables the base lacks.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `a95a28e9`, tree `04bd8ba7` | Passed, profile full, stamp written: tests 3603, suites 46, pass 3594, fail 0, cancelled 0, skipped 9; all files 99.43 % lines, 92.72 % branches, 98.94 % functions. `make record` of this run is under "Generated checks"; `git fetch origin` before the run showed `origin/dev` at `62217e7a` (#409), which was not merged, since the brief asked only for `027a18fa` |
| `make findings ARGS="route --change implement-account-pool-slot-store"` | `6a8f0261` | "route: elevated (lines, files, security, contracts, size), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` agrees; recommendation only, committed unedited as `436f3ef2`. The brief names the reviewers at effort medium |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `04bd8ba7b28ce02e1bc679732a1acfd496165855`; tests 3603, pass 3594, fail 0, skipped 9; all files 99.43% lines, 92.72% branches, 98.94% functions.
- `npm run openspec -- validate implement-account-pool-slot-store --strict`: passed, `Change 'implement-account-pool-slot-store' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 85 file(s); every pass summary file is valid: 65 file(s); every route file is valid: 21 file(s).`.
- Spec diff against the merge base `027a18fa94df` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The control plane's placement service passes no slot request, because no harness is admitted before item 19 and a task's harness comes from item 11; so the placement service's wait, backoff, `waiting` record, and `rejected` record for a slot reason are covered by the reason classification and the placement transaction's outcomes, not by a run of the service.
- No admitted pair is registered, Claude Code's included (design, Q3); the slot limit is tested with an opaque harness and a limit of 1.
- `PostgresSlotCredentials` and the key file are not composed into the control plane; key rotation is not implemented.
- The `AccountSlots` conformance suite runs inside one PostgreSQL transaction, as the other capacity suites do; races between transactions are covered by the placement and add-slot tests.

## Remaining gates

- The coordinator's answers to the open questions Q1 to Q4 of the design.
- Review passes: pass 1 reviewer A Codex `gpt-6-astra` medium, pass 2 reviewer B Claude Code `claude-opus-5-5` medium, pass 3 reviewer A Codex `gpt-6.1-sol` medium, stopping at a Low-only pass.
- Archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
