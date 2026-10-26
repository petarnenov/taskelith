## Why

The archived `implement-worker-daemon-pressure` change (20e2) retries journal writes refused for lack of space (`SQLITE_FULL`, failure reason `disk-full`) after the `5s` to `60s` backoff with jitter. Its verification records one limitation: `recordUnrecordedProcess`, the Linux unrecorded-process report of the archived `implement-unrecorded-process-scan` change, is reported as a failure on a refusal for space and waits for the next start's scan. The [worker journal contract](../../../docs/contracts/worker-journal.md) section 7 ("Full disk") asks the worker to truncate `worker/logs/` and retry a refused write with the backoff of the operational targets.

## What Changes

- **Retry.** The start's unrecorded-process reports are kept by the launch orchestrator until each commits. Each pass journals the due ones through the existing `HeldWrites`, so a report refused for space is held back for the backoff, not reported as a failure, and journaled by a later pass of the same process; the other passes go on meanwhile.
- **Unchanged:** the scan runs once per start; the first pass journals the reports at the same point as before, after the record listing and before the recovery actions; the identity stays `['unrecorded-process', journalId, containment]`, so a retried report has the same `observationId` and the journal records it once per incarnation; the log shedding on a refusal is the adapter hook of 20e2.
- No contract, AsyncAPI, OpenAPI, or journal format change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: journal writes refused for lack of space now include the unrecorded-process report.

## Impact

- `apps/worker`: `LaunchOrchestrator` keeps the found unrecorded processes and journals them through `HeldWrites`.
- Tests: `apps/worker/test/unrecorded-process-scan.test.ts`.
- No new dependency.
