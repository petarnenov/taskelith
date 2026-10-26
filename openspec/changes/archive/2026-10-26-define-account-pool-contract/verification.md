# Verification: define-account-pool-contract

## Scope and source

- G3 work plan item 5 (`docs/g3-plan.md`), assigned by the coordinator on 2026-10-26, under the owner's decision of 2026-10-26 that starts the G3 wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2.
- Sources: ADR 0005 with its 2026-10-25 amendments to decisions 4 and 5; the capacity reservation contract sections 2, 4, 6, 10, and 11; the `harness-account-pools` specification; the archived changes `record-session-harness-pinning` and `record-limit-handoff-rule`; the trust model section 3; the operational targets; the product ports contract for naming and port style.
- Delivered: `docs/contracts/account-pool.md`; the `account-pool-port` spec delta; Scheduling domain types and constants (`AccountSlot` with `parseAccountSlot`, `HarnessPluginId`, `SubscriptionMechanismId`, `SlotRequest` with `parseSlotRequest`, `SlotSelection`, `SlotSecret`); the `AccountSlots` and `SlotCredentials` ports with conformance suites run against an in-memory test double; two new reasons in capacity reservation contract section 11 and a pointer in its section 10; the default slot cooldown row in the operational targets.
- Not delivered, by scope: selection, cooldown, and delivery code; adapters; the encryption algorithm and key management; wire schemas; UI; changes to `CapacityTransaction`.

## Environment

- macOS 26.6 (Darwin 25.6.0), arm64; Node.js v24.22.1 from `.nvmrc` through `nvm use`.
- Worktree `../taskelith-worktrees/define-account-pool-contract`, branch `define-account-pool-contract`, created from `origin/dev` at `cd2805e`. `origin/dev` has since moved; the branch was not merged with it, which the coordinator does at integration.

## Subagent execution

The coordinator's addendum of 2026-10-26 (owner rule "Subagent execution", change `require-subagent-task-execution`) arrived during review pass 3. Everything before it, the contract, the code, the tests, the OpenSpec artifacts, and the fixes after passes 1 and 2, was done in the worker session itself. The unreviewed Low fixes after pass 3 were done by an implementation subagent briefed with the task, scope, and rules; the worker checked its diff, reran the module tests and the comment check, and kept the review and these records in its own session.

## Author self-check before review

- No type, value, schema, or test of the pool names a harness or vendor; the harness and mechanism are opaque identifiers.
- Every element of the plan row is covered: slots per harness with allowed projects (3.1), eligibility (3.2), least-loaded selection inside the reservation transaction (4.1, 4.2), cooldown (5), session affinity (4.3), a different harness after a limit or a wait for that slot's cooldown (4.4), encrypted slot credentials (6.2), injection only into the reserving run (7), and revocation and removal (8).
- The load, limit, and reset signals are referred to as the agent harness port's signals (item 3), not defined.
- Evidence check: every document that the contract cites was read at the base revision, and each relative link in `docs/contracts/account-pool.md` resolves to an existing file.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| `6d766e7` | `make verify`; `npm run openspec -- validate define-account-pool-contract --strict` | Passed: 1441 tests, 0 failed; coverage over all files 99.25% lines, 91.50% branches, 98.73% functions; OpenSpec items valid; archive dry run and package verification passed; change valid |
| `af7c69f` (fixes after pass 1) | `make verify` | Passed: 1449 tests, 0 failed; coverage 99.25% lines, 91.48% branches, 98.73% functions |
| `3871628` (fixes after pass 2) | `make verify` | Passed before pass 3: 1449 tests, 0 failed; coverage 99.25% lines, 91.48% branches, 98.73% functions |
| Final commit, the head handed off (unreviewed Low fixes after pass 3) | `make verify`; `npm run openspec -- validate define-account-pool-contract --strict` | Passed: 1455 tests, 0 failed; coverage 99.26% lines, 91.45% branches, 98.73% functions; 64 OpenSpec items valid; comment check, archive dry run, and package verification passed; change valid. The `pre-push` hook runs `make verify` again on push |

## Independent review

Reviewer for all passes: Claude Code, assigned by the coordinator. Invocation from the worktree: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with prompt and output files kept outside the worktree. Each prompt named `AGENTS.md`, ADR 0004, the governance review process, ADR 0005, the capacity reservation contract, the `harness-account-pools` specification, the two archived amendments, and the product ports contract.

### Pass 1

- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID `d1e5cabb-3afb-49a4-af47-a4b8cd94fbc1`.
- Reviewed revision: `6d766e7` against `origin/dev`.
- Snapshot before and after: `fa8a701f06a05eb883527107cdeb4513391a007acb071b13b01c87494c1cb2bb`, unchanged.
- Findings: 0 Critical, 0 High, 6 Medium, 10 Low.
  - M1 `Result` promised for every operation while `pool` returns a value: rule 4 now states that reads without a domain failure return values and an unreachable store rejects the promise.
  - M2 record invariants without a parser: added `parseAccountSlot` with tests and a spec requirement.
  - M3 resumed session on a slot that no longer allows the project: rejected with `session-slot-withdrawn`.
  - M4 who rejects an undeclared mechanism: the add-slot command, through the agent harness port; `add` treats it as opaque.
  - M5 normative rules missing from the spec delta: added requirements for the tie order, cooldown bounds, and revocation, reinstatement, and removal; proposal corrected.
  - M6 duplicate default concurrency constant: removed; `DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY` is used.
  - L1 revision skip reported as `conflict`: now `invalid`, with a suite case. L2 tie-break wording clarified. L3 rejection of a revoked slot explained in design decision 3. L4 limited harness among the alternatives is `invalid`. L5 inspection form added to the suite. L6 cooldown default added to the operational targets. L7 item 4 dependency stated as a requirement. L8 comment on the inspection symbol. L9 new reasons added to capacity section 11. L10 plugin identifier duplication recorded as a risk.
- Resolution commit: `af7c69f`.

### Pass 2

- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID `d048d848-5c94-4075-bb8e-428208cd1ff8`.
- Reviewed revision: `af7c69f`. The prompt named pass 1's session and findings; the reviewer confirmed all 16 resolved.
- Snapshot before and after: `eebbb2f2edea8ccab67035bbd75ff900755106efed2ff4cd840948b177f48796`, unchanged.
- Findings: 0 Critical, 0 High, 2 Medium, 12 Low.
  - M-A identifier order undefined: code point order fixed in rule 2 and the spec; a fixture whose locale and code point orders differ; the test double compares with `<`.
  - M-B no required delivery test: added to section 9, with a spec scenario.
  - L-A and L-B spec clauses and scenarios for invalid alternatives and the delivery checks. L-C `replace` check order fixed and tested. L-D capacity section 10 affinity sentence synchronized. L-E waiting reason checked with `satisfies WaitingReason`; item 12 derives the rejecting reasons. L-F `resumed-session` field renamed to `pinned`. L-G inspection check decoupled from the secret text. L-H every reserved outcome sets `lastReservedAt`. L-I `SlotCredentials` stated as outside `CapacityTransaction`. L-J `store` and `destroy` return `Promise<void>`. L-K broken-double tests assert the exact failing cases. L-L shared slots shown without other projects' names.
- Resolution commit: `3871628`.

### Pass 3

- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID `08dc62f1-f7d2-484f-9feb-3be6d88ad2a5`.
- Reviewed revision: `3871628`. The prompt named pass 2's session and findings; the reviewer confirmed all 14 resolved.
- Snapshot before and after: `0bfa1aa0d4223a73c70c5f9447bbd7307965d1904155f050e53ca2f6a464ad45`, unchanged.
- Findings: 0 Critical, 0 High, 0 Medium, 8 Low. Under the review process these were fixed without another review.

### Unreviewed fixes after pass 3 (Low only)

1. The lenient test double now overwrites without any check, so the suite is shown to fail an adapter without compare-and-set.
2. The suite also checks a removed slot becoming revoked and a harness change at a stale revision (`invalid` before `conflict`).
3. Added `parseSlotRequest` for the `after-limit` alternatives; a pinned or limited harness that differs from the stored slot is `invalid`, checked by item 12 against the store.
4. Section 4.4: an `after-limit` wait with a withdrawn limited slot and no other eligible harness is ended by policy or an operator.
5. Section 5: a signal that loses its compare-and-set rereads the slot and applies again.
6. Sections 7 and 8: the window between the delivery commit and a revoke is acknowledged and covered by draining in-flight attempts.
7. Identifier fields renamed to the module's style: `harnessId` and `mechanismId`.
8. `parseAccountSlot` also freezes `cooldown` and `usage`.

## Limitations

- The ports are types and suites only; no PostgreSQL adapter ran the suites. Item 12 runs them against its adapter and adds the selection, cooldown, concurrency, delivery, secrecy, and neutrality tests of contract section 9.
- The harness port (item 3) is developed in parallel; its signal names and harness plugin identifier may need a follow-up alignment (design "Risks").
- The default cooldown of 60 minutes is provisional.

## Remaining gates

- Coordinator integration: merge `origin/dev` into the branch, pull request into `dev`, and archive.
- No deployment validation; none applies to a contract-only change.
