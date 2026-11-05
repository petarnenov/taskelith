## Why

G3 plan item 12d B ([G3 plan](/docs/g3-plan.md) row 12d), split by the coordinator (Niki) on 2026-11-05 into B1, this change, and B2 `add-slot-rejecting-reasons-to-the-wire`. `control-plane.openapi.json` 0.5.0 declares the eight account slot operations and `access-requirements.ts` already binds their roles, but no route serves them: the pool's commands from 12d A have no caller, `fetchSlotCredential` answers 503 because the control plane composes no key, credential store, or admitted pairs, the credential sweep never runs, and the default cooldown is no setting. The account slots screen of item 33c needs the operations over HTTP.

## What Changes

- Scheduling: `AccountSlots` gains `list(after, limit)`, every slot with the removed tombstones, and `listForProject(projectId, after, limit)`, the active slots that allow the project, in both adapters with conformance cases; the slot commands take the client's `expectedRevision` and compare it first.
- `@taskelith/secrets` mints slot identifiers (`s` and 32 hexadecimal digits); `@taskelith/control-plane-store` replaces the lazy `openSlotCredentialKey` with `SlotCredentialKeyFile`, which initialization creates and the start only reads.
- Control plane: an `AccountSlotService` and an `AccountSlotApi` serve the eight operations; the composition builds the key, the cipher, `PostgresSlotCredentials`, the one admitted pair of Claude Code (`subscription-token`, slot limit 1), the delivery service of `fetchSlotCredential`, the supervised sweep loop, and the slot signals with the default cooldown of `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES`; the browser endpoint no longer serves the worker-only operations.
- OpenAPI 0.5.0: four response descriptions of the slot commands are corrected to the 12d decisions (no schema change, no version bump).
- Documentation: account pool contract sections 6.1, 13, and a new section 14; control-plane wire contracts "Account slots".
- Spec deltas: `control-plane-api` (the operations, the endpoint split, the key at initialization, which MODIFIES "SCM integration secret key at initialization", and the composed loop and setting) and `account-pool-port` (the listing, and the expected revision of "Slot commands besides adding").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the account slot operations, the worker-only routes off the browser endpoint, the slot credential key at initialization, and the sweep and cooldown composition.
- `account-pool-port`: slot listing, and slot commands by the client's expected revision.

## Impact

Private workspace packages only (`@taskelith/scheduling`, `@taskelith/postgres`, `@taskelith/secrets`, `@taskelith/control-plane-store`, `@taskelith/control-plane`, `@taskelith/contracts`, and tests); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. No migration. Size M-L. Not in this change: the slot rejecting reasons on the wire and OpenAPI 0.6.0 (B2), an audit of the slot commands (follow-up), key rotation (12d C, 12f), load and health signals (12e), and any UI (33c).
