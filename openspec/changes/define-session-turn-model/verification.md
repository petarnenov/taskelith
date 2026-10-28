# Verification: define-session-turn-model

Status: phase 2 in progress. Sections marked pending are filled when the contract, the domain, and the review are done.

## Scope and source

- G3 item 4 ([G3 work plan](/docs/g3-plan.md), row 4), size M-L, assigned by the coordinator on 2026-10-28. The brief's scope is the plan row: the pure domain of the session timeline, with ordered turns with immutable identity and a client idempotency key, serialized mutable turns, permission and input requests persisted before display, single consumption of a response, a duplicate response or a reused native request ID under another provider generation rejected, unresolved requests after a restart reconciled and never replayed, stream retention with cursor recovery, at most one active attempt per session as the [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 10 requires, and the handoff a session writes when its slot reports a limit, kept for the next session of the task.
- Sources named by the brief: [architecture section 7](/docs/architecture.md#7-plugins-and-execution-isolation), R29, the capacity reservation contract section 10, G2 item 7 (archived `define-execution-domain-model`), and item 3 (archived `define-agent-harness-port` and `align-harness-identifiers`).
- Excluded by the brief: persistence adapters, wire schemas and AsyncAPI (item 9), the session timeline implementation (item 13), the UI event stream (item 14), and the harness host (item 18).
- Phase 1 (`a6acbc51`): design only. `proposal.md`, `design.md` with six open questions, `tasks.md`, and a draft spec delta; no contract and no code.
- Phase 2: the away delegate's decisions on the open questions, relayed by the coordinator on 2026-10-28 ([design](design.md) decisions 20 to 25), the contract, the fail-before tests, and the domain module.

## Revision

- Base: `dev` `1c73e1a7`.
- Phase 1 commit: `a6acbc51` `docs: design the session turn model`.

## Way of working

- Developed by a subagent that the session briefed under the [subagent execution](/docs/agent-task-protocol.md#subagent-execution) rule; the session checks the result, runs the review, and hands off.

## Environment

Native Ubuntu Linux x86_64 host; Node.js v24.22.0. `make verify` has not run in phase 1.

## Author self-check before review

Pending.

## Fail-before

Pending (task 3.2).

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| Phase 1 working tree on `1c73e1a7` | `npm run openspec -- validate define-session-turn-model --strict` | Change 'define-session-turn-model' is valid |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:comments` | Every comment is within the comment length rule |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:links` | Every checked link conforms |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:findings` | Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s) |

## Independent review

Pending. `passes.jsonl` and `findings.jsonl` are empty: no pass has run.

## Limitations

Pending.

## Remaining gates

- The contract, the domain module, its fail-before tests, `make verify`, and the independent review.
- Follow-up for the coordinator, outside this change: add item 4 to the handoff owners of the [agent harness port contract](/docs/contracts/agent-harness-port.md) section 4.1 ([design](design.md) source note 2).
- Integration into dev by the coordinator (single pull request).
