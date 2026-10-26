## Context

A restore of PostgreSQL increments the installation's recovery epoch and puts the installation into restore quarantine ([trust model](../../../docs/trust-model.md), [launch authorization contract](../../../docs/contracts/launch-authorization.md) section 8). Until now only `execution.started` carried the epoch, and `decideStartObservation` returned `quarantine-evidence` for a start at another epoch or in quarantine. Every other execution observation was applied whatever epoch its worker held, so an exit reported from before a restore ended its attempt (bug B4, crash scenario 24c). The owner's delegate decided in away run `20261026T164615Z-opencode-20899` to extend the start rule's gate to every execution observation.

## Goals / Non-Goals

**Goals:** an exit, `not-started`, `uncertain`, `termination-unproven`, or `cancellation.not-applied` at another epoch, or in quarantine, changes no current state and stays as evidence; the same observation at the current epoch outside quarantine behaves as before.

**Non-Goals:**

- The 24c crash-window test and its B4 todo, which another change flips.
- Launch authorization sections 4 and 9 and `LaunchRequest`, which another change edits.
- The other 24c defects: the inventory loop, per-execution cancellation, and the rejected-launch slot.
- Quarantine reconciliation itself (G6) and a new record of evidence observations beyond the inbox and the log.

## Decisions

### D1: the worker reports the epoch on the wire

Each execution observation carries a required `recoveryEpoch`, as `execution.started` already does. For an execution fact it is the epoch of the launch intent, which the offer named and the worker's launch requests carried; for `execution.unrecorded-process`, which has no intent, it is the epoch of the worker's journal.

- **Alternative:** the control plane derives the epoch from the grant of the named execution. It needs no wire change, but the decision states the gate in terms of the observation's own epoch, as the start rule does, and an unrecorded process has no grant.
- **Where the epoch comes from.** `ExecutionSubject` gains `recoveryEpoch`, which `subjectOf` already read from the intent in the same commit, so every execution fact in the journal stores it. The start fact took it from there already; it now comes through the subject.

### D2: version outcome

`make contract-compatibility` reports the added required fields as breaking changes of `execution.asyncapi.json` (192 changes over the dereferenced document, against `62d324e`) and fails while `info.version` stays 0.5.0. The document is 0.6.0, the minor increase that declares a breaking change while the major version is 0. `execution.openapi.json` is unchanged.

- **Protocol version stays 1.** Wire contracts section 3 asks for the next protocol version when a worker of the current version could not execute a change correctly, such as a new required field. The author kept version 1 because no worker or control plane of version 1 runs outside this repository: both are private workspace packages built from one commit, and nothing of them is published or deployed. Earlier tightenings of worker observations after their merge kept version 1 too, such as the declared capacity bounds (`13ca8fe`). This is recorded as an open point for the owner; the alternative is protocol version 2 with a control-plane window of 1 to 2, which would need a rule for a version 1 observation without an epoch.

### D3: one domain check, applied before the effect

`isQuarantineEvidence(recoveryEpoch, installation)` in `packages/modules/execution/src/domain/observation-epoch.ts` is the condition `decideStartObservation` used inline, extracted unchanged; the start decision now calls it, so the start rule and the other observations share one check.

In `observation-effects.ts`, `atCurrentEpoch(effect)` wraps the effects of `execution.exited`, `execution.not-started`, `execution.uncertain`, `execution.termination-unproven`, and `execution.cancellation.not-applied`. It parses the payload's epoch, reads the installation state with the existing `installationState`, and runs the effect only for current evidence. Otherwise it logs `execution.observation.evidence` with the type, the observation's and the current epoch, and the quarantine flag, and returns without effect, so the observation is recorded in the inbox, confirmed, and kept as evidence, as a `quarantine-evidence` start is.

- **Before the effect's own checks.** The gate runs before the attempt, generation, and execution lookups, as the start rule decides the epoch before whether the execution is known: in quarantine the restored state may not know the attempt, and the observation is evidence either way.
- **Starts unchanged.** `execution.started` keeps its own order (foreign and duplicate first), now through the shared check.

### D4: an unrecorded process is evidence at every epoch

Its effect only records it for the reconciliation queue and warns; it never changes current work. That record is the evidence quarantine reconciliation needs, so the gate would only drop it. The effect is not wrapped; its warning now also names the epoch.

### D5: journal format 4

Facts stored in a format 3 outbox have no epoch, and the worker would publish them without the now required field. Format 4 adds no column; its migration sets `recoveryEpoch` in each stored execution fact from the intent of its execution, falling back to the journal's epoch, and in each unrecorded process from the journal's. The `execution-started` fact had the epoch already and is skipped by the `IS NULL` condition.

## Risks / Trade-offs

- **Protocol version 1 kept (D2).** A worker built before this change would have its execution observations quarantined as malformed. No such worker exists outside development clones; the owner may still choose version 2.
- **Evidence only in the inbox and the log.** An evidence observation is not stored apart from the inbox entry and the warning; quarantine reconciliation (G6) defines how it reads them.
