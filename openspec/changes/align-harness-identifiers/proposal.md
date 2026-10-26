## Why

The account pool contract (`define-account-pool-contract`) and the agent harness port contract (`define-agent-harness-port`) merged on 2026-10-26 and name the same concepts differently. The pool declares its own opaque `HarnessPluginId` and `SubscriptionMechanismId` in the Scheduling module and says the plugin's manifest declares the mechanisms; the harness port declares the mechanisms in the plugin's `capabilities` (`subscriptionMechanisms`) and has no harness plugin identifier type. The pool design anticipated this follow-up (archived `define-account-pool-contract` design, risk "Two plugin identifiers"), so that one type names a harness plugin.

## What Changes

- Add `HarnessPluginId` to the Execution module's identifiers and export it from `@taskelith/execution`; its value is the harness plugin's manifest `id`.
- Scheduling drops its local `HarnessPluginId` and imports Execution's, as it does for `WorkerId`; `@taskelith/scheduling` no longer re-exports the name. `SubscriptionMechanismId` stays Scheduling's own opaque type.
- Account pool contract sections 1, 2, and 3.1: `HarnessPluginId` is Execution's type; `mechanismId` values come from the mechanisms the plugin declares in its agent harness port `capabilities` and are validated outside the pool.
- Agent harness port contract sections 3 and 4.1: the `capabilities` are the declaration ADR 0005 decision 2 calls the manifest, and a harness plugin is identified by `HarnessPluginId`, the type the pool uses.
- An `account-pool-port` spec delta that adds the requirement "Shared harness plugin identifier"; the requirement "Harness-neutral slot records" is unchanged.
- No new behavior, adapter, validation, selection, or scheduler code; ADR 0005 is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-pool-port`: a new requirement, "Shared harness plugin identifier", names a slot's harness with Execution's `HarnessPluginId` and keeps the mechanism Scheduling's own opaque `SubscriptionMechanismId`.

## Impact

- `@taskelith/execution` exports `HarnessPluginId`; `@taskelith/scheduling` stops exporting it. Both are private workspace packages.
- No runtime behavior changes; the published `taskelith` package is unchanged.
