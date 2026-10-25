# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 12. The coordinating session (Niki) assigned it to the worker session Pepi, with Claude Fable 5.1 (medium) as the reviewer by rotation. Base revision: `61946e7` on `dev`, with items 2, 8, 9, 10, and 11 merged and archived.

Scope: the row of item 12, the NATS adapter. Out of scope:
- enrollment, credentials, and TLS (item 13);
- observability (item 22);
- reconciliation (item 21).

The coordinator's decisions Q1 to Q5 of 2026-10-25 are recorded in the design. They are coordinator decisions; the coordinator reports the provisional bounds to the owner.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker. The integration services are those of `infra/services/compose.yaml`: nats 2.15.1, Toxiproxy 2.13.0, and PostgreSQL 18.6.
- Evidence check: the change adds only repository-relative links and no external one.
- Dependencies: the three `@nats-io` packages at 3.4.0, already installed by item 2 and approved by the coordinator for this item, become runtime dependencies of `@taskelith/nats`. No new package enters the lockfile.

## Author self-check

Recorded before pass 1.

- Every topic of the plan row is covered:
  - the outbox publisher with the same identity until the broker acknowledges;
  - addressed worker consumers;
  - observation consumers;
  - receiver deduplication;
  - quarantine and redrive;
  - the bounds.
- Against item 2's obligations:
  - an inbox prefix per worker;
  - `working()` while a commit runs;
  - unconfirmed publications retried with the same identity;
  - advisories captured into a stream;
  - redrive under a new `Nats-Msg-Id`;
  - `max_msgs_per_subject` with `discard_new_per_subject`, and `max_ack_pending`.
- Against item 8's contract:
  - the subjects;
  - `Nats-Msg-Id` from `commandId`, `observationId`, or `reportId.part`, and none for confirmations;
  - body identities for deduplication;
  - malformed messages quarantined, not answered;
  - the stable part of an unsupported protocol version passed to the worker.

  A test checks that the schema tables cover every message of both channels.
- Against ADR 0004:
  - hexagonal: the adapter imports module types only, and modules may not import `@nats-io` (boundary check);
  - Docker: integration tests run against the Compose services in `make verify`;
  - coverage: above 75%.
- Item 10's harness:
  - a crash point (`OutboxPublish.before`, SIGKILL) between the broker acknowledgement and the outbox mark;
  - a Toxiproxy disconnect for publication and for a consumer.
- Obligations for later items:
  - item 16 builds the wire commands from the provisional scheduling outbox payloads (coordinator decision Q2), and adds the operator API and authorization for redrive (Q3);
  - item 13 provides credentials, TLS, `installationId`, and the product server users;
  - items 13 or 16 stop command publication under restore quarantine (Q5).
- Open points: see the design's risks. They are the header share of the 1 MiB payload limit, the 40 GiB reserved per installation, a permanently failing row blocking its subject, and the unmeasured silent partition, server restart, and `consume()`.

## Checks

`make verify` passed in the worktree before pass 1:

- (to be recorded)

## Independent review

(to be recorded)

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
