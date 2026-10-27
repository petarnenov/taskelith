## Context

`followAttemptEnd` (`apps/control-plane/src/application/task-ending.ts`) is the only product caller of `automaticRetryOf`. In the transaction that ends an attempt, it opens a retry attempt when `automaticRetryOf` allows one and otherwise closes the task's delegation. `placement-service.ts` then places a retry attempt as an automatic retry of the attempt it names, which `retryStanding` and `isSafeToRetry` of `capacity-operations.ts` check against the retry allowance.

`ExitStatus` of `@taskelith/execution` is a code of 0 to 255, a signal name, or `unknown`. `AttemptOutcome` is `exited`, `operator-resolved`, or `not-started`, each with a `cancelled` flag.

## Decisions

- **D1: an exhaustive switch over `ExitStatus`.** `isFailedExit` returns true for a code other than 0 and for a signal, false for code 0 and for `unknown`. The switch has no default, so a new status kind fails type checking until it is classified.
- **D2: a spec delta, not only a test.** The living requirement said "a status other than exit code 0", which reads as including `unknown`, so its text changes. The `g2-failure-scenarios` scenario for Linux CP9 already states that the task opens no automatic retry and stays as it is.

## Outcomes examined

- `not-started`, uncancelled: retried; the attempt ran nothing, as before.
- `exited` with code 0: not retried (a clean exit is not acceptance; gates decide).
- `exited` with a code other than 0 after a proven start: retried.
- `exited` with a signal after a proven start: retried. A signal is a known status of a process set proven empty (contract section 8); a cancellation's kill carries `cancelled` and is not retried.
- `exited` with `unknown`: not retried (this change).
- `exited` without a proven start: not retried.
- `operator-resolved` and any cancelled outcome: not retried.

## Open question

`isSafeToRetry` gives an automatic retry an allowance after any `exited` outcome with a proven start, including an unknown status. Capacity reservation contract section 13 ("until then a proven exit counts as safe") and the `resource-admission` requirement state exactly that, which differs from supervisor identity contract section 6. After this change no retry of an unknown exit is opened, so the check is not reached for one. The coordinator decided to align them in a separate contract-first follow-up change, `align-safe-to-retry-with-supervisor-identity`.

## Risks / Trade-offs

- An unknown exit after a proven start now ends the task without a retry; recovery is reconciliation or an operator's explicit retry, as the contract requires.
