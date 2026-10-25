## Why

G2 work item 16 ([docs/g2-plan.md](../../../docs/g2-plan.md)) serves the exit evidence "Submit an admitted task", architecture section 9 step 1, and R18 for the API entry point. Before this change the control plane had no running service, HTTP adapter, or use case that binds a task to its admission.

Earlier items left four obligations here:
- item 12: real wire commands from the scheduling outbox, and the redrive API with its authorization;
- item 13: the HTTP enrollment operation, the restore-quarantine stop of command publication, and the periodic expiry of grace windows;
- item 18: placement only on a worker with a common protocol version;
- item 22: the wiring of the observability ports.

## What Changes

- **Contracts.**
  - `sdlc.openapi.json` 0.3.0: `operatorToken` on every operation, with 401, and 422 on `createRun` for an unknown workflow or digest.
  - `execution.openapi.json` 0.2.0: `listQuarantine` and `redriveQuarantined` with `operatorToken`.
  - `sdlc.asyncapi.json` 0.3.0: the address `taskelith.{installationId}.sdlc.events` of the SDLC events. `@asyncapi/diff` classifies the new channel parameter as breaking, so the version moves to 0.3.0 rather than a patch.
- **Scheduling.**
  - The capacity transaction reads admissions.
  - `InstallationGuard` reads the recovery epoch.
  - A placement record carries the worker's protocol version, and a worker without one is not eligible.
  - The outbox rows are the wire commands `execution.assignment.offer`, `execution.assignment.end`, and `execution.cancellation.request`, with `CommandMetadata` and the SDLC binding.
- **Fleet.** Enrollment records the protocol version the worker shares with the control plane.
- **SDLC.** The `RunCatalog` port, with an in-memory adapter and a conformance suite: a run's project and creation time, and each admission's run.
- **PostgreSQL.**
  - A migration adds `workflow_runs.project_id` and `created_at`, `admissions.run_id`, and `workers.protocol_version`.
  - `PostgresRunCatalog`, the recovery epoch, and the protocol version on the placement record.
- **NATS.** The outbox subject `sdlc.events` maps to the installation's SDLC events subject, which has its own stream.
- **Control plane** (`apps/control-plane`):
  - `RunService.createRun`, against a provisional registry of known workflows that checks `binding.workflowDigest`;
  - `TaskService.submitTask`, which admits, uses, and opens the task, writes its root lineage link and run binding, and appends `sdlc.admission.used`, all in one transaction, with an admission identity derived from the run and the task;
  - `readAdmission` and `readTaskResult`;
  - an HTTP adapter over `node:http` with contract validation, bearer authentication, correlation, and redacted failures and logs;
  - a composition root that starts the API, the quarantine-guarded outbox publisher, the quarantine keeper, the grace-window sweep, the observability sampler, and the lag monitor under one signal;
  - a service entry `main.ts`.
- **Documents.** Provisional loop intervals in the operational targets, and the new document versions in the execution wire contracts with the note on plain HTTP in G2.

## Capabilities

### New Capabilities
- `control-plane-api`: the control-plane service, its HTTP operations, the submit-task use case, and its background loops.

### Modified Capabilities

## Impact

The published `taskelith` package and CLI are unchanged, and no dependency is added. The SDLC HTTP and event documents and the execution HTTP document take new versions. Scheduling's outbox payloads change from provisional to the wire commands.

The coordinator decided on 2026-10-25 to leave three things to other items:
- the placement loop goes to item 21 (Q1);
- worker authentication goes to item 17 (Q6);
- `requestDelegation` over HTTP goes to items 21 and 20 (Q7).
