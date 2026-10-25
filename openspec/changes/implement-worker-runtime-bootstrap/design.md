## Context

Item 13 enrolls a worker on the control plane and defines its credentials. Item 14 owns the `worker/` subtree, its control records, and the start checks. Item 12 provides `connectWorkerTransport`, and item 17 provides the worker's control-plane client package. Before this change no code ran on a worker.

## Coordinator decisions (2026-10-25)

These are coordinator decisions, taken as the worker recommended unless stated.

- **Split.** Item 20 is five changes, merged and archived in order: 20a `implement-worker-runtime-bootstrap`, 20b command intake, 20c launch orchestration, 20d start reconciliation and reachability, 20e operational limits. Claude Fable reviews each, with a cap of three passes per change.
- **Q1 (a): heartbeat.** A worker heartbeat on its own subject outside the journal sequence, with interval 10 s and control-plane lost-contact timeout 30 s as provisional operational targets. It arrives in 20d with its contract change. It is recorded here only because it shapes the split.
- **Q2 (a).** The worker's HTTP clients extend `@taskelith/worker-control-plane-client`.
- **Q3 (a).** The first start reads a one-time token from the worker's configuration. The published CLI does not change.
- **Q4 (b).** The `publishEvidence` client belongs to 20c.
- **Q5 (a).** Credentials are files under `worker/credentials/` at mode `0600`, and `worker/identity` holds their references and the generation.

## Goals / Non-Goals

**Goals:**
- the worker's settings and composition root;
- enrollment on the first start, and the credential storage of item 13's obligation;
- the start sequence up to a broker connection, with outbound connections only.

**Non-Goals:**
- command intake, the outbox publication loop, and inventory (20b);
- launches, the authorization retry loop, and evidence publication (20c);
- start reconciliation, reachability, the heartbeat, and offline mode (20d);
- operational limits and `requestDelegation` (20e);
- storing a rotated credential generation on the worker.

## Decisions

### D1: enroll first, then create the root

The `EnrollmentRequest` names the `journalId`, and the journal's binding needs the `installationId` and `workerId` that only the answer gives. So the worker draws the `journalId`, enrolls, and then creates the root in the order journal, credentials, identity. A failure before the identity removes the partial subtree, as `enrollWorkerRoot` already did.

- **Alternative:** a journal without a binding, bound after the answer. It would add a journal state that every start check must handle, for no gain: a lost answer loses the token either way.

### D2: the token is read only without an identity

`openWorkerRoot` decides: only its `not-enrolled` reason leads to enrollment. Every other failure, such as a journal fault, a lost journal, or a locked root, is returned unchanged, so a configured token can never re-enroll a worker whose journal is lost.

### D3: identity format stays 1

No worker was ever enrolled before this change, so no identity of the old shape exists. The credential fields are required in format 1, and an identity without them is `corrupt`.

### D4: references, not fixed names

The identity stores the files' references, as the worker journal contract requires. A reference must name a file directly under `worker/credentials/`, so a changed identity cannot point the worker at another file. The generation in each file name leaves room for rotation.

### D5: the installation identifier is checked before the root exists

It becomes a NATS subject token. The worker checks it with the fleet's token rule before it creates the root, so a malformed answer cannot leave an enrolled root that can never connect.

### D6: a failed first connection fails the start

`connectWorkerTransport` reconnects without limit once connected, but its first connection fails at once. In 20a a failed first connection fails the start, the root is released, and a process supervisor restarts the worker. The offline mode of 20d replaces this.

### D7: the declared capacity

The slots default to 2 (operational targets). CPU defaults to the available parallelism, and memory to the host's memory less the daemon's 512 MiB ceiling. Each can be configured. No hard control is declared until the supervisor enforces one, which avoids promising a control the worker cannot keep.

## Risks / Trade-offs

- **Lost enrollment answer.** The token is spent and the created worker row never connects. The contract page says that the operator issues a new token and revokes the row.
- **Secrets in memory.** The credentials are read at start and kept for the connection. They never reach a log, because the entry redacts every failure.
