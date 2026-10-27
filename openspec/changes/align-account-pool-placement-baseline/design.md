## Context

The account pool contract (`docs/contracts/account-pool.md`, G3 item 5) says that slot selection runs inside the reservation transaction, but not how it fits that transaction as G2 built it. Review pass 2 of item 5 in the G3 item 0 revalidation found three gaps, M3, L3, and L4 (`proposal.md`). This change fixes the contract text; G3 item 12 builds the selection.

All citations below are at base `b87abe75` (`origin/dev`, #365), which this branch does not change outside documentation.

## Goals / Non-Goals

Goals: state where selection runs in the placement transaction, the limit it checks, how its outcomes map onto waiting, rejection, backoff, and the placement outcome records of #360, the single slot write, and the serializable slot writers.

Non-goals: implementing selection or its tests (item 12); capacity reservation section 10 and the `capacity-reservation` specification, which the parallel change `align-account-pool-signals` edits; reopening the decisions of #364; the signals themselves (item 3).

## Decisions

### D1. Contract-only: slot selection is not implemented

Evidence that no selection exists in code:

- `packages/modules/scheduling/src/domain/slot-selection.ts:21-31` defines only the `SlotRequest` and `SlotSelection` types, and `:35-41` `parseSlotRequest`; no function selects a slot. `grep -rn -E 'selectSlot|function select' packages/modules/scheduling/src` finds nothing.
- `packages/modules/scheduling/src/ports/capacity-store.ts:14-26`: `CapacityTransaction` has no `AccountSlots`; the account pool contract section 6.1 says item 12 adds it. `packages/modules/scheduling/src/ports/account-pool.ts:9-18` declares the port, and no adapter outside its conformance suite and tests implements it (`git grep -n AccountSlots -- packages/adapters apps` finds nothing).
- `packages/modules/scheduling/src/application/capacity-operations.ts:49`: `PlacementRequest.providerCredentials` is supplied by the caller; `:191-193` checks each against `DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY`; `:220` records the caller's set in the reservation.
- `apps/control-plane/src/application/placement-service.ts:334` passes `providerCredentials: []`.

So this change specifies what item 12 must build, and no port's TypeScript contract changes: `AccountSlots`, `SlotCredentials`, `SlotRequest`, and `SlotSelection` stay as they are. The tests the finding asks for, a concurrency limit other than `4` and the check order, belong to item 12 and are added to the account pool contract's section 9 list of item 12 tests. Item 12 replaces `PlacementRequest.providerCredentials` with a slot request; that is a change of an application type, not of a port, made with its implementation.

### D2. Selection replaces the caller's set, at the credential step

`decidePlacement` checks installation, attempt, request, worker, quota, credential, then charge (`packages/modules/scheduling/src/domain/placement-decision.ts:62-67`, order on `:63-65`). Selection decides the existing credential step (`credentialReason`, `:103-105`). Alternatives:

- Before the worker and quota checks: a `reject` policy would end an attempt while its project quota is full or no worker has room, so a task that would wait for capacity is rejected instead. Rejected.
- After the charge check: a charge rejection would then hide a slot wait, and the credential step would no longer be the place where the credential budget is checked, unlike the capacity contract's order. Rejected.

At the credential step, the worker and quota reasons come first, so a `reject` policy rejects only an attempt that would otherwise fit. The selected slot is checked against its own `concurrencyLimit`; account pool section 3.2's eligibility already makes that check, so the credential step and eligibility agree, and `DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY` stays only the default of a new slot.

### D3. Outcome mapping

- `waiting` is `provider-concurrency-exhausted`, already a waiting reason (`packages/modules/scheduling/src/domain/capacity-reasons.ts:3-12`). It is not in `WORKER_REASONS` (`:26`), so `reserveOnCandidate` stops at it (`apps/control-plane/src/application/placement-service.ts:270`), which is right because the selection depends on no worker. It is not in `FLEET_REASONS` (`capacity-reasons.ts:33-35`), so the pass does not end (`placement-service.ts:110-114`, `:341-343`), the task backs off (`#settle`, `:140-143`), and `#recordWait` (`:132-136`) writes a `waiting` record through `recordWaiting` (`:300-309`). A slot wait is therefore a task's own decline (#344), not a fleet decline (#348): a full slot pool of one project must not stop other projects' placements.
- `rejected` is `no-eligible-slot` or `session-slot-withdrawn`. `placeTask` ends a rejected attempt and writes the `rejected` record (`placement-service.ts:234`, `:277-290`) only for a reason that `isRejectingReason` accepts, and `PlacementOutcomeRecord` types the rejected reason as `RejectingReason` (`packages/modules/scheduling/src/domain/placement-outcome-record.ts:22-25`). `REJECTING_REASONS` (`capacity-reasons.ts:16-23`) does not hold the slot reasons yet; account pool section 4.5 already requires item 12 to derive them from `SLOT_REJECTING_REASONS` (`slot-selection.ts:9`), and section 4.7 states why.

### D4. One slot write, with the insert (L3)

`reserveOnCandidate` tries every candidate in one transaction (`placement-service.ts:261-273`, call on `:267`). The finding offers two fixes: write the slot only with `insertPlacement`, or select once per task before the loop. The contract takes the first as the rule, because it holds whatever the loop does, and permits the second as an optimization: the selection only reads, the loop continues only for a reason about one worker, which comes before the credential step, and the transaction reads one clock (`SELECT now()`, the transaction's start, at `packages/adapters/postgres/src/capacity-repositories.ts:371`) and changes no slot before the insert (`capacity-operations.ts:206-236`), so every selection in it has the same result. Account pool sections 4.2 and 4.6 now say that the insert, not the selection, writes `lastReservedAt`.

### D5. Serializable slot writers (L4)

The writers come from the account pool contract: `add` (section 6.1), the signals (section 5), allowed projects and concurrency limit changes (section 2, rule 1), revoke, reinstate, and remove (section 8), and the rotation's switch and revision advance (section 8.1). They are listed in account pool section 2, rule 3, and the capacity reservation contract's section 4 list refers to it; section 13's per-table list gains one entry for the slot records, whose table item 12 names.

### D6. Spec delta in `account-pool-port` only

The meaning of "Deterministic least-loaded order" changes (the insert, not the selection, records the time), so it is MODIFIED with its current text otherwise unchanged. The other rules are new requirements of `account-pool-port`. The `capacity-reservation` specification's "Transactional reservation" already requires every writer of a value the transaction reads to run serializably, which covers slot changes, so it needs no delta, and its "Subscription account slot extension" is left to `align-account-pool-signals`.

## Risks / Trade-offs

- Item 12 may still choose where in `placeInTransaction` the slot reads happen; the contract fixes only the decision's position and the single write.
- A slot wait backs off; with every eligible slot busy, a freed slot reaches a waiting task only after its backoff, as for a quota wait.

## Review checklist

Output of `make findings ARGS="checklist --capability account-pool-port,capacity-reservation,harness-account-pools --files docs/contracts/account-pool.md,docs/contracts/capacity-reservation.md,apps/control-plane/**"` at base `b87abe75`:

```text
Review checklist (capabilities account-pool-port, capacity-reservation, harness-account-pools; files docs/contracts/account-pool.md, docs/contracts/capacity-reservation.md, apps/control-plane/**), most frequent finding categories first:
1. contract-drift (19): Code, a contract document, and its specification disagree. Example: "The usage window also governs the tie-breaker test of the pool contract and this spec, places that pass 1 M1 did not list"
2. docs (13): Documentation is missing, wrong, or out of date with the change. Example: "Two test comments say none for the rest, naming later fleet capacity declines that a pass no longer reaches"
3. missing-fail-before-test (12): A fix has no test that fails before it and passes after it. Example: "The unknown exit scenario had no observation-level integration test in the regular gate"
4. naming (11): A name hides intent or uses two terms for one concept. Example: "The FLEET_REASONS comment cites sections 5 and 13 without saying they are contract sections"
5. redaction (8): A secret or private value can leak into output, logs, or records. Example: "Credential delivery requires no confidential transport, while G2 runs plain HTTP and NATS"
6. concurrency-race (5): Concurrent operations can interleave into a wrong state or result. Example: "A slot write for a declined candidate can stay in the placement transaction that commits on the next candidate"
7. spec-wording (5): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The spec gives the credential port a reservation check that it cannot make outside the transaction"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (50): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (41): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (23): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (21): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (9): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (7): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```
