# Account pool contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 5, `define-account-pool-contract`), under independent review. It defines the harness-neutral account pool port of [ADR 0005](../decisions/0005-harness-subscription-account-pools.md): subscription account slots per harness with allowed projects, eligibility, least-loaded selection inside the reservation transaction, cooldown, session affinity, the selection after a limit, encrypted slot credentials delivered only to the run that reserved the slot, and revocation and removal. The [harness account pools specification](../../openspec/specs/harness-account-pools/spec.md) states the behavior; this contract fixes the records, values, ports, and invariants that implement it. It extends the [capacity reservation contract](capacity-reservation.md) section 10. G3 item 12 implements it, item 9 maps its commands and views onto the OpenAPI document, item 18 delivers the credential inside the worker, and item 33 shows the pools.

## 1. Purpose and parties

The account pool is a capability of the Scheduling module, because a slot is a provider credential unit of a capacity reservation (capacity reservation contract section 2) and is selected inside the reservation transaction (section 4 of that contract). No type, value, schema, or test of the pool names a harness or vendor ([ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md) decision 8, ADR 0005 decision 8): a harness appears only as an opaque harness plugin identifier, and a subscription mechanism only as the opaque identifier that the plugin's manifest declares.

| Port | Owner | Implemented by |
| --- | --- | --- |
| `AccountSlots`: slot records, read and written inside the reservation transaction | Scheduling | The item 12 PostgreSQL adapter in the `control-plane/` namespace |
| `SlotCredentials`: encrypted slot credential material | Scheduling | The item 12 adapter; the encryption and key management choice belongs to item 12 |

Harness plugins never call these ports. A plugin declares its subscription mechanisms and reports load, limit, and reset signals through the agent harness port (item 3); the control plane turns those signals into slot updates (section 5). A plugin receives a slot's credential only through the run that reserved the slot (section 7).

This item adds the port types, the contract values, and a conformance suite for both ports. It adds no adapter, no selection or scheduler code, no encryption, and no wire schema.

## 2. Common rules

1. **Authorization.** The Access module checks the caller's role before a port is called ([trust model](../trust-model.md) section 3); a port never decides authorization itself. Slots are installation resources: adding a slot, changing its allowed projects or concurrency limit, storing or rotating its credential, and revoking, reinstating, or removing it are `installation-owner` commands. A `project-viewer` reads the pool state of its own project, never a credential and never another project's slots.
2. **Opaque identities.** A slot is identified by a `ProviderCredentialId`, the identifier that a reservation records in `providerCredentials`. The harness is a `HarnessPluginId` and the mechanism a `SubscriptionMechanismId`, both opaque to the pool.
3. **Compare-and-set.** Every slot change replaces the record at an expected revision, inside the transaction that decides it, and fails with `conflict` when the revision has moved. A slot's revision starts at `1` and grows by one with each change.
4. **Failures.** Every operation that can fail for a domain reason returns a kernel `Result`: `invalid` for malformed input, `not-found`, and `conflict` for a duplicate or a lost compare-and-set. A read without a domain failure, such as `pool`, returns its value, as the capacity ledger does. A store that cannot be reached rejects the operation's promise, which aborts the reservation transaction.
5. **Secrecy.** A slot credential never enters a log, a prompt, a lesson, an error payload, an event, an outbox record, a view, or a wire response (ADR 0005 decision 6). Only `SlotCredentials` holds it, and only the delivery to the reserving run reveals it.

## 3. Slots

### 3.1 Record

| Field | Meaning |
| --- | --- |
| `id` | The slot's `ProviderCredentialId` |
| `harness` | The harness plugin the slot belongs to; never changes |
| `mechanism` | One subscription mechanism that the plugin's manifest declares. The control plane's add-slot command checks it against the manifest through the agent harness port (item 3) before `add`, and rejects a mechanism the plugin does not declare as a subscription, such as an API key, with `invalid`; `add` itself treats it as opaque |
| `allowedProjects` | The projects the slot may serve, at least one, without duplicates |
| `concurrencyLimit` | The slot's provider credential concurrency (capacity reservation contract section 2), a positive integer, by default `DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY` (`4`) |
| `state` | `active`, `revoked`, or `removed` (section 8) |
| `health` | `healthy` or `unhealthy` (section 5) |
| `cooldown` | Absent, or the end of the cooldown and its source: `reported-reset` or `default` (section 5) |
| `usage` | Absent, or the last usage report: a fraction from `0` to `1` of the slot's usage-window limit and the end of that window (section 5) |
| `lastReservedAt` | Absent, or the time of the slot's latest reservation |
| `revision` | Section 2, rule 3 |

`parseAccountSlot` checks these invariants: at least one allowed project and none twice, a positive integer concurrency limit and revision, and a usage fraction from `0` to `1`. Every command builds its record through it, and the ports store parsed records without checking them again.

A project's **pool for a harness** is the set of `active` slots of that harness whose `allowedProjects` include the project. Revoked and removed slots belong to no pool.

### 3.2 Eligibility

A slot is eligible for a reservation at the database time `now` when all of these hold. The first failing check, in this order, is the slot's ineligibility reason:

| Check | Reason |
| --- | --- |
| The slot is not removed | `removed` |
| The slot is not revoked | `revoked` |
| The project is in `allowedProjects` | `not-allowed` |
| The slot is `healthy` | `unhealthy` |
| No cooldown, or its end is at or before `now` | `cooling-down` |
| Its held reservations are below `concurrencyLimit` | `at-concurrency-limit` |

Held reservations are counted by the capacity ledger's `heldForCredential`, inside the same transaction. That count equals ADR 0005's active sessions only if a session has at most one active attempt; this contract relies on G3 item 4 establishing that, as capacity reservation contract section 10 requires.

## 4. Selection

### 4.1 Requests

Selection runs inside the reservation transaction (capacity reservation contract section 4), and the reservation records the selected slot in `providerCredentials`. A request has one of three kinds:

| Kind | Fields | Used when |
| --- | --- | --- |
| `new-session` | project, harness, policy for no eligible slot | A session starts, including a new session of a task whose earlier session closed for a reason other than a limit |
| `resumed-session` | project, harness, slot | A session continues, for example after a restart; the session's harness and slot are fixed (section 4.3) |
| `after-limit` | project, the limited session's harness and slot, the other harnesses allowed for the task in the project's order of preference | A new session continues the work of a session whose slot reported a limit (section 4.4) |

Which harnesses a task may use, and in which order, comes from the project's defaults and the task (G3 item 11); the pool takes them as given. An `after-limit` request whose alternatives include the limited harness, or name a harness twice, is `invalid`. A `new-session` request also names the project's policy for no eligible slot: `wait` or `reject` (section 4.5).

### 4.2 Least-loaded rule

Among the eligible slots of the requested pool, the slot with the fewest held reservations wins. Remaining ties go to the lowest usage fraction, then to the least recently reserved slot, then to the lowest `id`, so that the rule is deterministic. The usage step applies only when every tied slot has a usage report whose window ends after `now`; otherwise it is skipped. A slot never reserved counts as least recently reserved. Selecting a slot sets its `lastReservedAt` to `now` in the same transaction.

### 4.3 Session affinity

A session keeps the harness and slot that started it until its work is finished and the session and its agent are closed (ADR 0005 decision 5 as amended). A `resumed-session` request considers only its own slot:

- If the slot is eligible, it is reserved again, even when another slot is less loaded.
- If the slot is `unhealthy`, `cooling-down`, or `at-concurrency-limit`, the request waits with `provider-concurrency-exhausted`. A limit that the session's own slot reported does not lead here: that session writes a handoff and stops (section 4.4).
- If the slot is `revoked` or `removed`, or no longer allows the project (`not-allowed`), the request is rejected with `session-slot-withdrawn`. The session is drained or ended by policy or an operator, never moved to another slot or harness; its work may continue only in a new session.

No request kind moves a running session to another slot or harness, and no explicit reconciliation does either.

### 4.4 After a limit

When a session's slot reports a usage or rate limit, the slot enters cooldown (section 5), and the session writes a handoff and stops (G3 items 4 and 18). The new session that reads the handoff is selected by an `after-limit` request, which never chooses another slot of the limited harness, because that is "rotating accounts":

1. Each other allowed harness is tried in the given order with the least-loaded rule over its pool. The first harness with an eligible slot wins.
2. If no other harness has an eligible slot, the limited slot itself is reserved when it is eligible again, that is, when its cooldown has ended.
3. Otherwise the request waits with `provider-concurrency-exhausted`, and each later attempt repeats steps 1 to 3, so that the work runs on another harness as soon as one has an eligible slot, or on the limited slot once its cooldown ends.

If the limited slot is revoked or removed while the request waits, step 2 no longer applies, and the request waits only for another harness. An `after-limit` request names no policy and never rejects, because ADR 0005 decision 4 makes the task wait.

### 4.5 No eligible slot

For a `new-session` request with no eligible slot in its pool, the policy decides: `wait` waits with `provider-concurrency-exhausted`, and `reject` rejects with `no-eligible-slot`. A slot outside the pool is never used. The reason values that this contract adds, `session-slot-withdrawn` and `no-eligible-slot`, are listed in the capacity reservation contract section 11, and item 12 adds them to its reason constants.

### 4.6 Outcomes

A selection returns one of: `reserved`, with the slot and its harness; `waiting`, with `provider-concurrency-exhausted` and, when known, the earliest cooldown end among the slots it waits for; or `rejected`, with `no-eligible-slot` or `session-slot-withdrawn`. A waiting or rejected selection changes no slot.

## 5. Signals, health, and cooldown

The agent harness port (item 3) defines the load, limit, and reset signals that a plugin declares and reports; this contract defines only their effect on a slot. The control plane applies each signal as a compare-and-set change of the slot it names.

- **Limit.** A usage or rate limit puts the slot in cooldown until the reported reset time when that time is after `now` (source `reported-reset`), or for the bounded default otherwise (source `default`). The default is an installation setting from `1` to `1440` minutes, provisionally `60` minutes. A later limit extends a cooldown and never shortens it.
- **Reset.** A reset signal ends the slot's cooldown.
- **Load.** A usage report replaces `usage`. A report whose window has ended is ignored by the tie-breaker (section 4.2).
- **Health.** A slot becomes `unhealthy` when its harness plugin reports that the slot's credential fails authentication, and `healthy` again when its credential is replaced or a credential check through its plugin succeeds. A plugin without health reports leaves the slot `healthy`.

Cooldown and ill health make a slot ineligible for new reservations and release no held reservation (capacity reservation contract section 10). A plugin that reports no usage or reset time falls back to the held-reservation count and the default cooldown (ADR 0005 "Risks").

## 6. Ports

### 6.1 `AccountSlots`

Read and written inside the reservation transaction; item 12 adds it to `CapacityTransaction`.

| Operation | Contract |
| --- | --- |
| `add(slot)` | Stores a new slot; `conflict` when the identifier exists, and `invalid` when the revision is not `1` |
| `get(id)` | The slot in any state; `not-found` when it was never added |
| `pool(projectId, harness)` | The project's pool for the harness (section 3.1), ordered by `id`; empty when there is none |
| `replace(slot, expectedRevision)` | Replaces the slot when its stored revision equals `expectedRevision`; `conflict` when it does not, `invalid` when the new revision is not `expectedRevision` plus one, and `not-found` for an unknown slot |

`replace` does not let a slot change its `harness` or leave `removed`: such a change fails with `invalid`.

### 6.2 `SlotCredentials`

| Operation | Contract |
| --- | --- |
| `store(slotId, secret)` | Stores or replaces the slot's credential, encrypted at rest; a rotation replaces it |
| `reveal(slotId)` | The credential for delivery to the reserving run; `not-found` when none is stored |
| `destroy(slotId)` | Destroys the stored credential; destroying a missing one succeeds, so that a retry is safe |

A `SlotSecret` reveals its text only through its `reveal()` method. Its string and JSON forms are `[redacted]`, so that a logged or serialized secret discloses nothing. The adapter encrypts the material at rest with a key that is not stored in the same database; this item states the requirement and leaves the algorithm and the key management to item 12.

## 7. Credential delivery

A credential is revealed only to deliver it to the run that reserved its slot. The delivery checks, in the transaction that reveals it, that the reservation is `held`, names the slot in `providerCredentials`, and belongs to the attempt that the worker launches, and that the slot is `active`. The worker receives the credential with the launch of that attempt, inside the worker container on Linux, and the harness plugin injects it into its harness (item 18). The worker keeps no copy when the run ends, and no later run reuses it. A credential is never sent to another run, another worker, or another plugin.

## 8. Revocation, reinstatement, and removal

| Command | From | To | Effect |
| --- | --- | --- | --- |
| Revoke | `active` | `revoked` | The slot leaves every pool and no credential is revealed for it; the stored credential is kept encrypted |
| Reinstate | `revoked` | `active` | The slot returns to its pools with its health, cooldown, and usage as they were |
| Remove | `active` or `revoked` | `removed` | The credential is destroyed; the record stays as a tombstone for the reservations and audit records that name it |

Revocation and removal release no held reservation by themselves. In-flight attempts on the slot are drained or ended by policy or an operator and release their reservations only by a justifying fact (capacity reservation contract section 6); their sessions are never moved to another slot or harness. Each command is audited with its actor and time.

## 9. Required tests

This item adds, through `make`:

- A test that pins the contract values of sections 3, 4, and 5, and a test of `parseAccountSlot`.
- Conformance suites for `AccountSlots` and `SlotCredentials`, run against an in-memory test double: duplicate adds, reads in every state, the pool filter by project, harness, and state, compare-and-set with one winner among concurrent writers, refused revision skips and harness and tombstone changes, credential replacement, idempotent destruction, and the redaction of a `SlotSecret` in its string, JSON, and inspection forms.

The item 12 implementation adds:

- The conformance suites run against its PostgreSQL adapter.
- A selection test for each rule of section 4: the fewest held reservations, the usage tie-breaker only with every tied slot reporting, the least recently reserved slot, a resumed session that waits or is rejected and never moves, an `after-limit` request that never chooses another slot of the limited harness and falls back to the limited slot after its cooldown, and both policies for no eligible slot.
- A cooldown test for a reported reset, the default, an extension, and a reset signal.
- A concurrency test that two transactions racing for the last unit of a slot reserve it at most once.
- A secrecy test that a failing run's error payload, its logs, and the outbox contain no slot credential, and a neutrality test that the pool's code and tests name no harness or vendor.

## 10. Not in this contract

- The load, limit, reset, and subscription mechanism signals themselves: the agent harness port (item 3).
- The handoff that a limited session writes and the next session reads: items 4 and 18.
- Wire schemas for slot commands and pool views: item 9.
- The encryption algorithm, key storage, and key rotation: item 12.
- The workers and pools screens: item 33.
