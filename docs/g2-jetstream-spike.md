# G2 JetStream transport spike

Date: 2026-10-25. Status: measurements for item 2 of the [G2 work plan](g2-plan.md) (`spike-jetstream-transport`), the protocol spike on which [architecture section 9](architecture.md#9-messaging-and-execution-protocol) makes the broker choice conditional. It confirms decision D3 (a) at the measured scale: one command stream on worker-addressed subjects, one durable pull consumer per worker, and observation streams beside it. Every behavior below marked as measured is asserted by `apps/control-plane/test/jetstream-spike.integration.test.ts`, which `make verify` runs against the pinned container.

## Environment and versions

| Component | Version |
| --- | --- |
| Server | nats-server 2.15.1, image `nats:2.15.1-alpine@sha256:7ae34c25dfd6fe2e01c6483eabef20d796690fdcac6c4d94ca780a6cf9877fde` ([item 1](g2-infrastructure.md#2-nats-server-and-image-d2)), started by `infra/services/compose.yaml` with `infra/services/nats-server.conf`; JetStream file storage on `tmpfs`; JetStream API level 5 |
| Clients | `@nats-io/transport-node`, `@nats-io/jetstream`, and `@nats-io/nats-core` 3.4.0, with `@nats-io/nkeys` 2.0.3 and `@nats-io/nuid` 3.0.0 as their dependencies |
| Runtime | Node 24.22.1 on macOS (Darwin 25.6.0, x86_64); Docker Engine 29.5.2, `linux/amd64` |

**Compatibility (item 1's open risk).** The pinned nats.js 3.4.0 sources neither state support for nats-server 2.15 nor show a CI result for 2.15 on Node 24 ([item 1](g2-infrastructure.md#3-nats-javascript-client)). Every API the spike uses works against 2.15.1 on Node 24.22.1: connection with user and password and a custom `inboxPrefix`, stream and consumer management, `fetch` and `next` on pull consumers, `ack`, `ackAck`, `nak` with a delay, `term` with a reason, `getMessage`, publication with `msgID`, and the connection's status stream. The `types` field that names `./lib/mod.d.js` in `@nats-io/jetstream` and `@nats-io/nats-core` does not matter: TypeScript resolves the declarations through `exports` under the repository's settings, as `make verify`'s type check shows. The client refuses a pull expiry below 1000 ms (`'expires' must be at least 1000ms`). Not covered: `consume()`, ordered and push consumers, key-value and object stores, consumer pause and priority groups, reconnection, and TLS.

## Measured behavior

The command stream `SPIKE_CMD` takes the subjects `spike.cmd.*`, and each worker has a durable pull consumer named after it, filtered on `spike.cmd.<worker>`, with explicit acknowledgement.

| Topic | Configuration | Measured |
| --- | --- | --- |
| Addressed consumers | Consumers `worker-a` and `worker-b` | Each consumer receives only the commands on its own subject, in publication order. |
| Redelivery after `ack_wait` | `ack_wait` 1 s | An unacknowledged command returns 1001–1002 ms and 2004–2005 ms after its first delivery, with delivery counts 2 and 3 and the redelivered flag: it returns every `ack_wait` until it is acknowledged or `max_deliver` is reached. A command acknowledged with `ackAck()`, which resolves to `true`, does not return within the 2.6 s window. |
| Plain acknowledgement | `ack()` and a flush | The consumer has nothing pending, and its acknowledgement floor is the command's stream sequence. |
| Negative acknowledgement | `nak(700)` | The command returns 702–703 ms after the negative acknowledgement, with delivery count 2. |
| Outstanding acknowledgements | `max_ack_pending` 2, five commands | A fetch of five returns two; the consumer then reports 2 pending acknowledgements and 3 pending messages. |
| Payload | Server `max_payload` | The server announces 1,048,576 bytes (1 MiB, the [operational target](operational-targets.md)); the client rejects a larger payload before sending (`'payload' max_payload size exceeded`). |
| Stream message size | `max_msg_size` 1024 | The stream stores 900 bytes and rejects 1025 bytes with `JetStreamApiError` code 10054 (`message size exceeds maximum allowed`). |
| Deduplication window | `duplicate_window` 1 s | A repeat with the same `msgID` inside the window returns `duplicate: true` and the original sequence; after the window the same `msgID` is stored again under the next sequence. |
| Retention: count and bytes | `discard: new`, `max_msgs` 2 or `max_bytes` 2048 | The publication over the limit is rejected (`maximum messages exceeded`, `maximum bytes exceeded`); the publisher sees the error. |
| Retention: per subject | `max_msgs_per_subject` 2, `discard_new_per_subject` | The third command for `worker-a` is rejected (`maximum messages per subject exceeded`) while `worker-b` still publishes. |
| Retention: old | `discard: old`, `max_msgs` 2 | The oldest message is dropped (first sequence 2, last 3). |
| Retention: age | `max_age` 1 s | The message is gone 1251–1261 ms after its publication, polled every 50 ms. |
| Termination | `term('schema-invalid')` | The server publishes `$JS.EVENT.ADVISORY.CONSUMER.MSG_TERMINATED.SPIKE_CMD.worker-a` with the stream sequence, one delivery, and the reason; the command is not delivered again. |
| Delivery limit | `max_deliver` 3, `nak()` on every delivery | After the third delivery the server publishes `…MAX_DELIVERIES.SPIKE_CMD.worker-a` with the stream sequence and 3 deliveries; the consumer then has nothing pending, and the command stays in the stream under its retention limits. |
| Quarantine capture | Stream `SPIKE_ADVISORIES` on both advisory subjects | Advisories are plain NATS messages: a termination advisory published before the stream existed is not recorded. Once the stream exists it stores both kinds, so a quarantine process can read them later and copy the original by its stream sequence (`getMessage`) into `SPIKE_QUARANTINE`, with the original stream sequence, `Nats-Msg-Id`, and advisory type as headers. |
| Redrive | From the quarantine record, original `msgID`, then a new one | The record holds the original payload and headers. Inside the deduplication window, a redrive with the original `msgID` is dropped as a duplicate; under a new `msgID` the command is delivered again with delivery count 1. |

### Per-worker permissions

By the coordinator's decision of 2026-10-25 (option A), the permissions are measured with static users in `infra/services/nats-server.conf`, which needs no new package. Each worker user may publish only to `$JS.API.CONSUMER.INFO.SPIKE_CMD.<worker>`, `$JS.API.CONSUMER.MSG.NEXT.SPIKE_CMD.<worker>`, `$JS.ACK.SPIKE_CMD.<worker>.>`, and `spike.obs.<worker>`, and may subscribe only to `_INBOX.<worker>.>`. Clients without credentials connect as `integration` through `no_auth_user` and keep full access to the account.

| Attempt by worker A | Measured |
| --- | --- |
| Pull, acknowledge, and look up its own consumer | Allowed. |
| Look up B's consumer | The request fails with `Permissions Violation for Publish to "$JS.API.CONSUMER.INFO.SPIKE_CMD.worker-b"`. |
| Pull from B's consumer | The server reports the violation only on the connection's status stream; the pull itself fails on the client after its expiry with `heartbeats missed`. B's command stays pending. |
| Subscribe to `spike.cmd.worker-b` or `_INBOX.worker-b.>` | Denied, reported on the status stream. |
| Publish an observation on `spike.obs.worker-b` | The publication fails with a permissions violation; the observation stream holds only A's subject. |
| Create a consumer on B's subject | Denied. |
| Publish its own observation without its inbox prefix | The reply subscription is denied, so the client reports a failure, **but the observation is stored**. |

## Consequences for later items

- **Item 8 (wire contracts).** The broker stream sequence is not the per-producer sequence: a repeat after the deduplication window or a redrive gets a new stream sequence. Observations carry `workerId`, `journalId`, the producer sequence, and `observationId` in the message ([worker journal](contracts/worker-journal.md#6-local-outbox-of-observations)), and commands carry `commandId` in the message, not only as `Nats-Msg-Id`, which a redrive must change. The cumulative confirmation has no broker counterpart: an acknowledgement is per message, and a lost acknowledgement causes a redelivery, so the confirmation is an application message on a subject that only the addressed worker may read. The inventory report must fit the 1 MiB payload bound, or be paged.
- **Item 12 (NATS adapter).** Set `ack_wait` above the worker's commit-before-acknowledgement time, or extend it with `working()`, because each expiry redelivers the command to the same worker. Give each worker its own inbox prefix and treat a failed publication as unconfirmed, retrying with the same identity, because a publication can be stored while the client reports a failure. Watch the connection's status stream, because a denied pull surfaces only as missed heartbeats. Capture the `MAX_DELIVERIES` and `MSG_TERMINATED` advisories in a stream, quarantine from them, and redrive under a new `Nats-Msg-Id`. Bound each worker's backlog with `max_msgs_per_subject` and `discard_new_per_subject`, and outstanding work with `max_ack_pending`; a pull expiry is at least 1000 ms.
- **Item 13 (enrollment and broker credentials).** The allow lists above are the per-worker permissions to encode in user JWTs under D9 (a). Issuance of operator, account, and user JWTs with NKeys, and revocation without a server reload, were **not measured**; item 13 measures them, and needs owner approval for `@nats-io/jwt` or another issuing tool.
- **Item 21 (execution reconciliation).** Broker deduplication ends with the window, so the control plane deduplicates by `observationId` and checks the sequence per `(workerId, journalId)` independently of stream sequences. A quarantined observation stays retained only until `max_age`, so reconciliation must not depend on a redrive.

## Not measured

- Decentralized authentication under D9 (a): JWT and NKey issuance and revocation without a reload (item 13).
- Server restart and recovery of streams and consumers, clustering and replicas, TLS, and reconnection.
- Throughput, latency under load, and the 1000-worker comparison with a routing layer, D3 (b) (G7).
- Work-queue and interest retention, per-message TTL, and `Nats-Expected-Last-Subject-Sequence`.
- The 7-day and 10 GiB production limits themselves; the spike measures the mechanisms with small limits.

## Reproduction

`make verify` runs the spike with the other integration tests against its own services. For a single run, `make services-up`, export the printed URLs, and run `node --experimental-strip-types --test apps/control-plane/test/jetstream-spike.integration.test.ts`; the measured redelivery delays appear as test diagnostics.
