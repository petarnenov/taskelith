## Context

Item 2 measured JetStream 2.15.1 with nats.js 3.4.0 on Node 24.22.1:
- addressed pull consumers;
- redelivery every `ack_wait`;
- the duplicate window;
- `max_msg_size` and per-subject limits;
- the `MAX_DELIVERIES` and `MSG_TERMINATED` advisories;
- a quarantine copy redriven under a new `Nats-Msg-Id`.

It left these obligations to item 12:
- an inbox prefix per worker;
- `ack_wait` above the commit time, or `working()`;
- a failed publication treated as unconfirmed and retried with the same identity;
- advisories captured into a stream, quarantined from there, and redriven under a new identity;
- backlog bounded per subject and outstanding work by `max_ack_pending`.

Item 8 fixed the subjects, the `Nats-Msg-Id` values, the body identities, and the 1 MiB limit, and assigned the quarantine of malformed messages to item 12. Item 11 provides `PostgresOutboxRelay` (`unpublished`, `markPublished`) and the `Inbox` port, and left the publisher port and any per-subject order to item 12.

## Coordinator decisions (2026-10-25)

The coordinator took the author's recommendations. These are coordinator decisions, not owner decisions.

- **Q1 (a):** the adapter adds the `taskelith.<installationId>.` prefix to the scheduling subjects `workers.<workerId>.commands`. `installationId` is a connection setting until item 13 creates it.
- **Q2 (a):** the transport does not depend on the payload. Receiving consumers validate with `checkMessageSchema` and quarantine invalid messages. Building wire commands from the provisional scheduling payloads is an obligation of item 16.
- **Q3 (a):** quarantine uses JetStream advisories and a quarantine stream with diagnostic headers, and no PostgreSQL table. Redrive is a library operation, with its operator API and authorization in item 16.
- **Q4 (a):** the author's values become a provisional row in the operational targets, verified in G6. The coordinator reports them to the owner.
- **Q5:** the shared server users and the restore-quarantine stop stay with items 13 and 16, without a hook here.

## Goals / Non-Goals

**Goals:**
- publication that loses nothing and duplicates only under the same identity;
- delivery to the addressed worker only;
- acknowledgement only after a commit;
- deduplication for the inbox's lifetime;
- bounded streams and consumers;
- quarantine and redrive.

**Non-Goals:**
- credentials, TLS, and enrollment (item 13);
- logs and lag signals (item 22);
- reconciliation (item 21);
- the worker runtime (item 20);
- building wire commands (item 16);
- the latency and throughput targets (G6 and G7);
- clustering and the 1000-worker topology comparison of D3 (b).

## Decisions

- **One package, no module port.** The adapter offers composable classes, and the applications wire them in items 16 and 20. `OutboxSource` is a structural interface in the adapter, which `PostgresOutboxRelay` satisfies. The wiring in item 16 type-checks the pairing. The adapter imports module types (`OutboxMessage`, `Inbox`) but no other adapter, not even in its tests.
- **Subjects and names.** One installation has four streams: `TASKELITH_<installationId>_COMMANDS`, `_OBSERVATIONS`, `_QUARANTINE`, and `_ADVISORIES`.
  - The consumer of a worker is durable under the `workerId`, filtered to its own subject.
  - An observation reader is a durable consumer under its own name on all worker observation subjects, so readers are independent.
  - A worker connection uses the inbox prefix `_INBOX.<installationId>.<workerId>`.
  - Identifiers may contain `.`, `*`, and `>`, which NATS would read as subject syntax, so the adapter refuses any token outside `[A-Za-z0-9_-]{1,64}`. Item 13 can constrain the identifiers at enrollment.
- **Publication.** The body is the outbox row's payload, and `Nats-Msg-Id` is its event identity, which equals the `commandId` for commands.
  - A row is marked published only after the broker's acknowledgement, and a duplicate acknowledgement counts as one.
  - Any failure (timeout, disconnect, full subject, too large) leaves the row unpublished. The next round sends it again with the same identity.
  - Order: after one row of a subject fails, the later rows of that subject wait, so a worker's commands keep their append order.
  - A failing subject backs off alone, from 5 s to 60 s, while other subjects continue. The loop pauses only after a round that published nothing, and backs off only while the outbox itself is unavailable.
  - Confirmations and inventory requests carry no identity. They are published directly through `JetStreamPublisher` without the header, not through the outbox.
- **Consumers.** One message per pull, in order, through `fetch`; `consume()` is unmeasured, so it is not used. A message fetched in a batch behind a long commit would pass its `ack_wait` and be delivered again, so the consumer fetches one at a time. `max_ack_pending` bounds the broker side.
  - The handler commits the effect with its inbox record and answers.
  - `ok` → `ack`. A failure, or a handler that throws → `nak` with the backoff of the delivery count. The broker quarantines the message after `max_deliver`.
  - `working()` runs every third of `ack_wait` while the handler runs, so a long commit is not delivered to a second handler meanwhile.
  - Validation before the handler: a command against `VersionedCommand`, then, when this build supports the version, against its own schema. A notice against its own schema. An observation or inventory part against its schema.
  - A message that fails is terminated with a short reason. It is not answered with an observation, as the contract requires.
- **Deduplication.** `applyOnce(inbox, consumer, message, apply)` records the body identity through the `Inbox` port and applies the message only when it was new. Pass the inbox of the applying transaction, so both commit together. Notices without identity are applied every time, because the contract makes them idempotent. The broker window is only an optimization.
- **Quarantine.** The advisory stream captures `MAX_DELIVERIES` and `MSG_TERMINATED` for the command and observation streams. The keeper's durable consumer copies each original into `taskelith.<installationId>.quarantine.<source>`.
  - Each copy carries headers with the source stream and subject, the stream sequence, the `Nats-Msg-Id`, the consumer, the delivery count, and the reason: the termination reason, or `max-deliveries`.
  - A copy's own identity includes the consumer, because independent observation readers each terminate the same message.
  - An original that expired before the capture is recorded without a body and cannot be redriven.
  - Each advisory is settled on its own. One that is not an advisory of a transport stream is terminated; one whose original cannot be read, or whose copy fails, is redelivered.
  - Redrive publishes the body on the original subject under `<root>.redrive.<n+1>` and removes the record. `<root>` and `n` come from the quarantined identity, so a message quarantined again after a redrive gets the next number. No state is needed.
- **Bounds.** `TRANSPORT_LIMITS` holds the provisional values. Every function takes them as an optional argument, so tests run with timers of milliseconds and with smaller streams for the tmpfs test server.
  - All streams use limits retention with `discard: new`. A full stream rejects to the publisher, whose message stays in the outbox, or in the worker journal for observations.
  - The quarantine stream has no per-message limit, so a 1 MiB body fits beside its headers.
- **Connection status.** The adapter does not watch the status stream. A denied or lost pull ends the pull and the consumer retries with backoff, so nothing is lost; making those failures visible is item 22's observability. Callers can read `connection.status()`.
- **Reconnection.** The client reconnects without limit. A publication during an outage fails as `unavailable` and is retried by its caller. A consumer resumes after the reconnect and receives what was published meanwhile.

## Risks / Trade-offs

- **Payload limit and headers:** the broker's 1 MiB `max_payload` counts headers. A body of exactly 1 MiB with `Nats-Msg-Id` would be refused by the server, although the contract allows the body. The largest inventory part is far below the limit (item 8's test).
- **Reserved space:** each stream reserves `max_bytes` of file storage, so one installation reserves 40 GiB. G6 sizes the quarantine and advisory streams.
- **A permanently failing row blocks its subject:** a row whose subject cannot be mapped, or whose payload exceeds the limit, keeps its worker's later commands waiting. That is the order guarantee at work. Item 16 builds only valid commands, and item 22 adds the outbox lag signal that makes such a row visible.
- **A large quarantine copy:** the original's body plus the diagnostic headers can exceed the server's `max_payload` for a body near 1 MiB. That copy fails, and its advisory is redelivered with backoff until the original expires.
- **Head-of-line in a batch:** a round reads the oldest 100 rows. More than 100 waiting rows of backed-off subjects keep the others out of the round until they publish.
- **Redrive after a lost removal:** if removing the record fails after the publication, a second redrive publishes under the same `.redrive.<n>`. After the broker window that is a second delivery, which the receiver's inbox stops.
- **Not measured:** a silent partition (a black hole, detected only by the client's ping interval), a server restart, and `consume()`. Item 24 covers the partition scenarios.
