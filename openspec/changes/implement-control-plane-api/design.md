## Context

Architecture section 9 step 1: "Authorize the user request; bind the task to its SDLC run/stage and create the task and outbox entry atomically." The item 8 contracts define the HTTP operations and the wire commands. Item 11 provides the transaction, the outbox, and the relay, and item 12 the publisher and the quarantine. Item 13 provides the operator credential, enrollment, and the installation check. Item 18 provides placement and its outbox commands, and item 22 provides the observability ports.

## Coordinator decisions (2026-10-25)

These are coordinator decisions; the coordinator reports Q1, Q4, and Q11 to the owner.

- **Q1 (b): the placement loop goes to item 21.** It opens the first attempt, picks a worker, and calls `ResourceAdmissionService`. No G2 row owned it; the G2 exit evidence and item 24 need it.
- **Q2 (a): the SDLC events subject.** A minimal subject `taskelith.<installationId>.sdlc.events` for `sdlc.admission.used`, with its own stream and a publisher mapping, and an address in `sdlc.asyncapi.json`.
  - The coordinator took it for non-breaking, but `make contract-compatibility` classifies the new channel parameter as breaking. So the document moves to 0.3.0, as the semantic versioning rule of the check requires.
- **Q3 (a): Scheduling builds the wire commands.** It gets an admissions read port, the recovery epoch on `InstallationGuard`, and the protocol version on the placement record, and builds the payloads in `capacity-commands.ts`. Tests validate them with `checkMessageSchema`. This closes item 18's obligation "placement only on a worker with a common protocol version".
- **Q4: operator credential on the SDLC operations.** `operatorToken` on them, in `sdlc.openapi.json` 0.3.0.
- **Q5: redrive API.** `GET /quarantine` and `POST /quarantine/{sequence}/redrive` with `operatorToken`, in `execution.openapi.json` 0.2.0.
- **Q6: worker authentication goes to item 17**, with a lookup by hash in `FleetRegistry`.
- **Q7: `requestDelegation` over HTTP** goes to item 21 for the control-plane side, and to item 20 for the worker side.
- **Q8 (b): known workflows.** A fixed registry in the composition root that checks `binding.workflowDigest`. It is provisional for G2, since no project resolves a definition before G3. The service reads it from the JSON file `TASKELITH_WORKFLOWS`; without one, no run is accepted.
- **Q9: persistence.** The migration, the root `task_lineage` link, and an admission identity derived from the run and the task. A repeat of the same submission returns the stored one, and a conflicting repeat is 409.
- **Q10: loop intervals.** The grace-window sweep every 60 s and the sampler every 15 s, provisional in the operational targets.
- **Q11: plain HTTP in G2.** The server binds `127.0.0.1` by default. TLS is G3 item 26 (D11). `execution-wire-contracts.md` called the HTTP API "over HTTPS"; its document table now records the G2 deferral.

## Goals / Non-Goals

**Goals:**
- the composition root and service entry;
- the HTTP operations `createRun`, `submitTask`, `readAdmission`, `readTaskResult`, `enrollWorker`, `listQuarantine`, and `redriveQuarantined`, with runtime validation and the operator credential;
- the atomic submit-task use case;
- the wire commands;
- the quarantine guard on publication;
- the grace-window sweep;
- the observability wiring.

**Non-Goals:**
- launch authority and worker authentication (item 17);
- the evidence store (item 19), so `readTaskResult` returns `evidence: []`;
- the placement loop and observation consumers (item 21);
- `requestDelegation` (items 20 and 21);
- `make` targets and the image (item 23);
- TLS (G3 item 26).

## Decisions

- **Placement of the code.** Each part lives where it belongs; no new package.
  - The use cases span the SDLC, execution, and scheduling modules in one transaction, so they live in the control-plane application layer, behind the `ControlPlaneStore` port. `PostgresDatabase` satisfies that port structurally.
  - The HTTP adapter lives in `apps/control-plane/src/api/`, built on `node:http` and `checkHttpSchema`, because the app is its only consumer. A later item can extract it.
- **HTTP.**
  - A route table names each operation, its method and path pattern, its security scheme, its body schema, and how its failure codes map to the statuses the document declares.
  - Bearer authentication runs before the body is read. The body is limited to 1 MiB, parsed, and validated against its schema; the first violations go into a 400.
  - A caller's `x-correlation-id` is kept when it is a valid identifier, otherwise one is made. It is echoed in the response and passed to the use case.
  - Failures leave with secrets redacted (`redactFailure`), and the log line per request carries only the operation, the status, and the duration.
- **Submit task.**
  - Inside one SERIALIZABLE transaction, in this order:
    1. read the run and its envelope (404 without them);
    2. answer a repeat by its derived admission;
    3. admit: planning against the run, implementation against the run and its gates;
    4. use the admission at ownership generation 1;
    5. open the task;
    6. store the admission, bind it to the run, add the task and its root lineage link;
    7. append `sdlc.admission.used`.
  - The event's producer is the admission and its sequence the admission's generation, which the SDLC event metadata requires.
  - The admission identity is `a` and the SHA-256 of the run and task identities, which always fits the 128 characters of an identifier.
- **Wire commands.** `appendWorkerCommand` reads the task's admission, the worker's protocol version, and the recovery epoch inside the capacity transaction. It writes the outbox row whose payload is the wire command itself, since the publisher sends a row's payload as the body. A command without a protocol version or an epoch fails with `precondition-failed`, so the transaction writes nothing.
- **Protocol version.** Enrollment computes the version the worker and the control plane share and stores it in `workers.protocol_version`. Scheduling stays free of the contracts package, and the eligibility rule requires a version.
- **Quarantine guard.** `QuarantineGuardedOutbox` reads the installation's quarantine flag and the unpublished rows in one transaction. It returns no row while quarantined, and also without an installation record, which reads as quarantined. It holds the SDLC events as well as the commands.
- **Composition.**
  - It starts with one `Logger` (JSON lines on stdout) and one `InMemoryMetrics`, passed to the database and the publisher.
  - It verifies the installation, connects to NATS as a control-plane user of the installation account, and ensures the streams and the advisory consumer.
  - It then starts the API and five loops under one abort signal: the publisher, the quarantine keeper, the grace-window sweep, the sampler, and the lag monitor.
  - `stop` closes the server, waits for the loops, and closes every connection.

## Risks / Trade-offs

- **Placement is not wired.** Until item 21 adds the loop, a submitted task waits with no attempt. The G2 exit evidence needs item 21.
- **One control-plane instance.** The loops assume one instance, as G2 runs; several instances would each sweep and publish.
- **Workflow registry.** It is a configured file, not a framework resolution. A wrong digest in it would admit runs of an unverified definition. Projects and working copies replace it in G3.
- **What a repeat compares.** A repeat is compared by kind, stage, work item, and, for a planning task, its artifacts. An implementation task's artifacts come from its gates, so a repeat after a gate changed returns the admission stored first.
- **Plain HTTP.** The operator token travels in clear text on any interface other than loopback until G3 item 26.
