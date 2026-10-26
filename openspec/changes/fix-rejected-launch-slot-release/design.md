## Context

`refusalOf` checks a new offer against the worker's slots and resources over `countedAttempts`. An attempt is counted when its assignment has not ended, or when an execution under it is "running". Before this change "running" was `state !== 'exited' && state !== 'not-started'`. A journaled execution has no state until its first grant (W3); after a final rejection (`rejected-final`, W3 without a grant) it stays without a state forever, because the worker retries nothing for it (worker journal contract section 5, recovery row "W3 with a non-retryable rejection"). When the scheduler then ends the assignment, the stateless execution still counted, so the slot was never freed.

## Contract rule followed

- `docs/contracts/capacity-reservation.md:143` (section 8): the worker counts, once per attempt, every acknowledged assignment that has not ended and every non-terminal execution, uncertain ones included.
- `docs/contracts/capacity-reservation.md:147` (section 8): an ended assignment is no longer counted.
- `docs/contracts/capacity-reservation.md:98` (section 6, condition 2): an execution for which no launch authorization was ever granted does not keep a reservation held.
- `docs/contracts/launch-authorization.md:47` (section 4) and `docs/contracts/worker-journal.md:81` (section 5): the execution states are `authorized`, `started`, `exited`, and `not-started`, and there is none before a grant. The non-terminal states are `authorized` and `started`.

The contracts are therefore explicit; no contract changes. The worker-runtime spec only says "counted attempts", so the delta adds scenarios for both sides of the rule.

## Decisions

- **D1: `holdsSlot`.** An execution holds its attempt's slot when its state is `authorized` or `started`. `uncertain` is evidence beside one of those states, so uncertain executions stay counted.
- **D2: a pending request still holds.** An execution without a grant whose launch authorization request is `pending` is counted too, although it has no state yet. A grant may still answer it and move it to `authorized`; counting it until the answer arrives keeps the worker from admitting a second attempt into a slot that a grant could fill a moment later. This is stricter than the contract's wording and follows its rule that uncertainty is not free capacity (`capacity-reservation.md:117`). Once the request is rejected, expires, or is closed, the execution holds nothing.
- **D3: no change to the active-assignment rule.** An assignment that has not ended is counted as before, whatever its executions are; the fix only changes which executions keep an ended assignment counted.

## Risks / Trade-offs

- A stateless execution whose last operation was rejected retryably or expired, under an ended assignment, is no longer counted. The worker launches nothing for an ended assignment, so no grant can follow for it.
- The fix is tested through `CommandIntake` with a real SQLite journal; the full crash scenario 24c is not part of this change.
