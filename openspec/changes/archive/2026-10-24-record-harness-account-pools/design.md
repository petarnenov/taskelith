## Context

In the tested arrangement, device authentication binds a subscription login to a configuration directory on one worker host; broader limits were not tested. The owner wants many subscriptions per harness, shared by explicitly allowed projects, chosen by load, and always subscription-based. The first-class principles (ADR 0004) require a hexagonal, microkernel design.

## Goals / Non-Goals

Record the decision as checkable rules and align the dependent documents. Do not design storage schemas, select a secret store, implement selection, or verify provider terms.

## Decisions

- Model a slot as one subscription bound to one harness plugin with an allowed-project list, so a project's pool is derived, not stored separately.
- Order selection by active sessions, then reported usage as a normalized fraction of the current window's limit (only when every tied slot reports it), then least recent use; reserve the slot in the same transaction as other run resources. The author proposed the selection order, cooldown, affinity, and credential storage; the owner approved them on 2026-10-24.
- Keep session affinity and never rebind silently, matching the reconciliation rules for approvals and removed plugins.
- Keep the pool in the kernel behind a port; plugins only inject credentials and report load, limits, and resets as declared capabilities.
- Narrow the trust-model change to harness provider credentials; Git and SCM credentials stay per workspace.

## Risks / Trade-offs

Pooled personal subscriptions may conflict with provider terms; this is recorded as an owner risk, not resolved. Harnesses may not report usage or resets, which weakens least-loaded selection to session counts and default cooldowns. Credential exposure to agent commands is untested.
