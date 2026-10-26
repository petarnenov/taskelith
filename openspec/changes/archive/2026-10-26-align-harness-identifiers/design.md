## Context

Two contracts merged on 2026-10-26 name the same concepts differently. The account pool contract section 2 and `packages/modules/scheduling/src/domain/account-slot.ts` declare the opaque brands `HarnessPluginId` and `SubscriptionMechanismId`, and section 1 and 3.1 say that the plugin's manifest declares the mechanisms. The agent harness port contract sections 3 and 4.1 and `packages/modules/execution/src/ports/agent-harness.ts` declare the mechanisms in the plugin's `capabilities` as `subscriptionMechanisms`, a closed set `SUBSCRIPTION_MECHANISMS` (`subscription-token`, `device-login`), and define no harness plugin identifier type. The pool design recorded this as the risk "Two plugin identifiers" and promised a follow-up change so that one type names a harness plugin (archived `define-account-pool-contract` design).

The plugin SDK's `PluginManifest` has an `id` field, which identifies an installed plugin. ADR 0005 decision 2 says that each harness plugin declares its subscription mechanisms in its manifest; the harness port carries that declaration as its `capabilities`.

## Goals / Non-Goals

**Goals:**

- One type, owned by Execution, names a harness plugin in both contracts and in the code.
- Both contracts describe the mechanism declaration the same way, as the harness port's `capabilities`.

**Non-Goals:**

- New validation, behavior, adapters, selection, or scheduler code.
- Any change to ADR 0005; its "manifest" wording stays, and the harness port contract says that its `capabilities` are that declaration.
- Typing a slot's mechanism with Execution's `SubscriptionMechanism`.

## Decisions

The choice of A1 and B1 below was made by an OpenCode delegate (`kimi-k2.7-code`) on the owner's delegation while the owner was away, run `/Users/petarnenov/.config/away/runs/20261026T095621Z-opencode-45167`, and relayed to the worker by coordinator Niki. The worker implemented it and did not reopen it.

1. **A1: Execution owns `HarnessPluginId`.** `HarnessPluginId = Identifier<'HarnessPluginId'>` joins Execution's identifier brands in `domain/identifiers.ts`, beside `WorkerId` and `AttemptId`, and `@taskelith/execution` exports it. Its value is the harness plugin's manifest `id`. Execution owns the `AgentHarness` port (architecture section 6), so the identity of a harness plugin belongs with it. Scheduling already depends on Execution and imports its identifiers (`WorkerId` in `domain/reachability.ts`), so the dependency direction is unchanged and `npm run check:boundaries` passes.
2. **Scheduling does not re-export it.** `@taskelith/scheduling` re-exports none of Execution's identifiers, so it stops exporting `HarnessPluginId` rather than offering the same name from two packages. Its only consumer, the Scheduling test, imports it from `@taskelith/execution`. Both packages are private workspace packages.
3. **B1: the mechanism stays opaque to the pool.** `SubscriptionMechanismId` remains Scheduling's own opaque brand, and Scheduling does not import Execution's `SubscriptionMechanism`. A slot's `mechanismId` value is drawn from the mechanisms the plugin declares in its harness port `capabilities`, and it is validated outside the pool, so the pool's "opaque identifiers" requirement stays true and a new harness port mechanism needs no pool change.
4. **The only stated validation is the port's.** The harness port contract states the check it already makes: a start or resume request whose credential names an undeclared mechanism fails with `invalid`. This change adds no new check to either contract.
5. **One added requirement, no modified one.** No existing requirement is inconsistent with A1 and B1: "Harness-neutral slot records" makes the harness and mechanism opaque to the pool, which stays true. The shared type is a new rule, so the delta adds the `account-pool-port` requirement "Shared harness plugin identifier": the pool names a slot's harness with Execution's `HarnessPluginId`, whose value is the manifest `id`, defines no harness plugin identifier type of its own, and keeps the mechanism its own opaque `SubscriptionMechanismId`, validated outside the pool. A first draft modified "Harness-neutral slot records" instead, but the merged text exceeded the 500-character requirement limit that the archive dry run of `make verify` enforces, and the rule reads better on its own. No `agent-harness-port` requirement changes: no port operation takes a harness plugin identifier, and the requirement "Declared capabilities" already says the plugin declares its subscription mechanisms. The `harness-account-pools` requirements already speak of the mechanisms "that plugin declares" and are consistent as they are.

## Search for a slot-add check

The brief asked whether an existing spec or contract requires a mechanism check when a slot is added. Two do:

- The `harness-account-pools` requirement "Subscription account slots", scenario "Non-subscription credential": a slot configured with a credential the plugin does not declare as a subscription mechanism is rejected.
- The account pool contract section 3.1, row `mechanismId`, added in that change's review pass 1 (finding M4): the control plane's add-slot command checks the mechanism before `add` and rejects an undeclared one with `invalid`.

This change keeps that existing statement and only replaces its "manifest" wording with the harness port's `capabilities`. It adds no new check and states none in the harness port contract.

## Open questions for the coordinator

1. **How does the add-slot command read the declaration?** The account pool contract section 3.1 has the control plane's add-slot command check `mechanismId` against the plugin's declared mechanisms, but the harness port contract section 1 says the port is called inside the execution, and no contract says how the control plane obtains a harness plugin's `capabilities` when no session runs. Whether that check needs a control-plane read of the declaration (for example, from the installed plugin) and which item owns it (9, 12, or 18) is undecided. The worker recommends assigning it to item 12 with the add-slot command, and leaves the existing sentence unchanged until then.

## Risks / Trade-offs

- **Removed scheduling export.** A caller that imported `HarnessPluginId` from `@taskelith/scheduling` must import it from `@taskelith/execution`. No caller outside Scheduling's own test did.
- **Two declarations named "capabilities".** The plugin SDK manifest also has a `capabilities` list of strings; the contracts say "agent harness port `capabilities`" where the difference matters.
