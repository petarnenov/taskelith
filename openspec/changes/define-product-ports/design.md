## Context

ADR 0008 decision 6 places the board, inbox, intake, write-back, and auto-merge port contracts in G3. The product UI and auto-merge authority specifications state the behavior. ADR 0013 and ADR 0014 add forward-compatibility obligations: approvals go through a decision body, the merge target is a field, and the board and inbox are aggregated views over stable identities. The module dependencies run sdlc ← execution ← scheduling and fleet, and no module holds board, inbox, intake, or merge code yet.

## Goals / Non-Goals

**Goals:**

- One reviewed contract that fixes the values, records, ports, and invariants that items 15, 23, 24, and 25 implement.
- Port types and frozen contract constants, with no source, SCM, harness, or framework named.

**Non-Goals:**

- Adapters, plugins, wire schemas (item 9), SCM operations (item 7), the harness port and native request classification (item 3), and the worker admission port (G2 or item 27).
- Freezing `IntakeSource` and `WriteBack` in the plugin SDK, which item 25 does with the first plugin.

## Decisions

1. **Module placement (coordinator decision of 2026-10-26).** The board read model, the task detail, the inbox and its sources, and the standing approval rules go to Execution, which owns tasks, sessions, and approvals. Intake, write-back, and auto-merge go to a new Integrations module, the "SCM / Tracker integrations" module that architecture section 6 already names. Integrations imports only the kernel, SDLC, and Execution. The coordinator rejected a separate product module, which would change the architecture, and a contract-only change, which would leave the items without port types. G3 item 7 adds the SCM port to the same module; whichever change merges second resolves the package skeleton conflict.
2. **Board columns derived from the frozen port.** The column of a stage follows from its obligations and its place in the stage graph, so no new framework operation is needed. A review stage before any implementation stage belongs to Specify, matching the framework mapping note of 2026-10-25. The Close stage keeps the card in Review with its merge gate state until integration.
3. **The board's own merge gate values.** Execution cannot import Integrations, so the view defines its merge gate values and the contract maps the merge request states onto them, the usual boundary translation from a domain state to a view state.
4. **`NeedsYou` names.** Execution already exports `Inbox` for consumer message deduplication. The new ports are `NeedsYouInbox` and `NeedsYouSource`, not `InboxSource`, to keep the two apart.
5. **Task defaults in Execution.** The work types and spec approvers are attributes of a task, which items 22 and 30 need too, so they live in Execution's domain and Integrations imports them; no module imports Integrations.
6. **Plain data for plugin-facing ports.** `IntakeSource` and `WriteBack` use string fields that the module parses, as the frozen SDLC framework port does. The internal ports use branded identifiers.
7. **Opaque placeholders and own revisions.** Integrations versions its records with its own `Revision`, not SDLC's `Generation`. `NativeRequestId`, `CodeHead`, and `BranchName` are opaque identifiers here. Items 3, 4, and 6 define their structure, and may replace these types with their own in a follow-up change.

## Risks / Trade-offs

- **Contracts before the G2 closure.** If the G2 closure defers something these ports rely on, follow-up changes correct them, as the owner decided on 2026-10-26.
- **Parallel skeleton.** Items 7 and 8 both add `@taskelith/integrations`. The skeleton follows the other modules exactly, so the conflict is mechanical.
- **Types without behavior.** Only the contract tests pin the constants, and the behavior tests come with the implementing items, which the contract's "Required tests" lists.
