## Why

[G2 work plan](/docs/g2-plan.md) item 20 builds the worker application, split by the coordinator into changes; this is 20e. The control plane already consumes `worker.admission-pressure.changed` and pressure refusals (21b), but the worker never reports pressure: it accepts offers and requests launch authorizations below the disk floor and with an unbounded journal backlog. The [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 8 and the [worker journal contract](/docs/contracts/worker-journal.md) sections 6 and 7 require the worker-side limits.

## What Changes

- **Admission pressure.** The worker measures its disk floor and journal backlog at start, every 5 seconds, before it accepts an offer, and before each launch authorization request, and journals `worker.admission-pressure.changed` once after each start and on every change of causes; an empty list clears it.
- **Pressure refusal.** An offer that fits the slots, the ceiling, the controls, and the capacity is refused under pressure with the retryable `worker-admission-pressure` and its `pressureCauses`.
- **Launches wait.** Under pressure no new W2 is journaled and no launch authorization request is sent; each launch waits, keeping its intent, until the pressure clears.
- **Disk floor.** Below 5 GiB or 10% free on the data root's volume, whichever is larger, the worker reports `disk-floor` and empties only the regular files under `worker/logs/`.
- **Backlog limit.** Above 10,000 unconfirmed outbox entries or 256 MiB the worker reports `journal-backlog` and keeps publishing.
- **Unmeasurable limits** count as exceeded and are reported as `unmeasurable-limit`.
- No contract, AsyncAPI, OpenAPI, or journal format change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: the pressure refusal, pressure reporting, the disk floor, the backlog limit, unmeasurable limits, and launches that wait under pressure.
- `worker-journal-adapter`: the pressure fact, the outbox backlog, the volume space, and the log truncation.

## Impact

- `apps/worker`: a new `AdmissionPressure` with its watch loop; the intake and the launch orchestrator take an `AdmissionCheck`; the worker start builds and runs it; the observation mapping of pressure refusals and changes.
- `@taskelith/execution`: the pressure causes, the `worker-admission-pressure` refusal with causes, the `admission-pressure-changed` fact, and the journal port's `recordAdmissionPressure` and `backlog`.
- `@taskelith/worker-journal`: the two journal methods, `readVolumeSpace`, and `truncateBufferedLogs`.
- `apps/control-plane`: its worker integration test expects the pressure observation and fixes the free space.
- No new dependency.
