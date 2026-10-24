## Context

D3 (a) puts all worker commands in one stream on worker-addressed subjects, each subject read by one durable pull consumer per worker, with observation streams beside it. Architecture section 9 requires centrally provisioned permissions, bounded retention, payload, and outstanding acknowledgements, and a quarantine with controlled redrive. Item 9 provides one NATS 2.15.1 container per `make verify` run, reachable through `TASKELITH_NATS_URL`.

## Goals / Non-Goals

**Goals:**
- One integration test per measured behavior, so that the record in `docs/g2-jetstream-spike.md` is reproducible by `make verify`.
- The compatibility of nats.js 3.4.0 with nats-server 2.15.1 on Node 24.22.1, for the APIs the spike exercises.

**Non-Goals:**
- An adapter, outbox, or any product code (item 12).
- JWT and NKey issuance and revocation without a reload under D9 (a) (item 13).
- Throughput, clustering, replicas, TLS, server restarts, and the 1000-worker comparison of D3 (b) (G7).

## Decisions

- **Placement.** The spike lives in `apps/control-plane/test/` beside item 9's integration helpers, and the clients are development dependencies of `@taskelith/control-plane`, because the test reuses `integrationEndpoints()` and no workspace imports the clients yet.
- **Names.** The spike uses fixed stream, consumer, and subject names under `SPIKE_` and `spike.`, because static permissions name exact subjects; each `make verify` run has its own Compose project, and each test recreates the streams it uses.
- **Permissions (option A).** Static users `worker-a` and `worker-b` in one account with publish and subscribe allow lists, and `no_auth_user: integration` for every client without credentials. The allow lists are the subject pattern that item 13 encodes in user JWTs; static passwords are test fixtures only.
- **Quarantine.** A stream captures the server's `MAX_DELIVERIES` and `MSG_TERMINATED` advisories for the command stream, and the test copies the original message by its stream sequence into a quarantine stream and redrives it. This measures the server primitives; the workflow itself is item 12.
- **Timing.** Short `ack_wait`, `duplicate_window`, and `max_age` of one second keep the suite near 15 seconds; assertions allow for scheduling delay with lower bounds only.

## Risks / Trade-offs

- Timing assertions could be flaky on a loaded host → only lower bounds are asserted and the measured value is reported as a test diagnostic.
- The shared server configuration now carries spike users → they are confined to `SPIKE_` and `spike.` names, and item 12 or 13 replaces them.
- Behavior is measured on one host architecture and one server → the record states the environment and leaves the others open.
