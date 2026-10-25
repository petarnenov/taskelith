## Context

20a gave the worker its settings, enrollment, the root lock, and a broker connection. Item 12 provides `workerCommandConsumer`, whose reader already validates `VersionedCommand`, checks the version window, and then validates the command's own schema, and which acknowledges a message only after its handler answers ok. Item 14 provides the journal with W1 and the outbox. This change connects them.

## Goals / Non-Goals

**Goals:**
- command intake with the order of wire contracts section 3, W1 before every acknowledgement, and item 12's obligation to handle each command whatever arrived before it;
- the worker-side refusals of capacity reservation section 8 that do not depend on the operational limits;
- `worker.capacity.declared`, the outbox publication loop, confirmations, and the inventory answer.

**Non-Goals:**
- launches, the authorization retry loop, evidence, and the wire mapping of execution facts (20c);
- the inventory report on every reconnect, start reconciliation, the heartbeat, and the offline mode (20d);
- admission pressure, the disk floor, the backlog limit, and `requestDelegation` (20e);
- delivery of rotated worker credentials, which is G3 item 26 (#212).

## Decisions

### D1: the intake builds a journaled command; the journal commits it

`CommandIntake.handle` turns each delivered command into one `JournaledCommand` and calls `recordCommand`, which is W1. A rejection or refusal is journaled with its observation in that transaction, and an accepted offer with its `assignment-accepted` observation. The consumer acknowledges only after `handle` answers ok, so a failed or interrupted commit leaves the command unacknowledged, and the redelivery is a duplicate of a committed W1 or a first W1.

- **Order.** The reader applies `VersionedCommand`, the version window, and the schema. A command of an unsupported version passes with its stable part only; the intake checks the window again and rejects it with `protocol-not-supported`, then rejects another `workerId` with `addressed-to-another-worker`. Only then does it read the command's own fields.
- **Digest.** The SHA-256 of the command's JSON, so a reused `commandId` with other content is a conflict.

### D2: commands in any order

- An assignment end is journaled in its own table keyed by `assignmentId`, so an end that arrives before its offer is kept; a second end of the same assignment changes nothing.
- An offer is admitted like any other, and an ended assignment holds no slot and is never launched: the recovery plan treats an ended intent like a cancelled one.
- A cancellation that arrives before its offer is journaled as today, and the recovery plan already launches nothing for an intent with an accepted cancellation.

- **Alternative:** refuse an offer of an ended assignment. No refusal reason fits, and the control plane has already released the reservation, so acceptance as ended is the faithful record.

### D3: admission from the journal, outside W1

`refusalOf` checks the offer's request against the per-attempt ceiling (2000 millicores, 4096 MiB, the scheduler's constants), the declared enforceable controls, the slot count, and the CPU and memory left. It counts once per attempt every intent that has not ended and every intent with an execution that is not terminal, uncertain ones included. The check reads a snapshot before W1. That is safe because one pull consumer delivers this worker's commands one at a time, and only intake adds intents. A redelivered accepted offer is computed against a journal that already counts it, but W1 returns `duplicate` for its digest, so it is never refused afterwards.

### D4: journal format 2

The admission needs each intent's request, the inventory needs the command and the end of each assignment, and the declaration and snapshot numbers must survive restarts. Format 2 adds the request columns to `launch_intent`, the `assignment_end` table, and the declaration and snapshot counters to `journal_meta`. A start migrates format 1 forward in one transaction (contract section 10); its intents get a zero request, since no format 1 journal holds a G2 offer.

### D5: capacity declaration

Each start journals `worker.capacity.declared` when the configured capacity or the protocol window differs from the stored last declaration, before the consumer starts. Its `observationId` derives from the `journalId` and a declaration counter: the counter makes a return to an earlier capacity a new observation, and the `journalId` keeps two workers' declarations apart, which the broker would otherwise deduplicate by their `Nats-Msg-Id`.

### D6: publication, confirmation, and inventory

- **Publication.** A loop publishes `dueForPublication` in sequence order on the worker's observation subject with `Nats-Msg-Id` set to the `observationId`, marks each entry after the broker acknowledged it, and stops a round at the first failure. A fact this change cannot map, an execution fact, fails the round; 20c maps them with the launches that produce them.
- **Confirmation.** A confirmation of another worker or journal, or beyond the last assigned sequence, prunes nothing and is acknowledged. A journal failure is returned, so the message is redelivered.
- **Inventory.** `takeInventory` increments the snapshot counter and reads the snapshot with the last assigned sequence in one transaction. The answer is published in parts of at most 256 assignments and executions with one random `reportId`, and a failed part fails the request, whose redelivery takes a new snapshot.

### D7: wiring

`startWorker` declares the capacity, connects, and then runs the consumer and the publisher until `stop`, which aborts both and waits for them before it closes the connection and the journal. Test limits can shorten the transport timers.

## Risks / Trade-offs

- **Admission outside W1.** Correct only while one consumer journals commands. 20c adds launches, which change executions but never add intents, so the count can only fall between the read and W1.
- **Unmapped execution facts.** Until 20c, an execution fact in the outbox would stop publication; no code before 20c journals one.
- **Contract description.** The `EnrollmentRequest` description in `execution.openapi.json` now states the enrollment order of 20a's D1. It is a description-only change that the coordinator approved, and `make contract-compatibility` reports no breaking change, so the document version is unchanged.
