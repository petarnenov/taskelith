## Why

ADR 0008 decision 6 defines the board, inbox, intake, write-back, and auto-merge port contracts in G3. G3 items 15, 23, 24, and 25 implement them, and item 9 maps them onto the wire schemas, so they need a reviewed contract and port types first. On 2026-10-26 the owner started G3 for the wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2. This change is G3 work plan item 8.

## What Changes

- Add the product ports contract (`docs/contracts/product-ports.md`): the board read model over the lifecycle stages and the framework mapping, the task detail, session activity values, the "Needs you" inbox and its sources, standing approval rules, intake and write-back, the auto-merge setting, and the serial merge queue.
- Add port types and contract constants to the Execution module: `BoardReadModel`, `NeedsYouInbox`, `NeedsYouSource`, and `StandingApprovalRules`.
- Add the Integrations module (`@taskelith/integrations`), the "SCM / Tracker integrations" module of architecture section 6, with `IntakeSource`, `WriteBack`, `AutoMergeSettings`, and `MergeQueue`.
- Record the owner's 2026-10-26 G3 start decision in the G3 work plan.
- No adapter, no plugin, and no wire schema. No port is frozen in the plugin SDK.

## Capabilities

### New Capabilities

- `product-ports`: the module-owned ports and contract values behind the board, the task detail, the "Needs you" inbox, standing approval rules, intake, write-back, and auto-merge.

### Modified Capabilities

None.

## Impact

- New workspace package `packages/modules/integrations`, which changes `package-lock.json` and the dependency inventory.
- New exports from `@taskelith/execution`.
- `docs/g3-plan.md`: status and dependency order.
- No runtime behavior changes; the published `taskelith` package is unchanged.
