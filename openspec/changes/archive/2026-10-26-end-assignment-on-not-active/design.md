## Context

The worker journal stores an assignment end as an `assignment_end` row keyed by the end command's `commandId` (W1). `readSnapshot` turns it into `JournaledIntent.ended`, which every worker path reads: `countedAttempts` in `apps/worker/src/assignment-admission.ts` stops counting the attempt, `planJournalRecovery` launches nothing more for it, and the inventory reports the assignment as `ended`. A launch rejection is journaled at W3 as the operation's outcome `rejected-final` with its `rejection_reason`, together with its `execution.launch.rejected` observation. Before this change nothing connected that rejection to `ended`.

## Contract rule followed

- `docs/contracts/capacity-reservation.md:151` (section 8): the worker ends an acknowledged assignment locally on an assignment-ended command or a launch authorization rejection with `assignment-not-active`, and stops counting it.
- `docs/contracts/capacity-reservation.md:143` (section 8): only assignments that have not ended, and non-terminal executions, are counted.
- `docs/contracts/launch-authorization.md:116` (section 9): `assignment-not-active` means the assignment is missing, ended, or held by another worker; it is not retryable.
- `docs/contracts/worker-journal.md:93` and `:111` (section 5): W3 journals a non-retryable rejection and its observation; nothing is retried after it.
- `openspec/specs/launch-reconciliation/spec.md:34`: the control plane only records `assignment-not-active`.

"Ends locally" therefore means the same local effect as an assignment-ended command: not counted, not launched, reported `ended`. The end command publishes no observation, and the rejection's own observation is already in the outbox, so the local end publishes nothing new. The contracts are explicit; no contract changes.

## Decisions

- **D1: the end is derived from the journaled rejection, not written again.** `readSnapshot` marks an intent `ended` when an `assignment_end` row exists or any operation of its executions was rejected with a reason for which `endsAssignment` holds. The W3 commit is already durable, so the local end survives a restart without a new write point, table, or journal format; and it is atomic with the rejection and its observation.
- **D2: the rule lives in the domain.** `endsAssignment(reason)` sits beside the rejection vocabulary in `launch-rejection.ts`; the adapter only applies it while mapping rows. Only `assignment-not-active` ends an assignment.
- **D3: the late end command reuses the existing path.** An `execution.assignment.end` after a local end is journaled at W1 and inserts its `assignment_end` row (`INSERT OR IGNORE`, as for any second end). It appends no observation, the intent stays `ended`, and recovery plans nothing for it. A redelivery is a `duplicate`.
- **D4: slots still follow executions.** An ended assignment keeps its slot while an execution under it holds one (`holdsSlot`); a rejected-final operation without a grant holds none, so the slot is freed at once.

## Risks / Trade-offs

- The local end is visible only through the snapshot; a future second journal implementation must apply `endsAssignment` too. The SQLite journal is the only implementation today.
- The inventory now reports such an assignment as `ended` before the control plane sends its end command; the control plane's inventory reconciliation acts only on omitted assignments, so this changes no control-plane decision.
