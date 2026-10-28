## Why

[ADR 0008](/docs/decisions/0008-product-ui-and-integration-authority.md) decision 5 admits a worker enrolled with a one-time token automatically once its self-check passes, and decision 6 delivers worker admission checks behind a microkernel port as plugins or adapters, with the port contract defined in G2. G2 built no such port: an enrolled worker is placed on as soon as it is reachable and has declared a common protocol version (`isEligibleForPlacement`, `packages/modules/scheduling/src/ports/placement-workers.ts:35`), and no production code calls the Linux containment self-check `checkLinuxContainment` (`packages/adapters/worker-supervisor/src/linux-self-check.ts:24`). The G2 closure deferred this wiring to G3 item 27 ([ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5; [`harden-worker-linux-self-check-home-layout` design D3](/openspec/changes/archive/2026-10-26-harden-worker-linux-self-check-home-layout/design.md)). The [product UI specification](/openspec/specs/product-ui/spec.md) requires that a worker whose self-check fails is not admitted and that its failed checks are shown on the workers screen.

This is [G3 work plan](/docs/g3-plan.md) item 27, `implement-worker-self-check-admission`, size M-L.

## What Changes

- **Contract first.** A new [worker admission contract](/docs/contracts/worker-admission.md): the worker admission check port, the self-check report, the worker admission states and their transitions, the stored check outcomes, the placement rule, and the workers view read model. The execution wire contracts gain one observation, `worker.self-check.reported`, and one worker-side refusal reason, `worker-self-check-failed`; the capacity reservation contract's `worker-not-eligible` row names a worker that is not admitted; the product ports contract points its "Not in this contract" entry for the worker admission port at the new contract.
- **Worker side.** At every start, after its journal opens and before its broker session, the worker runs every admission check it composes, journals one `worker.self-check.reported` fact with each check's outcome, and, while its latest self-check failed, refuses every new offer with `worker-self-check-failed` and requests no launch authorization. The first check is the existing Linux containment self-check, composed in `apps/worker`. A check is `not-applicable` only when the worker's platform or missing launch command puts it out of scope, decided at the start and journaled with its reason; a check that runs is `passed` or `failed`.
- **Control-plane side.** A new enrolled worker is `awaiting-self-check`. Consuming a report under its own sequence fence makes the worker `admitted` or `self-check-failed` and replaces its stored check outcomes. The control plane counts a `not-applicable` result without a recognised reason, or a missing required check, as `failed`. Placement and new launch grants go only to an `admitted` worker, and a failed report frees the worker's assignments that hold no grant; running executions of a `self-check-failed` worker keep their ownership and reservation until they end. A new journal incarnation returns the worker to `awaiting-self-check`.
- **Workers view.** A Fleet-owned read model port returns each worker with its worker admission state, the time of its last report, and each check's outcome and problems, for the workers screen of G3 item 33. No HTTP operation and no UI: item 9 maps the view onto the OpenAPI document and item 33 builds the screen.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installation-enrollment`: worker admission on the self-check report, its states, the stored check outcomes, and placement and new launch grants only for admitted workers.
- `worker-runtime`: the self-check at every start, its report, and the refusal of offers while the latest self-check failed.
- `product-ports`: the workers view projection of worker admission and check outcomes.
- `resource-admission`: supersession of an ungranted assignment on a worker that is not admitted, freed by the report that makes it `self-check-failed`.
- `worker-journal-adapter`: the `self-check-reported` fact, numbered by its sequence.

## Impact

- New contract `docs/contracts/worker-admission.md`; edits to `docs/contracts/supervisor-identity.md` (section 8, a Linux worker that can spawn executions), `docs/contracts/execution-wire-contracts.md` (section 5), `docs/contracts/capacity-reservation.md` (section 11), `docs/contracts/product-ports.md` (section 8), and `docs/contracts/installation-and-enrollment.md` (section 5, "Placement").
- `@taskelith/contracts`: `execution.asyncapi.json` gains the observation and the refusal reason, with a new `info.version`; the execution protocol version stays 1 (design D7).
- `@taskelith/fleet`: the admission check port, the state types, the not-applicable rule, the admission decision, the fenced `WorkerAdmissions` store port, the workers view port, and in-memory adapters with conformance cases.
- `@taskelith/scheduling`: `WorkerPlacementRecord`, `isEligibleForPlacement`, and `isSupersessionDue` gain the worker admission state; the refusal reason.
- `@taskelith/postgres`: one migration (worker admission column, self-check fence, and a check outcome table) and the adapters.
- `@taskelith/execution` and `@taskelith/worker-journal`: the `self-check-reported` fact, the `SelfCheckResult` type, and its observation identity.
- `apps/worker`: the check composition, the start step, and the offer refusal; `apps/control-plane`: the observation effect and the launch authority's admission check.
- Docker-based acceptance (`make verify-installation`, `make verify-linux-cgroup`) is needed to show the real Linux check passes in the worker image; the developing worker runs it before the handoff and the coordinator at integration (design, "Risks / Trade-offs").
