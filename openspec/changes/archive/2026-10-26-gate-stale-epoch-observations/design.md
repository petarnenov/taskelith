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

- **Protocol version stays 1, as a recorded pre-release exception.** Wire contracts section 3 asks for the next protocol version when a worker of the current version could not execute a change correctly, such as a new required field. The owner's delegate decided in away run `20261026T183040Z-opencode-31830` to keep version 1 as a bounded exception, because: the worker and the control plane are private workspace packages built from one commit; G2 is unreleased, and nothing of them runs outside this repository; the journal format 4 migration (D5) gives facts already queued in a worker's outbox their epoch, so no queued observation is published without it; and an earlier tightening of worker observations after its merge kept version 1 too (`13ca8fe`, the declared capacity bounds). The exception ends at the first release of an execution package or at the G2 closure, whichever comes first; after that, wire contracts section 3 applies strictly. No version window of 1 to 2 and no rule for an observation without an epoch are added.

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

- **Protocol version 1 kept (D2).** A worker built before this change would have its execution observations quarantined as malformed. No such worker exists outside development clones, and the bounded pre-release exception of D2 ends at the first release of an execution package or the G2 closure.
- **Evidence only in the inbox and the log.** A gated observation, as a `quarantine-evidence` start, keeps only its inbox entry and a warning log, and its journal identity check and snapshot evaluation still run. The owner's delegate accepted both as G2 limitations in away run `20261026T184026Z-opencode-69502`; durable evidence content and deferred reconciliation go to G6 quarantine reconciliation.

## Follow-up candidates

1. A durable evidence store for stale and quarantine observations, starts included.
2. Restructuring `ObservationService.#record` so that the identity checks and the reconciliation are separate from the effects while the gate is closed.
