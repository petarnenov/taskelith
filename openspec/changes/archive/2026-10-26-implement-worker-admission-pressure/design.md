## Context

The coordinator split item 20 (Non-Goals of the archived `implement-worker-start-reconciliation` design): 20e is the admission pressure, the disk floor, and the backlog limit. Contact, heartbeat, offline mode, and the reconnect inventory are 20d2 (`implement-worker-contact-and-offline`), built in parallel. The control plane applies `worker.admission-pressure.changed` and a `worker-admission-pressure` refusal since 21b (`apps/control-plane/src/application/observation-effects.ts`).

## Goals / Non-Goals

**Goals:** the pressure observation and refusal, the disk floor with log truncation, the backlog limit, unmeasurable limits, and the launch pause.

**Non-Goals:**

- 20e2 (item 20, G2), decided by the coordinator: the daemon overhead causes (`daemon-memory`, `event-loop-lag`) with injected sensors, and the retry with log truncation of a write refused for lack of space (`SQLITE_FULL`, worker journal contract section 7).
- Contact, heartbeat, offline mode, reconnect inventory (20d2); `unrecorded-process`.
- Any contract, AsyncAPI, OpenAPI, or journal format change; configuration variables for the limits.

## Decisions

### D1: pressure travels through the journal outbox

A pressure change is a journal fact, published by the existing observation publisher in sequence order with a deterministic `observationId`. The heartbeat carries no pressure (execution wire contracts section 6), so 20e needs nothing from 20d2.

### D2: reported once per start, numbered by its sequence

The worker keeps the last reported causes in memory, so the first refresh of each process journals the current causes, empty ones included. That clears any pressure an earlier process left at the control plane. The fact's declaration number is the sequence it takes, which is unique in the journal.

The coordinator accepted this decision: one pressure observation after every start, possibly empty, and no journal format 4. The control plane applies each observation once by its `observationId`, so a repeated one changes nothing.

- **Alternative:** persist the last causes in `journal_meta`, as the capacity declaration does. It needs journal format 4, and the worker journal contract section 10 lists each format, so it would be a contract change; it was avoided for that reason.

### D3: refusal order

The limits an offer can never meet on this worker (ceiling, controls) and the capacity limits come first; pressure, the only retryable refusal, is asked only for an offer that would otherwise be accepted.

### D4: measurement points

`AdmissionPressure.refresh()` measures the volume and the backlog and journals a change. It runs at start before the broker connection, in a watch loop every 5 seconds, in intake before an offer is accepted, and in each launch before W2 and before each retried request. All callers run on one event loop and the method is synchronous, so no two refreshes interleave.

### D5: the launch waits

`Launch` waits at the poll interval while `refresh()` reports causes or fails, before it journals W2, and after the back-off of a request without a decision, before the deadline check. A cancellation or a stop ends the wait. A cancellation before W2 of a new execution ends the launch with no operation and no seal, since nothing of it is journaled; an execution journaled before is sealed and reported `not-started`, as any cancelled launch is. A launch never ends because of pressure alone, because an ended launch of this process is not resumed until the next start.

### D6: disk floor and logs

The floor is `max(5 GiB, 10% of the volume)` from `statfs` (`bavail`, so only blocks an unprivileged writer may use). Each refresh below the floor empties the regular files under `worker/logs/` in place and keeps the directories.

Node 24 has no `openat` and no way to read or open entries relative to a directory descriptor, and macOS `/dev/fd` cannot traverse one, so a path-based check cannot be made atomic without a native dependency. Truncation therefore verifies containment around a descriptor:

1. The root and each directory are recorded with `lstat` (device and inode) when traversal reaches them; a link is never a directory.
2. A file is opened with `O_NOFOLLOW` (no link as the last component); its descriptor must show a regular file with one link.
3. The recorded chain is checked unchanged, the path is read again with `lstat` and must name the descriptor's inode, and the chain is checked unchanged once more. Only then is the descriptor truncated.

**Guaranteed:** a link at any level, a hard link, a directory swapped for a link and left so, and one swapped and restored around the open, truncate nothing outside the logs; the truncated inode was, during the check, the single-link file at its path inside the recorded chain.

**Residual race:** a process that swaps a directory of the chain for a link and back twice, timed between the open and each step of the check, can pass it. The threat model limits it to a local process that can already write the worker data root, and so the journal itself; such a process can remove the journal without this race.

- **Alternative:** the Linux `/proc/self/fd/<descriptor>/<name>` path gives `openat` semantics, but not on macOS, a supported worker platform.

### D7: backlog

The backlog is the count of outbox rows and the bytes of their observation identity, fact, and recording time, in one read. Rows leave the outbox only through a confirmation.

## Risks / Trade-offs

- **One more observation per start**, also when nothing changed; the control plane applies it idempotently.
- **Rollback:** an older worker does not know the `admission-pressure-changed` fact in its outbox; the worker package is unreleased.
- **A host disk below the floor** makes the worker refuse every offer; the control-plane integration test fixes the free space for that reason.
