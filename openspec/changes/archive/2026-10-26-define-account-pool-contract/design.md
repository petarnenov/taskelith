## Context

ADR 0005, amended on 2026-10-25 by `record-session-harness-pinning` and `record-limit-handoff-rule`, fixes the pools: slots per harness with allowed projects, subscription mechanisms only, least-loaded selection, cooldown, a session pinned to its harness and slot, a different harness after a limit, encrypted credentials injected per run, and a harness-neutral port. The capacity reservation contract reserves a slot as a provider credential unit (`providerCredentials`) and counts its held reservations with `CapacityLedger.heldForCredential`. The agent harness port (item 3, in parallel) defines the load, limit, and reset signals and the declared subscription mechanisms.

## Goals / Non-Goals

**Goals:**

- One reviewed contract that fixes the records, values, ports, and invariants that item 12 implements.
- Port types, frozen contract constants, and conformance suites, with no harness or vendor named.

**Non-Goals:**

- Selection, cooldown, and delivery code (item 12), the harness signals themselves (item 3), the handoff (items 4 and 18), wire schemas (item 9), and the screens (item 33).
- The encryption algorithm and key management, which item 12 chooses; this change states the requirement only.

## Decisions

1. **Scheduling owns the pool.** A slot is a provider credential unit of a reservation and is selected inside the reservation transaction, so the port belongs to the module that owns reservations. A separate module would need a cross-module transaction for every reservation. Item 12 adds `AccountSlots` to `CapacityTransaction`; this change leaves that interface alone, so that no existing adapter changes.
2. **The slot identifier is the `ProviderCredentialId`.** The reservation already records provider credentials by that identifier, so a slot needs no second identity and the ledger counts its held reservations as they are.
3. **Three request kinds.** `new-session`, `resumed-session`, and `after-limit` make affinity and the limit rule part of the request type, so that no caller can ask for "another slot of the same harness" after a limit. Only `new-session` names a policy for no eligible slot, because a resumed session waits or is withdrawn and an `after-limit` request waits by ADR 0005 decision 4. A resumed session on a revoked slot is rejected rather than left waiting for a reinstatement that may never come: the harness account pools scenario "Slot revoked during a session" allows draining or rejection, and rejection hands the decision to the policy or an operator at once.
4. **After a limit, other harnesses first, re-evaluated.** Each attempt of an `after-limit` request tries the other allowed harnesses in the project's order, then the limited slot once its cooldown ends, so that the work moves to another harness as soon as one has an eligible slot.
5. **Deterministic tie order.** The least-loaded rule ends with the lowest identifier, so that two replicas and the tests agree.
6. **Revocation is reversible, removal is not.** Revocation keeps the encrypted credential so that an operator can reinstate the slot after an investigation; removal destroys it and keeps a tombstone, because reservations and audit records name the slot.
7. **`SlotSecret` as a value class.** A credential reveals its text only through `reveal()`, and its string, JSON, and inspection forms are `[redacted]`, so that an accidental log or serialization discloses nothing. The class holds the text in a private field and needs no dependency.
8. **Conformance suites with a test double.** The suites in `src/ports` fix the port rules that item 12's PostgreSQL adapter must pass. The in-memory double lives in the test, so that the change adds no adapter, and two broken doubles show that each suite fails a non-conforming adapter.
9. **One parser, no re-check in the ports.** `parseAccountSlot` holds the record invariants, as `parseResourceRequest` does for requests; the ports store parsed records and check only what they own: the first revision, compare-and-set, the fixed harness, and the tombstone.
10. **Provisional default cooldown.** The bounded default is an installation setting from 1 to 1440 minutes, provisionally 60, recorded in the operational targets. The coordinator may change the number without changing the rule.
11. **Roles.** Slot commands are `installation-owner` commands, because slots are installation resources that may serve several projects; a `project-viewer` reads its own project's pool state without credentials. This follows trust model section 3.

## Risks / Trade-offs

- **Parallel harness port.** Item 3 may name its signals differently. This contract names their effect only, and refers to the harness port for their form; a follow-up change aligns the words if needed.
- **Two plugin identifiers.** SDLC has `PluginId` for framework plugins, and item 3 may define a harness plugin identifier. `HarnessPluginId` is the pool's opaque name for it; when item 3 merges, a follow-up change replaces it with item 3's type if they differ, so that one type names a harness plugin.
- **Contracts before the G2 closure.** If the G2 closure defers something these ports rely on, follow-up changes correct them, as the owner decided on 2026-10-26.
