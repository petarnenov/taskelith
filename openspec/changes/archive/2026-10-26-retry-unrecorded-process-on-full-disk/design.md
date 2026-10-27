## Context

20e2 (`implement-worker-daemon-pressure`, archived) gave the worker three retry paths for a journal write refused for lack of space: the watch derives an execution fact again, `commitWrite` retries a launch write unchanged, and `HeldWrites` holds back a write that each pass derives again (the cancellation evidence and the removal of a confirmed record) until the backoff has passed on the deadline clock. The unrecorded-process scan (archived `implement-unrecorded-process-scan`) arrived on `dev` during 20e2, and its write was left out: `#reportUnrecordedProcesses` journals each report once in the first pass through `reported()`, so a refusal for space is a failure until the next start scans again (20e2 verification, Limitations).

## Goals / Non-Goals

**Goals:** a report refused for space is retried in the same process with the 20e2 backoff, through the existing `HeldWrites`, with its identity and the write ordering kept.

**Non-Goals:**

- Any contract, AsyncAPI, OpenAPI, or journal format change.
- A second scan in the same process; the fate of leftover record directories; macOS, which has no scan.
- Failure scenarios (G2 item 24).

## Decisions

### D1: keep the reports, not the scan

The scan reads kernel state that can change, and it runs once per start by design (worker-runtime "Start reconciliation"). The first pass keeps each populated containment without a record in `#unrecorded`, keyed by `unrecorded-process/<containment>`, and `#recordUnrecordedProcesses` journals the due ones on every pass; a committed report leaves the map. A retried report is the one the scan found, with the same members.

- **Alternative:** scan again on a later pass. It would report containments that appeared after the start, which the start reconciliation does not ask for, and would need its own backoff.

### D2: `HeldWrites`, as the other pass-driven writes

Each report goes through `HeldWrites.due` and `HeldWrites.commit` under its key. A refusal for space is logged as `worker.journal.space-refused`, held back for `launchRetryDelay` (`5s` to `60s` with jitter, growing with consecutive refusals of the key) on the deadline clock, and not reported as a failure; an unreadable clock lets it be tried at the next pass. The adapter's `onSpaceRefused` hook sheds `worker/logs/` on each refusal, as for every write. The pass is not delayed, so launches, cancellations, and record removals go on meanwhile. A stop ends the retries, and the next start scans again.

A failure other than a refusal for space is reported through `onFailure`, as before, and the report stays kept like the other pass-driven writes, so a later pass tries it again. A journal that stopped after a flush failure or corruption fails the pass's snapshot first, so nothing is tried then.

### D3: identity and ordering

The adapter derives the `observationId` from `journalId` and the containment and journals nothing while an entry for the containment waits in the outbox, so a retried report gets the same identity and is recorded once per journal incarnation ([worker journal contract](/docs/contracts/worker-journal.md) section 6). The first pass journals the reports where it did before: after the plan is logged, the records are listed, and the leftovers are logged, and before the recovery actions. A later pass journals the due ones at the same point.

## Risks / Trade-offs

- **A failure other than a refusal for space** is now reported at each pass while it lasts, as for the cancellation evidence and the record removal, instead of once per start.
- **A process that stops before the report commits** loses it; the next start scans again and reports what is still populated, as before.
- **Rollback:** nothing is persisted; the worker package is unreleased.
