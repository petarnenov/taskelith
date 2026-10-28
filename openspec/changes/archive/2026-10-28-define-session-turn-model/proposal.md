## Why

[Architecture section 7](/docs/architecture.md#durable-chat-turns-and-provider-approvals) makes the Execution module own a durable ordered session timeline: turns with a client idempotency key and an immutable identity, serialized mutable turns, native permission and input requests persisted before they are shown, a response consumed once, no automatic approval or replay after a restart, and bounded stream retention with cursor recovery. R29 ([architecture section 14](/docs/architecture.md#14-acceptance-requirements-and-scenarios)) verifies it. The [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 10 counts attempts as ADR 0005's active sessions only if a session has at most one active attempt, and assigns that invariant to this item, because G2 item 7 (`define-execution-domain-model`) established it per task only. ADR 0005 decision 4 as amended, the [account pool contract](/docs/contracts/account-pool.md) section 4.4, and the [agent harness port contract](/docs/contracts/agent-harness-port.md) section 4.1 require a session whose slot reports a limit to write a handoff that the next session of the task reads.

This change is G3 item 4 ([G3 work plan](/docs/g3-plan.md), row 4). Item 3 (`define-agent-harness-port`) defines the harness side; items 9 (wire), 13 (session timeline service and persistence), and 18 (harness host) build on this model.

Status: phase 2. Phase 1 wrote this record, the design with six open questions, the task list, and a draft spec delta. The away delegate decided the open questions on 2026-10-28 for the coordinator ([design](design.md) decisions 20 to 25): a session spans one task's successive stage admissions within one run, and a delegated child task gets its own session; a submission during a running turn is queued; a delivered turn without an outcome at its generation's end becomes `outcome-unknown`; an unresolved request closes its inbox item, and only a `delivery-uncertain` response opens an acknowledgement item; the handoff is a host-written record; and the output retention bound is `10 MiB` of UTF-8 text per session. Phase 2 writes the contract, the fail-before tests, and the domain module.

## What Changes

- A domain contract, `docs/contracts/session-timeline.md`, in the form of the sibling G3 contracts (items 3 and 5): one task's sessions and their attempts, generations, queued turns, native requests and responses, restart reconciliation, the output stream and its cursor, and the limit handoff.
- A pure domain in the Execution module (`@taskelith/execution`) that implements the contract, reusing the agent harness port's identifiers and types and adding only the identifiers the port does not define.
- Unit tests written first and shown failing before the domain exists.
- A new capability spec, `session-turn-model`.

Excluded: persistence adapters and the application service (item 13), wire schemas and AsyncAPI messages (item 9), the UI event stream (item 14), the harness host (item 18), the account pool's selection after a limit (items 5 and 12), and delegation admission (item 38), and the inbox items derived from the timeline (the inbox source of item 13).

## Capabilities

### New Capabilities

- `session-turn-model`: the pure domain of the session timeline: one task's sessions with at most one active attempt, ordered turns with immutable identity and a client idempotency key, queued and serialized delivery, native requests recorded before display with a single consumed response, generation-keyed request identity, restart reconciliation without replay, bounded output retention with cursor recovery, and the limit handoff.

### Modified Capabilities

None.

## Impact

- New exports from `@taskelith/execution`, a private workspace package; no new dependency.
- The [operational targets](/docs/operational-targets.md) row of the live session stream buffer links the contract.
- No runtime behavior changes; the published `taskelith` package is unchanged.
