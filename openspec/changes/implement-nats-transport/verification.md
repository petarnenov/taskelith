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
  - coverage: see the checks below.
- Item 10's harness:
  - a crash point (`OutboxPublish.before`, SIGKILL) between the broker acknowledgement and the outbox mark;
  - a Toxiproxy disconnect for publication and for a consumer.
- Obligations for later items:
  - item 20 handles every delivered command whatever arrived before it, because a failed commit lets later commands of the same worker pass (pass-2 finding 1);
  - item 16 builds the wire commands from the provisional scheduling outbox payloads (coordinator decision Q2), and adds the operator API and authorization for redrive (Q3);
  - item 13 provides credentials, TLS, `installationId`, and the product server users;
  - items 13 or 16 stop command publication under restore quarantine (Q5).
- Open points: see the design's risks. They are the header share of the 1 MiB payload limit, the 40 GiB reserved per installation, a permanently failing row blocking its subject, and the unmeasured silent partition, server restart, and `consume()`.

## Checks

`make verify` ran in the worktree before pass 1 and after each round of fixes:

- At `44e57b1`, before pass 1, with the package's files still untracked: 743 tests passed, 0 failed; coverage 99.18% lines, 92.93% branches, 98.97% functions. The comment check reads only tracked files, so it missed five three-line comments in the new package (pass-1 finding H2), and the pre-push hook would have failed. That run is therefore not valid for `44e57b1`.
- At `beb3b94`, after the pass-1 fixes, with every file tracked: 745 tests passed, 0 failed; coverage 99.18% lines, 92.95% branches, 98.97% functions. The comment, boundary, coverage-scope, dependency-inventory, and OpenSpec checks pass.
- `npm run openspec -- validate implement-nats-transport --strict` passed at each of these revisions.

## Independent review

Assigned reviewer: Claude Code with `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. The prompt named AGENTS.md, ADR 0004, the governance review process, plan row 12, architecture section 9, the JetStream spike, the execution wire contracts, the worker journal W1, item 11's outbox and inbox, and the operational targets. The prompt and log are kept outside the worktree.

- **Pass 1 — session `5809d1f1-d2e3-4a83-81f1-93701f58311b`,** reviewed `git diff 61946e7 44e57b1`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `2c9a1b29…a14d`, equal. The reviewer ran the comment check and the unit tests, and judged the integration tests by reading. Findings: 0 Critical, 2 High, 4 Medium, 6 Low, all resolved:
  1. High: the consumer fetched up to 4 messages and extended `ack_wait` only for the one it handled, so the others could be redelivered during a long commit, out of order. It now fetches one message per pull. An integration test commits the first of two commands over twice `ack_wait`, and the second is delivered once.
  2. High: five comments of the new package had three lines. The comment check reads only tracked files, so the run before pass 1 missed them, and this record wrongly called that run passed. The comments are shortened, and the checks above say which run was valid.
  3. Medium: one permanently failing row made the whole publisher loop back off up to 60 s. Each subject now backs off alone, and the loop pauses only after a round that published nothing. The unit test shows another subject publishing while one backs off.
  4. Medium: one advisory that threw stopped the capture, and it returned forever. Each advisory is now settled on its own: one that is not an advisory of a transport stream is terminated, and one whose original cannot be read is redelivered. An integration test terminates two such advisories and still captures a real one. The design records that a copy of a body near 1 MiB with headers can exceed `max_payload`.
  5. Medium: a handler that threw left the message unsettled. A throw now counts as a failed commit and is redelivered; an integration test covers it.
  6. Medium: the spike asks item 12 to watch the status stream. The design now records that a lost or denied pull ends the pull, which the consumer retries, and that making it visible is item 22's.
  7. Low: an abort before `fetch` returned waited for the expiry. The pull now stops at once when the signal is already aborted.
  8. Low: a failure after the connection opened left it open. It is now closed.
  9. Low: more than 100 waiting rows of backed-off subjects keep other subjects out of a round. Recorded as a risk in the design.
  10. Low: a redrive whose record removal failed can be repeated under the same identity. Recorded as a risk in the design; the receiver's inbox stops the repeat.
  11. Low: this record claimed coverage and a passing run before they were recorded. The claims now point to the checks.
  12. Low: the test-only `@taskelith/postgres` dependency for a type pin contradicted the design. It is removed, and the design says that item 16's wiring type-checks the pairing.

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
