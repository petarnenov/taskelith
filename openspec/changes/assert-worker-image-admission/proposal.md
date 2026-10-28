## Why

The worker self-check admission change (G3 item 27, [archived verification](/openspec/changes/archive/2026-10-28-implement-worker-self-check-admission/verification.md), section Limitations) left one gap: `make verify-installation` passed, but it never asserted the worker's admission. That the real Linux worker image runs its `linux-containment` self-check, passes it, and is `admitted` was therefore not shown by any Docker gate. The coordinator's brief (Niki, 2026-10-28) assigns this follow-up.

## What Changes

- **Admission wait in the bring-up check.** `scripts/installation.sh verify` waits, bounded, after the enrollment and again after the restart until the one worker is `admitted` with `linux-containment` `passed`; the second wait counts only a report consumed after the first wait's view time. It fails at once on `self-check-failed`, printing the failed check IDs with their redacted details, on a read failure other than `unavailable`, and on an admission without a passed containment check; an `unavailable` read or one with no output is read again, and a worker not admitted within `TASKELITH_ADMISSION_SECONDS` (positive whole seconds, default 300) fails as a timeout.
- **Launch command for the check.** A test-only Compose override, `infra/installation/verify/compose.yaml`, gives the worker a launch command, as the smoke override does, so that the containment check runs instead of being `not-applicable` with `no-launch-command`.
- **Workers view in the administrative entry.** A new administrative command, `worker-admission`, prints `WorkerAdmissionView.workers()` as JSON after it verifies the operator credential, with every stored detail redacted again. No HTTP operation exists for the view yet (G3 item 9), and the gate runs on the host, so the administrative entry is the way to read it.
- **Decision helper.** `scripts/installation-admission.ts` decides on the command's output (admitted, waiting, or refused) and is unit-tested; the shell loop is tested with a fake `docker`.
- **Docs.** The local installation guide, the installation contract section 4, and the worker admission contract section 8.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-installation`: "Opt-in bring-up check" modified; "Bounded admission wait of the bring-up check" and "Outcomes of the admission wait" added.
- `installation-enrollment`: "Workers view in the administrative entry" added.

## Impact

- `apps/control-plane` (private): `Administration.workerAdmission`, the `worker-admission` command, and `printableWorkerAdmission`.
- `scripts/installation.sh`, the new `scripts/installation-admission.ts`, and the new `infra/installation/verify/compose.yaml`.
- Tests: `test/installation-admission.test.ts` (new), `test/installation-script.test.ts`, `test/installation-composition.test.ts`, `apps/control-plane/test/admin-worker-admission.test.ts` (new), and `apps/control-plane/test/administration.integration.test.ts`.
- The published `taskelith` package does not change.
- Out of scope: the negative Docker case of a worker whose containment check fails (deferred, design D5), an HTTP operation for the view (item 9), and the workers screen (item 33).
