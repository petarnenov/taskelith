# Account pool contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 5, `define-account-pool-contract`), under independent review. It defines the harness-neutral account pool port of [ADR 0005](../decisions/0005-harness-subscription-account-pools.md): subscription account slots per harness with allowed projects, eligibility, least-loaded selection inside the reservation transaction, cooldown, session affinity, the selection after a limit, encrypted slot credentials delivered only to the run that reserved the slot, and revocation and removal. The [harness account pools specification](../../openspec/specs/harness-account-pools/spec.md) states the behavior; this contract fixes the records, values, ports, and invariants that implement it. It extends the [capacity reservation contract](capacity-reservation.md) section 10. G3 item 12 implements it, item 9 maps its commands and views onto the OpenAPI document, item 18 delivers the credential inside the worker, and item 33 shows the pools.

## 1. Purpose and parties

The account pool is a capability of the Scheduling module, because a slot is a provider credential unit of a capacity reservation (capacity reservation contract section 2) and is selected inside the reservation transaction (section 4 of that contract). No type, value, schema, or test of the pool names a harness or vendor ([ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md) decision 8, ADR 0005 decision 8): a harness appears only as an opaque harness plugin identifier, and a subscription mechanism only as the opaque identifier of one that the plugin declares in its agent harness port `capabilities`.

| Port | Owner | Implemented by |
| --- | --- | --- |
| `AccountSlots`: slot records, read and written inside the reservation transaction | Scheduling | The item 12 adapter in the installation's PostgreSQL database |
| `SlotCredentials`: encrypted slot credential material | Scheduling | The item 12 adapter, whose encryption key, or whole store, lives in the `control-plane/` namespace ([installation and enrollment contract](installation-and-enrollment.md) section 3), never in the database; the encryption and key management choice belongs to item 12 |

Harness plugins never call these ports. A plugin declares its subscription mechanisms in its `capabilities` and reports load, limit, and reset signals through the agent harness port (item 3); the control plane turns those signals into slot updates (section 5). A plugin receives a slot's credential only through the run that reserved the slot (section 7).

This item adds the port types, the contract values, and a conformance suite for both ports. It adds no adapter, no selection or scheduler code, no encryption, and no wire schema.

## 2. Common rules

1. **Authorization.** The Access module checks the caller's role before a port is called ([trust model](../trust-model.md) section 3); a port never decides authorization itself. Slots are installation resources: adding a slot, changing its allowed projects or concurrency limit, storing or rotating its credential, and revoking, reinstating, or removing it are `installation-owner` commands. A `project-viewer` reads the pool state of its own project, never a credential; a slot shared with other projects is shown without their names (a requirement on items 9 and 33).
2. **Opaque identities.** A slot is identified by a `ProviderCredentialId`, the identifier that a reservation records in `providerCredentials`. The harness is a `HarnessPluginId` and the mechanism a `SubscriptionMechanismId`, both opaque to the pool. `HarnessPluginId` is the Execution module's type (`@taskelith/execution`), whose value is the harness plugin's manifest `id`; the agent harness port identifies a plugin by the same type ([agent harness port contract](agent-harness-port.md) section 4.1). `SubscriptionMechanismId` stays the pool's own opaque type: its values are drawn from the subscription mechanisms that the plugin declares through the agent harness port, and they are validated outside the pool. Wherever this contract orders by `id`, it means the code point order of the identifier's characters, as PostgreSQL's `COLLATE "C"` orders text, so that every replica and adapter agrees.
3. **Compare-and-set.** Every slot change replaces the record at an expected revision, inside the transaction that decides it, and fails with `conflict` when the revision has moved. A slot's revision starts at `1` and grows by one with each change.
4. **Failures.** Every operation that can fail for a domain reason returns a kernel `Result`: `invalid` for malformed input, `not-found`, and `conflict` for a duplicate or a lost compare-and-set. A read without a domain failure, such as `pool`, returns its value, as the capacity ledger does. A store that cannot be reached rejects the operation's promise, which aborts the reservation transaction.
5. **Secrecy.** A slot credential never enters a log, a prompt, a lesson, an error payload, an event, an outbox record, a view, or a wire response (ADR 0005 decision 6), nor the worker journal, an execution directory, or the worker's local outbox (section 7.3). Only `SlotCredentials` holds it at rest, and only the delivery to the reserving run reveals it. A subscription token has no shape that the shape rules of `@taskelith/secrets` match, so a run is redacted by the value of its credential (section 7.4).

## 3. Slots

### 3.1 Record

| Field | Meaning |
| --- | --- |
| `id` | The slot's `ProviderCredentialId` |
| `harnessId` | The harness plugin the slot belongs to; never changes |
| `mechanismId` | One subscription mechanism that the plugin declares in its agent harness port `capabilities` (section 2, rule 2). The control plane's add-slot command checks it against that declaration before `add`, and rejects a mechanism the plugin does not declare as a subscription, such as an API key, with `invalid`, as it rejects a mechanism that has no admitted delivery for the slot's harness, such as a `device-login` slot of Claude Code (section 7.1); `add` itself treats it as opaque |
| `credentialVersion` | The `SlotCredentialVersion` under which `SlotCredentials` holds the slot's current credential (section 6.2); only a rotation changes it (section 8.1) |
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
| `new-session` | project, `harnessId`, policy for no eligible slot | A session starts, including a new session of a task whose earlier session closed for a reason other than a limit |
| `resumed-session` | project, the session's `harnessId` and `slotId` | A session continues, for example after a restart; the session's harness and slot are fixed (section 4.3) |
| `after-limit` | project, the limited session's `harnessId` and `slotId`, the other harnesses allowed for the task in the project's order of preference | A new session continues the work of a session whose slot reported a limit (section 4.4) |

Which harnesses a task may use, and in which order, comes from the project's defaults and the task (G3 item 11); the pool takes them as given. Every request is built through `parseSlotRequest`, which rejects with `invalid` an `after-limit` request whose alternatives include the limited harness or name a harness twice. A request whose pinned or limited `harnessId` differs from the stored slot's `harnessId` is also `invalid`; `parseSlotRequest` cannot see the store, so the item 12 selection checks it against the stored slot inside the reservation transaction. A `new-session` request also names the project's policy for no eligible slot: `wait` or `reject` (section 4.5).

### 4.2 Least-loaded rule

Among the eligible slots of the requested pool, the slot with the fewest held reservations wins. Remaining ties go to the lowest usage fraction, then to the least recently reserved slot, then to the lowest `id` (section 2, rule 2), so that the rule is deterministic. The usage step applies only when every tied slot has a usage report whose window ends after `now`; otherwise it is skipped. A slot never reserved counts as least recently reserved. Every `reserved` outcome, of any request kind, sets the slot's `lastReservedAt` to `now` in the same transaction.

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

If the limited slot is revoked or removed while the request waits, step 2 no longer applies, and the request waits only for another harness. When no other harness has an eligible slot either, that wait has no end of its own: policy or an operator ends the request, which keeps ADR 0005 decision 4, because the pool still never switches to another slot of the limited harness. An `after-limit` request names no policy and never rejects, because ADR 0005 decision 4 makes the task wait.

### 4.5 No eligible slot

For a `new-session` request with no eligible slot in its pool, the policy decides: `wait` waits with `provider-concurrency-exhausted`, and `reject` rejects with `no-eligible-slot`. A slot outside the pool is never used. The reason values that this contract adds, `session-slot-withdrawn` and `no-eligible-slot`, are listed in the capacity reservation contract section 11. Item 12 derives the module's rejecting reasons from `SLOT_REJECTING_REASONS` instead of copying them; the waiting reason is already the capacity contract's `provider-concurrency-exhausted`, and the type system checks it against the waiting reasons.

### 4.6 Outcomes

A selection returns one of: `reserved`, with the slot and its harness; `waiting`, with `provider-concurrency-exhausted` and, when known, the earliest cooldown end among the slots it waits for; or `rejected`, with `no-eligible-slot` or `session-slot-withdrawn`. A waiting or rejected selection changes no slot.

## 5. Signals, health, and cooldown

The agent harness port (item 3) defines the load, limit, and reset signals that a plugin declares and reports; this contract defines only their effect on a slot. The control plane applies each signal as a compare-and-set change of the slot it names. A signal whose compare-and-set loses with `conflict` rereads the slot and applies the signal again to the fresh record, so that the rules below, such as a later limit never shortening a cooldown, hold against the latest record rather than a stale one.

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
| `pool(projectId, harnessId)` | The project's pool for the harness (section 3.1), ordered by `id`; empty when there is none |
| `replace(slot, expectedRevision)` | Replaces the slot when its stored revision equals `expectedRevision`. Checked in this order: `not-found` for an unknown slot, `invalid` for a new revision other than `expectedRevision` plus one, a `harnessId` change, or a slot leaving `removed`, then `conflict` when the stored revision differs |


### 6.2 `SlotCredentials`

| Operation | Contract |
| --- | --- |
| `store(slotId, version, secret)` | Stores the credential, encrypted at rest, under a new `version` that the command chooses; it never replaces a stored version. After `destroy(slotId)`, a store keeps nothing, even one that runs at the same time as the destroy. It has no domain failure: the add-slot command stores before it adds the record that names the version and discards the version when `add` fails, and the rotate command stores before the transaction that switches the slot to the version (section 8.1) |
| `reveal(slotId, version)` | The credential of that version for the delivery of section 7; `not-found` when it is not stored. It checks no reservation, attempt, or slot state: the delivery checks them and reads the slot's `credentialVersion` before it calls `reveal` |
| `discard(slotId, version)` | Destroys one version, the one a rotation failed to switch to (section 8.1); discarding a missing one succeeds, and it has no domain failure |
| `discardAllExcept(slotId, version)` | Destroys every version of the slot stored before it other than `version`: after a rotation's switch, the replaced version and every version that a failed or stopped rotation left (section 8.1). A store that runs at the same time may be kept. It succeeds when nothing is stored, keeps later stores, and has no domain failure |
| `destroy(slotId)` | Destroys every version of the slot and every later store for it (section 8); destroying a missing credential succeeds, so that a retry is safe, and it has no domain failure |

`SlotCredentials` is not part of `CapacityTransaction`, because its key and possibly its store live outside the database (section 1).

A `SlotCredentialVersion` is an opaque identifier, unique for the slot, that the command makes new for each store; a number derived from the record would let two concurrent rotations store under the same version. A `SlotSecret` is the text of one `subscription-token` credential (section 7.1). It reveals its text only through its `reveal()` method. Its string and JSON forms are the kernel's `REDACTED`, `[redacted]`, so that a logged or serialized secret discloses nothing. The adapter encrypts the material at rest with a key kept in the `control-plane/` namespace, never in the database (section 1); this item states the requirement and leaves the algorithm and the key management to item 12.

## 7. Credential delivery

A credential is revealed only to deliver it to the run that reserved its slot. The delivery, not `SlotCredentials`, makes the checks: in a capacity transaction, it checks that the reservation is `held`, names the slot in `providerCredentials`, and belongs to the attempt that the worker launches, that the slot is `active`, and that its `mechanismId` has an admitted delivery for its `harnessId` (section 7.1), and it reads the slot's `credentialVersion`. It calls `reveal` for that version only after that transaction commits, because `SlotCredentials` is outside `CapacityTransaction` (section 6.2), and sends the credential only with a valid launch authorization for that attempt ([launch authorization contract](launch-authorization.md)) over a confidential transport (section 7.2). The credential travels only in the control plane's API response to the worker's launch authorization or re-delivery request, never in a broker message or stream, which would keep it at rest in the broker. The worker receives the credential with the launch of that attempt, inside the worker container on Linux, and the harness plugin injects it into its harness (item 18). A credential is never sent to another run, another worker, or another plugin.

A revoke or removal serialized after the delivery transaction commits but before the credential is sent does not stop that delivery: the attempt already checked receives the credential. Section 8 covers this window: a revocation cancels the in-flight attempts on the slot (section 8.1), and a removal drains or rejects them, that attempt among them.

### 7.1 Admitted deliveries

A slot's credential is delivered only through a delivery admitted for the slot's harness and mechanism. A harness plugin's mechanism gets an admitted delivery when the item that admits the harness defines how that mechanism's credential is delivered; the control plane keeps the admitted pairs of harness plugin and mechanism outside the pool, which stays neutral (section 1). The add-slot command rejects a slot whose mechanism has no admitted delivery for its harness with `invalid` (section 3.1), and the delivery reveals nothing for such a slot.

This contract defines one delivery, `subscription-token` (agent harness port contract section 4.1): one text per slot, which the harness reads and never changes, so the run has nothing to write back. A `device-login` slot holds a per-slot state directory that the harness updates during a run, for example a rotating refresh token; delivering it needs a state directory format and a write-back that only the reserving run makes, by compare-and-set, and neither is defined. G3 admits one harness, Claude Code (item 19), and G3 decision D6 chose a subscription token per slot for it, if item 35 confirms it ([G3 work plan](../g3-plan.md), "Owner decisions"), so Claude Code's only admitted delivery is `subscription-token`, and a `device-login` slot of Claude Code is rejected. Another harness gets the delivery of its own mechanism when it is admitted, for example a later harness whose subscription state is a file per home directory.

### 7.2 Transport

G2 runs the API and the broker over plain HTTP and NATS ([installation and enrollment contract](installation-and-enrollment.md) section 7). A credential is therefore delivered only over the TLS of G3 item 26, or to a worker co-located with the control plane on its host. A remote worker receives no slot credential before item 26 provides that TLS.

### 7.3 The credential on the worker

The worker holds a delivered credential only in its host's memory, for the execution it was delivered to, and gives it to the harness plugin to inject. It never writes it to the worker journal, a launch authorization request or grant included, to the execution directory `worker/executions/<executionId>/`, to `worker/logs/`, or to the local outbox ([worker journal contract](worker-journal.md) sections 2, 5, and 6); a launch authorization grant carries no credential. The worker keeps no copy when the execution ends, and no execution reuses the credential of another. Every execution after its W3 commit, one that recovery starts with a new `executionId` and one that recovery adopts included, requests the credential again through a new delivery with the checks of section 7; an adopted execution requests it before it redacts or injects anything with it. Because a rotation switches a slot's `credentialVersion` only while the slot is revoked and no held reservation names it, and a delivery reveals the version that the slot record names (section 8.1), every delivery to a run reveals the credential that the run started with.

**Re-delivery to an adopted execution.** An adopted execution has no usable launch authorization: its grant expires after `ttl`, and another authorization of the same `executionId` is allowed only while it has not started ([launch authorization contract](launch-authorization.md) sections 4 and 7). Its re-delivery therefore replaces section 7's launch authorization condition with an ownership check, made in the same `SERIALIZABLE` capacity transaction as the reservation and slot checks: the installation is not in restore quarantine; the authenticated worker is enrolled, unrevoked, at its current credential generation, and at the current recovery epoch; it holds the execution's assignment at the current ownership generation, and the attempt is not cancelled or terminal; and the execution is the attempt's owning execution, `authorized` or `started`, with no `revoked` grant. A failing check reveals nothing and refuses the re-delivery with the reason that launch authorization contract section 9 assigns to the same check: `quarantined`, `stale-recovery-epoch`, `worker-not-authorized`, `assignment-not-active`, `stale-ownership-generation`, `attempt-not-launchable`, `execution-conflict` for an execution that is not the owning one, is terminal, or has a `revoked` grant, and `capacity-not-reserved` for a reservation that is released, held for another attempt, or does not name the slot. A slot that is not `active` refuses it with its ineligibility reason, `revoked` or `removed` (section 3.2), and a slot whose mechanism has no admitted delivery for its harness with `invalid`. The checks run in that order, so a cancelled attempt gives `attempt-not-launchable` before its revoked grant is checked. A worker whose re-delivery is refused cannot redact the run by value, so it writes none of the run's harness output, terminal stream, or log text to any record of section 7.4 and never sends it off its host, even after the run ends: it discards that text and keeps only the run's facts that hold no run text, such as its exit and its cancellation.

### 7.4 Redaction for the run

The shape rules of `@taskelith/secrets` ([installation and enrollment contract](installation-and-enrollment.md) section 8) match only Taskelith's own secrets, and a subscription token has no known shape. From the delivery to the end of the run, every text of the run, whatever its channel, its harness output, terminal stream, logs, and failures included, is therefore redacted by value before it is written to the worker journal, `worker/executions/<executionId>/`, `worker/logs/`, or the local outbox, and before it leaves the harness host: `redactSecrets(text, revealed)` and `redactFailure(failure, revealed)` find every occurrence of each revealed credential text in the original text, overlapping ones included, and replace each run of occurrences that overlap or touch with one `[redacted]`. A whitespace-free word that holds both an occurrence and a secret that the shape rules match is replaced whole, so that neither secret leaves a visible part; the shape rules then apply to the rest. Both functions redact one whole text, so a stream is redacted over a sliding window: the worker holds back the stream's trailing whitespace-free word, and at least its last `max(len(value)) - 1` characters, until the next chunk or the end of the stream, so that a credential split across chunks is still found, and it truncates text only after redacting it. `redactFailure` redacts a failure's detail keys as well as its values, and joins, with `, ` and in their order, the values of keys that become equal. The worker keeps the revealed value for the run until the run ends, after a revocation or removal of its slot too (section 8). Item 18 applies them on the worker, and the control plane applies them to a failure of the delivery. Whether the agent's own commands can read the injected credential is a qualification result (agent harness port contract section 4.1; item 35), which this redaction does not change.

## 8. Revocation, reinstatement, and removal

| Command | From | To | Effect |
| --- | --- | --- | --- |
| Revoke | `active` | `revoked` | The slot leaves every pool and no credential is revealed for it; the stored credential is kept encrypted |
| Reinstate | `revoked` | `active` | The slot returns to its pools with its health, cooldown, and usage as they were |
| Remove | `active` or `revoked` | `removed` | Every version of the credential is destroyed, one that a concurrent rotation stores included (section 6.2); the record stays as a tombstone for the reservations and audit records that name it |

A held reservation blocks neither revocation nor removal. A revocation cancels the in-flight attempts on the slot as section 8.1 says, and that cancellation is the justifying fact that releases their reservations as the capacity reservation contract section 6, "Cancellation", says; a removal releases none by itself. A removal drains or rejects them by policy or an operator (ADR 0005 decision 6); a removal of a revoked slot finds them already cancelled by the revocation, so an operator who must stop a compromised credential's runs at once revokes the slot before removing it. In-flight attempts, including one whose credential delivery committed before the command and is still being sent (section 7), release their reservations only by a justifying fact (capacity reservation contract section 6); their sessions are never moved to another slot or harness. A drained attempt keeps the credential delivered to it, but its re-delivery is refused, because the slot is no longer `active` (section 7.3). Each command is audited with its actor and time.

### 8.1 Rotation and emergency revocation

A run keeps the credential it started with, because redaction by a new value would miss output that holds the old one (section 7.4). The rotate command therefore never changes a stored credential: it reads the slot's `credentialVersion`, stores the new credential under a new version (section 6.2), and then, in one capacity transaction, checks that the slot is `revoked`, that `heldForCredential` counts no held reservation of it, and that its `credentialVersion` is still the one it read, and switches the slot to the new version by compare-and-set on the revision it read, setting it `healthy` (section 5). It refuses the rotation with `conflict` when a check fails, and then discards the new version. The switch is the only change of the credential that a delivery sees, so a reinstatement or removal can run at any time: one serialized before the switch makes it fail, and the slot keeps its version; one serialized after it finds the new version. A delivery holds a reservation, so the version it read is never switched or discarded before it reveals it, and a removal's `destroy` removes every version, one that a rotation stores afterwards included. A rotation that fails or stops between its store and its switch leaves a version that no record names, which no delivery reveals; the operator runs the rotation again.

No superseded version is kept. After the switch commits, the rotate command calls `discardAllExcept(slotId, newVersion)`, which discards the replaced version and every version that an earlier failed or stopped rotation left, and then advances the slot's revision by one in a capacity transaction that changes nothing else. A concurrent rotation whose version the discard removed read the record before that advance, so its switch fails with `conflict` and no record names a discarded version; a `conflict` of the advance itself means another command moved the revision, which fences the same way. A rotate command that stops after its switch leaves these versions to the next rotation of the slot or to its removal. An operator rotates an active slot by revoking it, waiting until its reservations are released, rotating, and reinstating it.

A held reservation never blocks a revocation or a removal, so a compromised credential can always be withdrawn. In its `SERIALIZABLE` transaction, the revoke command cancels the assignment of every attempt whose held reservation names the slot. That cancellation is an invalidating writer of the [launch authorization contract](launch-authorization.md) section 5: it revokes the attempt's grants and writes a cancellation command for the attempt to the outbox, and the reservation is released as the capacity reservation contract section 6, "Cancellation", says: by the revoke transaction itself when no execution under the assignment is `authorized` or `started`, for example a reserved attempt not yet launched, and otherwise by the transaction that records that execution's terminal fact. The worker journals the command as a cancellation request and forwards it to the execution's supervisor ([worker journal contract](worker-journal.md) section 5). Until the run ends, the worker keeps redacting it by the value delivered to it (section 7.4); a re-delivery after a worker restart is refused, because the slot is no longer `active` (section 7.3).

## 9. Required tests

This item adds, through `make`:

- A test that pins the contract values of sections 3, 4, and 5, and tests of `parseAccountSlot` and `parseSlotRequest`.
- Conformance suites for `AccountSlots` and `SlotCredentials`, run against an in-memory test double: duplicate adds, reads in every state, the pool filter by project, harness, and state, compare-and-set with one winner among concurrent writers, refused revision skips and harness and tombstone changes, credential versions, idempotent destruction, and the redaction of a `SlotSecret` in its string, JSON, and inspection forms.

The item 12 implementation adds:

- The conformance suites run against its PostgreSQL adapter.
- A selection test for each rule of section 4: the fewest held reservations, the usage tie-breaker only with every tied slot reporting, the least recently reserved slot, a resumed session that waits or is rejected and never moves, an `after-limit` request that never chooses another slot of the limited harness and falls back to the limited slot after its cooldown, and both policies for no eligible slot.
- A cooldown test for a reported reset, the default, an extension, and a reset signal.
- A delivery test that the version the slot record names is revealed, that no credential is revealed for a released reservation, a reservation that names another slot, another attempt, a revoked or removed slot, or a slot whose mechanism has no admitted delivery for its harness, that the credential is sent only in the API response, and that a `device-login` slot of a harness without an admitted `device-login` delivery cannot be added.
- A re-delivery test for an execution adopted after its grant expired: it is delivered while the worker owns the execution's current attempt and the attempt holds the slot's reservation, and refused with section 7.3's reason for each failing check.
- A rotation test that a rotation is refused with `conflict` while the slot is `active` or a held reservation names it, and succeeds on a revoked slot without one; that a reinstatement, a removal, or another rotation serialized between its store and its switch makes the switch fail with `conflict`, discards the new version, and leaves the slot's version, so that a delivery after the reinstatement reveals the old credential; that after a successful switch the replaced version and a version left by an earlier crashed or refused rotation are discarded and the new one is revealed; that a rotation whose store ran before that discard fails its switch with `conflict`; and that a version stored after a removal's `destroy` is not kept.
- A revocation test that revoking a reserved slot succeeds, revokes the attempt's grants, writes its cancellation command, and keeps the reservation until the execution's terminal fact, and that revoking a slot whose reserved attempt has no `authorized` or `started` execution releases the reservation in the revoke transaction.
- A removal test that removing a reserved `active` slot succeeds, destroys the credential, writes no cancellation command of its own, leaves the attempt to be drained or rejected by policy or an operator, keeps the reservation until the execution's terminal fact, and refuses the attempt's re-delivery.
- A concurrency test that two transactions racing for the last unit of a slot reserve it at most once.
- A secrecy test that a failing run's error payload, its logs, and the outbox contain no slot credential, and a neutrality test that the pool's code and tests name no harness or vendor.

The follow-up `align-slot-credential-delivery` adds tests that `redactSecrets` and `redactFailure` redact a revealed credential without a known prefix by value: in a failure's detail keys too, with one `[redacted]` for overlapping or touching occurrences, never inside an earlier marker, in linear time, and leaving no part of a shape secret that shares a whitespace-free word with an occurrence. It also changes the `SlotCredentials` conformance suite to versions: a store never replaces a version, a reveal reads one version, a discard destroys one, a `discardAllExcept` destroys every other version of the slot, idempotently, and keeps later stores and other slots' versions, and a destroy destroys every version and keeps nothing that a later store writes. An adapter whose `discardAllExcept` retains versions fails the suite.

The item 18 implementation adds:

- A test that the worker journal, `worker/executions/<executionId>/`, `worker/logs/`, and the local outbox hold no slot credential after a run, a failing run, and a recovery.
- A test that a recovered and an adopted execution request the credential again through a new delivery, and that the run's harness output, terminal stream, logs, and failures are redacted by its value before they are written to a worker record or leave the host, a token split across two stream chunks and a truncated text included.
- A test that after a refused re-delivery the worker writes none of the run's harness output, terminal stream, or log text to a worker record and never sends it off the host, also after the run ends, and that a run whose slot is revoked or removed stays redacted by its delivered value until it ends.

## 10. Not in this contract

- The load, limit, reset, and subscription mechanism signals themselves: the agent harness port (item 3).
- The handoff that a limited session writes and the next session reads: items 4 and 18.
- Wire schemas for slot commands and pool views: item 9.
- The encryption algorithm, key storage, and key rotation: item 12.
- The delivery of a mechanism other than `subscription-token`, such as the state directory format and the compare-and-set write-back of a `device-login` credential: the item that admits it for a harness (section 7.1).
- The workers and pools screens: item 33.
