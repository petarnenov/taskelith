## Context

The G3 item 0 revalidation of item 8 (`revalidate-g3-foundations`) deferred review pass 1 H1, lowered to Medium by review pass 2 M1, to this change ([its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md), "Follow-up changes" and the item 8 resolution table). The finding: the product ports contract (`docs/contracts/product-ports.md`, at the base `9b0e6fd9` lines 132, 154, and 178) does not tie spec approval, the conflict flow with its return to Specify, and standing rule changes and uses to the launch invalidation protocol. Launch authorization section 5 (`docs/contracts/launch-authorization.md:63`) already binds every transaction that changes a compared value, and [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 (`docs/decisions/0015-g2-closure.md:112` and `:113`) defers the writers and re-admission to G3. What was missing is the binding reference, the waits, the transaction of a standing rule use, and race tests.

## Decisions

### D1 No G2 writer of the bound values exists, so no code changes

G2 invalidates launches only for worker revocation. `invalidateLaunches` (`packages/modules/scheduling/src/application/launch-invalidation.ts:32`) has no caller outside tests (`apps/control-plane/test/launch-authority.integration.test.ts:254`); `invalidateWorkerLaunches` (`:38`) is called only from `apps/control-plane/src/application/worker-revocation.ts:11`. Of the gate domain functions, `recordGateEvidence` (`packages/modules/sdlc/src/domain/gate.ts:84`) is called outside the SDLC domain and tests only by the repository conformance suites (`packages/modules/sdlc/src/ports/repository-conformance.ts:79`, `packages/modules/execution/src/ports/repository-conformance.ts:93`), and `reopenGate` (`:114`) and `markGateStale` (`:133`) have no caller outside the domain and its tests. No application changes a run's policy revision. The standing rule, inbox, and merge queue ports are types only (`packages/modules/execution/src/ports/standing-approval-rules.ts`, `packages/modules/integrations/src/ports/auto-merge.ts`), with no adapter. Launch authorization section 11 records the same (`docs/contracts/launch-authorization.md:173`). The change is therefore the contract, its spec, and the records.

### D2 Writers bound

Each writer is bound where the contract defines it, by reference to launch authorization section 5 rather than by restating the protocol:

- Spec gates (section 4.1): deciding a `spec-approval` item (item 22), making a passed spec gate stale (section 6.3), and reopening it. `GATE_TRANSITIONS` (`packages/modules/sdlc/src/domain/gate.ts:18` to `:24`) lets a passed gate move only to `stale`, and a stale gate only back to `pending`, so the transaction that makes the gate stale is the one that revokes. For a pending gate, and for reopening a stale or failed gate, the read is empty by construction, because an authorization that relies on a gate that is not passed is rejected; the read still orders the write against concurrent authorizations, as section 5 requires it unconditionally.
- Conflict flow and return to Specify (section 6.3, item 24): a new artifact revision, by the conflict flow or by the `return-to-specify` answer. A gate goes stale only through `markGateStale` with a revision that outdates it (`packages/modules/sdlc/src/domain/gate.ts:129` to `:146`), so the transaction that records the new revision also makes the outdated passed gates stale and revokes. It also updates the run's current revision, which the authority compares (`apps/control-plane/src/application/launch-authority.ts:103`); `CurrentRevisions` has only `seed`, which keeps a known artifact's revision, and `current` (`packages/modules/sdlc/src/ports/current-revisions.ts:7` to `:13`), so its first writer extends it, as ADR 0015 decision 5 (`docs/decisions/0015-g2-closure.md:112`) and launch authorization section 11 (`docs/contracts/launch-authorization.md:169`) require. A return to Specify without a new revision changes no compared value; it cancels the task's active attempt through the cancellation writer by assignment, which in G2 revokes the grants with `attempt-not-launchable` (`packages/modules/scheduling/src/application/capacity-operations.ts:78` and `:306`).
- Policy revision (section 5): a command that changes the run's policy revision is a writer by run. Recording, revoking, or using a standing rule and changing the auto-merge setting revoke no grant unless they change the run's policy revision, which is not decided here (D4); review pass 2 M1 of item 8 noted that, as written, they change no compared value. No G3 item yet changes a run's policy revision, whose binding is immutable in G2, so the item that adds such a command owns its race test (D5).

The helper is named as the G2 helper `invalidateLaunches` of Scheduling, which reads the predicate's live grants, revokes them, and writes one cancellation per attempt.

### D3 Waits after a revocation

The writer does not wait inside its transaction; the task waits after it ("After a revocation" in section 4.1, shared by section 6.3). The revoked attempt keeps its owner and ownership generation until it ends or reconciliation resolves it (launch authorization section 4, `docs/contracts/launch-authorization.md:50`, "Uncertainty keeps the ownership"; `packages/modules/execution/src/domain/task.ts:120` and `:121`). Re-admission belongs to the writer of admissions of G3 plan item 44; G2's `rebindAdmission` (`packages/modules/execution/src/domain/task.ts:116`) already refuses while an attempt is active (`:120` and `:121`). This change states the obligation and points to item 44; it implements no re-admission and adds no board value for the wait, which `align-product-ports-with-g2-lifecycle` owns with the card's terminal disposition (pass 2 M3).

### D4 Standing rule use transaction; policy revision semantics out of scope

A use reads and checks, in its one `SERIALIZABLE` transaction, the rule, the run's current policy revision, the attempt (not cancelled or terminal, which a launch revocation's cancellation makes it), the task's ownership generation and admission, and the request's attempt generation (section 4.2). The comparison of policy revisions (equality or order, project or run scope, the auto-merge rule's revision) is review pass 2 M5, owned by `align-product-ports-with-g2-lifecycle`; this change keeps the contract's wording "the run's current policy revision" and the existing sentence of the "Use" bullet unchanged. That change may refine the check without changing this transaction.

### D5 Race tests

Section 7 adds race tests for items 18, 22, 23, and 24, and, for the policy revision writer, for the item that adds a command that changes the run's policy revision, through the deterministic test harness, mirroring launch authorization section 10: one per bound writer against a launch authorization (a passed gate made stale, a new artifact revision, and a policy revision change with several attempts), with either transaction as the serialization victim, an empty read, and a retry with the same command identity; a separate approval race, whose launch may be granted and is not revoked; a separate running attempt test, a start under an expired grant included; and a standing rule use race stated in serialization order, not commit order. Item 44's own re-admission tests are not defined here; section 7 requires only that the product side does not dispatch a task while its revoked attempt is active.

### D6 No back-reference in launch authorization

Launch authorization section 5 binds every writer already, and section 11 says each later writer must call the helper. The product contract now points to it, so no edit of the launch authorization contract is needed.

### D7 Edits confined to the writer sections

The contract edits add paragraphs or bullets in sections 4.1, 5, 6.3, and 7 and change no existing line, so that the parallel `align-product-ports-with-g2-lifecycle` merges with small conflicts.

## Review checklist

Verbatim from the coordinator's brief:

```
Review checklist (capabilities product-ports, launch-authorization, launch-authority, launch-reconciliation; files docs/contracts/product-ports.md, docs/contracts/launch-authorization.md, packages/modules/scheduling/**), most frequent finding categories first:
1. contract-drift (12): Code, a contract document, and its specification disagree. Example: "Merge readiness counts passed gates, which holds vacuously for a stage without gates, unlike the G2 stage rule"
2. naming (8): A name hides intent or uses two terms for one concept. Example: "The FLEET_REASONS comment cites sections 5 and 13 without saying they are contract sections"
3. docs (4): Documentation is missing, wrong, or out of date with the change. Example: "The fleet reasons comment cited only contract section 5 although the cursor stop is section 13"
4. spec-wording (2): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Withdrawn requests map to not ready even when every gate passed, and auto merge on before a request has no value"
5. missing-fail-before-test (1): A fix has no test that fails before it and passes after it. Example: "The PostgreSQL launch authority test reported only a one-entry list of sealed executions"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (48): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (41): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (23): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (21): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (9): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (7): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```

Guarded categories:

- contract-drift: every obligation the spec delta states is in the contract section it names, and the contract's existing sentence on rule use is unchanged in the spec's modified requirement.
- evidence-mismatch and stale-citation: every `file:line` in these records was re-read on the base `9b0e6fd9` before recording; the contract lines of the finding (132, 154, 178) are the base's lines, which the change shifts.
- scope: no code, no policy revision semantics (D4), no re-admission (D3).
