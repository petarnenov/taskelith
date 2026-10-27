## Context

D1 (`fix-launch-recovery-reauthorization`, archived) added an optional `reportsNotStartedFor { executionId, operationId }` that the authority applies before the ownership rule, in the deciding transaction, with these rules: a self-reference conflicts, an unknown execution is a no-op, one already `not-started` is idempotent, an `authorized` one of the request's attempt and worker moves to `not-started`, the `operationId` is advisory (only an operation that granted another execution conflicts), and anything else is `execution-conflict`. The worker reported only the intent's last sealed execution (`lastSealedExecution`). D1's design "Risks" recorded why that is too narrow; the coordinator asked for a report of every unconfirmed sealed execution, in a single list field, capped at 8, with the per-item rules unchanged.

## Goals / Non-Goals

**Goals:** a launch is granted after any sequence of runtime seals and crashes in which the authority's owner is a sealed execution of the worker; one list, applied in order, in one transaction; the worker derives the list from the journal alone.

**Non-Goals:** a new journal record or format; ordering the outbox before a relaunch; a late request of a sealed execution that reaches the authority after a later grant (unchanged from D1).

## Decisions

### D1. The existing field becomes the list

`reportsNotStartedFor` is now an array of `SealedExecution`, `minItems` 1 and `maxItems` 8, instead of a second field beside the object.

- The object form is in `dev` only (`execution.openapi.json` 0.3.1); `main` and every published release have neither form, so no deployed worker or control plane sends or accepts it.
- `make contract-compatibility` compares against the `origin/dev` merge base and reports three breaking changes for it (`request-property-type-changed`, `request-property-min-items-set`, `request-property-max-items-set`) when the version stays 0.3.1. It accepts a breaking change that `info.version` declares (ADR 0004 principle 6, minor bump while 0.x), as 0.2.1 to 0.3.0 did. The document is therefore 0.4.0, and the check passes.
- A second field would leave two ways to report a seal and a rule for when both are present; the coordinator asked to avoid that unless forced, and it is not.
- `minItems` 1 keeps one way to report nothing: omit the field.

### D2. Order and atomicity in the authority

`recordReportedSeals` folds the entries in list order over the request's attempt. Each entry is looked up first in the attempt as the earlier entries left it, then in the task, and decided by D1's `recordReportedSeal` and `sealConflict` unchanged. The first conflict returns `execution-conflict`; since the domain returns no task on a rejection, no entry is recorded, and the deciding transaction stores nothing. A repeated entry is idempotent, because the first one left the execution `not-started`. The ownership rule then decides the requested execution on the attempt the whole list left. The transport retry and the replay are unchanged: the report is not an expected value (contract section 6).

### D3. The cap of 8 is a wire rule

The limit is `REPORTED_SEALS_LIMIT` in the execution module. The schema bounds the list, and `launch-wire.ts` refuses an empty list or one over the limit with 400 `invalid`, so the authority never decides such a request. `invalid` is a request failure, not a launch rejection reason, so the domain does not check it again. The worker never sends more than the limit (D5).

### D4. "Confirmed" is read from the journal's own order

The journal reads executions back in `rowid` order, the order of their first W2, and never deletes one. The authority grants an execution only while no other execution owns the attempt (section 4), so a journaled grant (W3) of an execution proves that every execution journaled before it was terminal, or unknown, at the authority at that time. A sealed execution is therefore **confirmed** once a later execution of the intent has a journaled grant, and **unconfirmed** otherwise. `unconfirmedSealedExecutions` takes the intent's executions from the last one with a grant on (all of them when none has one) and keeps the `not-started` ones, each with its last granted operation, else its last one, as D1 did.

Alternatives not taken:

- An acknowledgement record for a report: the grant answer is already that acknowledgement and is already journaled by W3, so a new record or journal format would add nothing.
- Outbox confirmation of the `not-started` observation: it proves delivery to the broker, not that the authority recorded it, which is exactly D1's race.

A resumed execution is never `not-started`, so it never reports itself; the definition is the same for continue-launch, retry-authorization, and the runtime relaunch.

### D5. Over the cap, the oldest 8

More than 8 unconfirmed sealed executions means at least 8 executions in a row without a journaled grant after the last one with a grant, each ended by a crash or an expired operation. Of the unconfirmed ones, only the oldest can carry a journaled grant, and a grant is the surest sign that the authority holds it as the owner, so the worker sends the oldest 8. If the owner is among the newer ones, the launch ends with `execution-conflict` as before this change.

## Risks / Trade-offs

- The worker trusts `rowid` order. The journal adapter inserts an execution row at its first W2 and has no delete for executions; worker journal section 5 now states this order as a contract.
- A request lists up to 8 entries, each looked up in the task; the cost is bounded and within the deciding transaction.
- Beyond 8 unconfirmed executions the launch can still end (D5); this needs 8 or more crashes or expiries in a row without a grant.
- The breaking OpenAPI change requires a worker and control plane built from the same `dev` revision; both are unreleased, and the upgrade order of D1 (control plane first) still holds.
