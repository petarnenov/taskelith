## Context

`planJournalRecovery` runs on every pass of the worker's `LaunchOrchestrator`, and its first pass after a start is the start reconciliation. For each intent it plans `seal-execution`, `recover-execution-record`, and `retry-authorization` per execution, and `continue-launch` when every execution of the intent ends without a process. Before this change one flag, set when the assignment ended or when any cancellation named the attempt or any execution of the intent, suppressed both `retry-authorization` and `continue-launch`.

## Contract rule followed

- `docs/contracts/execution-wire-contracts.md:46` (section 4): "A cancellation without `executionId` targets the attempt; with it, only that execution."
- `docs/contracts/launch-authorization.md:91` (section 7): the authority writes "a cancellation command for that execution only, never for another execution of the attempt".
- `docs/contracts/worker-journal.md:107` (section 5, "Recovery on start") continues the launch of an intent "not cancelled"; read with the two rules above, an execution target cancels the intent only through the execution it stops.

## Decisions

- **D1: the current execution is the intent's last one in journal order.** `JournalSnapshot.executions` is read in journal order (`ORDER BY rowid` in the journal adapter), and an intent gets a new execution only after its earlier ones ended `not-started`, so the last one is the execution a retry continues or a relaunch follows. No new journal field is needed.
- **D2: an execution target stops the intent only when it names the last execution.** Then the plan continues no launch and retries no authorization for the intent, as for an attempt target or an ended assignment.
- **D3: a cancelled execution is never retried,** even when it is not the last one; a cancellation of an earlier execution leaves the last one's retry and relaunch alone.
- **D4: A1.** A cancelled last execution that was sealed `not-started` before its supervisor started ends the intent: no relaunch follows. A new attempt is the control plane's decision. This is the option the owner's delegate chose (away run `20261026T194046Z-opencode-10250`, option A1).
- **D5: the rule amends "Cancellation forwarding", not "Start reconciliation".** The plan applies on every pass, not only the first after a start, and the rule scopes a cancellation by its target, as that requirement already does for a live launch; "Start reconciliation" has no room left under the requirement length limit.

## Risks / Trade-offs

- A cancellation of the last execution that arrives after a launch already wrote W2 for a successor names an earlier execution and no longer stops the intent. The successor is the launch's own, and the earlier execution is settled; this matches the live rule of `scope-execution-cancellation` (design D1 and D2), under which such a cancellation leaves the next execution launched.
- The change `fix-launch-recovery-reauthorization` also edits this file; this change touches only the cancellation decision, so the two should merge with at most a small textual conflict.
