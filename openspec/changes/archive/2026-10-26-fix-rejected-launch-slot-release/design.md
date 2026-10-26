## Context

`refusalOf` checks a new offer against the worker's slots and resources over `countedAttempts`. An attempt is counted when its assignment has not ended, or when an execution under it is "running". Before this change "running" was `state !== 'exited' && state !== 'not-started'`. A journaled execution has no state until its first grant (W3); after a final rejection (`rejected-final`, W3 without a grant) it stays without a state forever, because the worker retries nothing for it (worker journal contract section 5, recovery row "W3 with a non-retryable rejection"). When the scheduler then ends the assignment, the stateless execution still counted, so the slot was never freed.

## Contract rule followed

- `docs/contracts/capacity-reservation.md:143` (section 8): the worker counts, once per attempt, every acknowledged assignment that has not ended and every non-terminal execution, uncertain ones included.
- `docs/contracts/capacity-reservation.md:147` (section 8): an ended assignment is no longer counted.
- `docs/contracts/capacity-reservation.md:98` (section 6, condition 2): an execution for which no launch authorization was ever granted does not keep a reservation held.
- `docs/contracts/launch-authorization.md:47` (section 4) and `docs/contracts/worker-journal.md:81` (section 5): the execution states are `authorized`, `started`, `exited`, and `not-started`, and there is none before a grant. The non-terminal states are `authorized` and `started`.

The contracts are therefore explicit; no contract changes. The worker-runtime spec only says "counted attempts", so the delta adds scenarios for both sides of the rule.

## Decisions

- **D1: `holdsSlot` frees only on proof.** An execution frees its attempt's slot only when its state is terminal (`exited` or `not-started`), or when it has no state, no `uncertain` evidence, and a non-empty authorization history in which every operation is closed without a grant (`rejected-final`, `rejected-retryable`, or `expired`). Anything else holds: `authorized`, `started`, an unknown state, `uncertain` evidence without a terminal state, a `pending` or `granted` operation without a state, or no operation at all. The SQLite journal cannot store most of the held combinations, but the absence of a recognized active state is not proof of free capacity (review pass 1, M1).
- **D2: a terminal state wins over uncertainty evidence.** The journal keeps `uncertain` evidence after the execution's terminal fact (`uncertain_count` is never cleared), and the terminal fact is what releases a reservation (capacity reservation section 6). An `exited` execution with earlier uncertainty evidence therefore frees its slot, as before this change. Uncertainty holds the slot of every execution without a terminal state, following the rule that uncertainty is not free capacity (`capacity-reservation.md:117`). A `pending` operation holds because a grant may still answer it.
- **D3: no change to the active-assignment rule.** An assignment that has not ended is counted as before, whatever its executions are; the fix only changes which executions keep an ended assignment counted.

## Risks / Trade-offs

- A stateless execution whose last operation was rejected retryably or expired, under an ended assignment, is no longer counted. The worker launches nothing for an ended assignment, so no grant can follow for it.
- The fix is tested through `CommandIntake` with a real SQLite journal; the full crash scenario 24c is not part of this change.
