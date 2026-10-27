## Why

G3 item 0 (`revalidate-g3-foundations`) re-reviewed the account pool contract of G3 item 5 against G2 as built and deferred ten findings to this change ([archived verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-5)). The contract requires signals that the agent harness port does not carry: a separate reset signal that ends a cooldown (pass 1 M2, pass 2 L12) and a usage window end on each usage report (pass 1 M1, pass 2 L13). It assumes that the control plane can query a harness plugin outside a session for its subscription mechanisms and a credential's health (pass 2 M4), says that a signal names its slot although it names none (pass 2 L5), promises that work after a limit continues as soon as another slot is eligible although G2 placement backs off and rotates (pass 1 L1), says code point order where the module and the capacity contract use code-unit order (pass 2 L10), and still calls itself under review (pass 2 L11). The capacity reservation contract section 10 gives the per-session attempt invariant to G2 item 7, which delivered a per-task invariant (pass 1 L2).

## What Changes

- `docs/contracts/account-pool.md`: no separate reset signal; a cooldown ends only at its stored end. The pool derives a usage report's window end from the time it applies the report plus a per-harness usage window length in the pool configuration, and the usage tie-breaker is skipped when that end is unknown or past. Signals and authentication failures come only from sessions and are applied to the slot that the attempt's reservation records; the add-slot command checks a mechanism against the control plane's admitted pairs, never the plugin; a slot becomes healthy again only by a rotation. The after-limit wait follows the G2 fair order and backoff; ordering is code-unit order; the status line is current; sections 9 and 10 follow.
- `docs/contracts/capacity-reservation.md` section 10: G3 item 4 (`define-session-turn-model`) owns the per-session attempt invariant.
- `docs/architecture.md`: harness plugins declare usage, limit, and reset-time signals, the port's names.
- Spec deltas: `account-pool-port` (three modified, three added requirements) and `harness-account-pools` (one modified requirement).
- No code change: the agent harness port, the pool's port types, and `SlotUsage` stay as they are.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: the usage window derived by the pool, cooldown without a reset signal, session reports applied to the reserving slot, health from session failures, and code-unit order of a pool.
- `harness-account-pools`: the usage tie-breaker applies only within the window the pool derives.

## Impact

Contracts and specifications only; no runtime impact. G3 item 12 (`implement-account-pool`) implements the derived window, the per-harness usage window length setting, the signal application, and the health rule; G3 item 18 relays a session's signals and failures with its attempt. Out of scope: the findings deferred to `align-account-pool-placement-baseline` and `align-slot-credential-delivery`, and the decisions of `align-slot-credential-delivery` (#364) on the D6 token-only delivery, rotation, and revocation versus removal.
