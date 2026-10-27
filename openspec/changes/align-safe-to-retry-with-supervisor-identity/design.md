## Context

`placeInTransaction` (`capacity-operations.ts`) reads a placement snapshot; for a request with `automaticRetryOf`, `retryStanding` marks the retry `uncertain` unless `isSafeToRetry` holds, and `decidePlacement` then rejects it with `retry-budget-exhausted`. `isSafeToRetry` accepted an earlier outcome that was `not-started`, or `exited` with a proven start whatever its status. `automaticRetryOf` (`automatic-retry.ts`), which decides whether an ended attempt opens a retry at all, already classified `ExitStatus` with an exhaustive switch (`isFailedExit`) since `stop-automatic-retry-of-unknown-exit`.

`ExitStatus` of `@taskelith/execution` is a code, a signal name, or `unknown`. `AttemptOutcome` is `exited`, `operator-resolved`, or `not-started`.

## Decisions

- **D1: contract first.** Capacity reservation contract section 13 is changed to agree with supervisor identity contract section 6 before the code. Section 5 ("an attempt whose execution is uncertain has `0`"), the section 11 reason table, the operational targets, and the `capacity-reservation` requirement "Bounded automatic retry" already agree and stay.
- **D2: one classification of the exit status.** `isFailedExit` becomes `exitVerdict`, an exhaustive switch returning `clean`, `failed`, or `unknown`. `automaticRetryOf` retries a `failed` verdict; the new `endedWithoutUncertainty` accepts `not-started` and any known verdict after a proven start. A new status kind fails type checking in one place.
- **D3: a clean exit stays certain.** `endedWithoutUncertainty` is not "retryable": an exit with code 0 after a proven start is certain, so a retry naming it keeps its allowance, as before. Whether such a retry is opened is `automaticRetryOf`'s decision, unchanged.
- **D4: the test drives the application path.** `isSafeToRetry` is private, so the test calls `placeInTransaction` with in-memory adapters; a positive case with exit code 1 shows the fixture can place, so the unknown case fails only on the retry check.

## Outcomes examined by `endedWithoutUncertainty`

- `not-started`: certain.
- `exited` after a proven start with code 0, another code, or a signal: certain.
- `exited` after a proven start with `unknown`: uncertain (this change).
- `exited` without a proven start: uncertain, as before.
- `operator-resolved`: uncertain, as before.

## Risks / Trade-offs

- None in practice: `automaticRetryOf` opens no retry after an unknown exit, so no placement names one; the check now refuses it too if a later caller does.
