# G0 provisional operational targets and resource budgets

Status: provisional G0 engineering targets established before runtime implementation and benchmark execution (`docs/architecture.md` sections 8, 12, 13, and 15). These targets define the pass/fail baselines for G2–G7 verification; they are not claims of measured capacity or production SLAs.

## 1. Resource admission and delegation budgets

Schedulers and workers enforce explicit capacity reservations before assignment and launch (`F22`, `R32`). Lost-contact or uncertain attempts continue to hold their reserved slots and budgets until ownership is reconciled.

| Resource / limit | Provisional default target | Enforcement and exhaustion behavior |
| --- | --- | --- |
| Reference worker host sizing | Minimum `4 vCPU`, `8 GiB RAM`, `20 GiB` persistent storage on `dataRoot` | Baseline host profile used to evaluate 10/100/1000 worker capacity targets; smaller hosts must scale slot count down proportionally. |
| Worker daemon overhead ceiling | `<= 0.5 vCPU` sustained, `<= 512 MiB` RSS (excluding child agent processes) | Exceeding memory or event-loop lag (`p99 > 200ms`) pauses new launch authorizations on that worker until pressure subsides. |
| Per-attempt CPU and memory reservation | `default: 1 vCPU`, `2 GiB RAM` (`hard ceiling: 2 vCPU`, `4 GiB RAM` per attempt) | Reserved in scheduler admission and worker slot accounting; enforced via OS controls where qualified (`docs/worker-platforms.md`). |
| Worker concurrent active attempts | Configurable per worker (`default: 2`, hard ceiling per host CPU/memory sizing) | Reserved transactionally in PostgreSQL on assignment and re-verified on worker launch authorization. |
| Worker local disk free-space floor | `>= 5 GiB` or `>= 10%` free on `dataRoot` volume (whichever is larger) | Below floor: worker rejects new launch authorizations, reports admission pressure, and truncates only nonessential buffered stream logs while preserving local journal and inbox/outbox records. |
| Worker local journal backlog | `<= 256 MiB` or `<= 10,000` unacknowledged observation entries | Exceeding limit blocks new attempt admissions on that worker while existing attempts drain/reconcile. |
| Per-project / workflow-run concurrency | Configurable quota (`default: 4` concurrent attempts per project, `2` per workflow run) | Fair-share scheduling prevents one project or approval-blocked session from starving the fleet. |
| Provider / account concurrency | Configurable per provider credential, including each subscription account slot (`default: 4` concurrent active requests/turns per credential; [ADR 0005](decisions/0005-harness-subscription-account-pools.md)) | Prevents external model/API rate-limit storms across delegated attempts; token/cost accounting distinguishes estimated vs. provider-confirmed usage. |
| Delegated child-task budget | Shared with parent workflow run / task reservation (`max depth: 3`, `max total attempts per root task: 8`) | Child tasks consume the parent's reservation; delegating work or rotating session IDs never mints an independent budget. |
| Automatic retry budget | `<= 2` automatic retries for proven-idempotent/safe failures; `0` automatic retries for uncertain execution | Exponential backoff (`initial: 5s`, `max: 60s` with jitter). Uncertain or unmediated side-effect attempts require reconciliation rather than blind retry. |
| Placement retry and capacity wait backoff | Provisional, G2 item 18: base doubling from `5s` to `60s`, each delay within `[5s, 60s]` with jitter; a transiently failed placement is tried at most `5` times | A task waiting for capacity and a scheduler retrying after a transient failure back off within these bounds (capacity contract section 5). |
| Delegation capacity wait bound | Provisional, G2 item 18: `10 min` | A delegation that would leave no free unit of a quota or of the fleet's slots for waiting parents waits with `delegation-awaiting-capacity` up to this bound and is then rejected with that reason (owner decision D-A). A delegation chain larger than a quota it charges is rejected at once with `delegation-chain-exceeds-quota` (D-C). |
| Bounded supersession of an assignment without a grant | Provisional, G2 item 18: `2 min` unacknowledged, `10 min` under admission pressure; at once when the worker is unknown, unreachable, draining, or revoked | The scheduler ends such an assignment, releases its reservation, and sends the worker an assignment-ended command; an assignment with a launch authorization is never superseded (capacity contract section 6). |
| Launch authorization validity window | `TTL: 30s`, maximum tolerated clock skew `5s` | Expired launch authorizations require a fresh online control-plane check before spawning an OS process (`F17`, `R27`). |

The numeric CPU, memory, disk, session, and provider thresholds above are the provisional G0 admission targets. Enforcement mechanisms (e.g., container resource limits backed by cgroup v2 for containerized Linux workers vs. macOS launchd/process limits for native macOS workers) must be qualified separately per platform (`docs/worker-platforms.md`). Where an OS cannot enforce a hard limit requested by a task policy, the worker must fail admission closed rather than silently ignoring the requirement.

## 2. Retention, buffering, and replay horizons

| Data category | Provisional retention / bound | Storage and expiry rule |
| --- | --- | --- |
| Canonical operational and SDLC records (PostgreSQL) | Retained for installation lifetime (or explicit operator archival policy) | Authoritative source of truth for workflow runs, gate decisions, attempts, and canonical lessons. |
| Accepted `EvidenceStore` snapshots | Retained for the lifetime of the referencing project/workflow run (`minimum: 365 days` in pilot baseline) | Content-addressed immutable blobs with SHA-256 verification; missing or corrupt evidence invalidates dependent gates (`F21`, `R31`). |
| NATS JetStream command and observation streams | `7 days` or `10 GiB` per stream (whichever comes first); max payload `1 MiB` | Bounded transport durability; persistent inbox/outbox tables in PostgreSQL and worker SQLite journals guarantee lifetime deduplication beyond the broker window. |
| NATS JetStream delivery and backlog | Provisional, G2 item 12: `ack_wait` `30s`; `max_deliver` `5`; redelivery after a failed commit doubling from `5s` to `60s` with jitter; `max_ack_pending` `4` per worker (twice the default concurrency); `10,000` queued commands per worker subject; broker duplicate window `2 min` | A receiver acknowledges only after its commit and extends `ack_wait` while a commit runs; a message terminated for failing its schema, or delivered `max_deliver` times, is copied with its diagnostics into the quarantine stream and redriven only on request under a new `Nats-Msg-Id`. A full worker subject rejects the publication, which stays in the outbox. G6 verifies the values. |
| Knowledge retirement/deletion tombstones | `>= 30 days` replay horizon in canonical store and graph projection | Replays older than the tombstone horizon require a full canonical graph reconciliation/rebuild before admission (`F23`, `R33`). |
| Live session/terminal stream ring buffer | `10 MiB` per active attempt in live relay buffer; durable summary/snapshots in `EvidenceStore` | Slow UI consumers never block worker execution or cancellation commands; expired live cursors fall back to durable snapshot/cursor recovery (`R14`). |

## 3. Availability, recovery (RPO/RTO), and scale stage targets

These provisional objectives govern the progressive validation gates in `docs/architecture.md` section 12 (`R15`, `R16`, `R28`):

| Stage | Workload baseline | Provisional latency & throughput target | Provisional RPO / RTO baseline |
| --- | --- | --- | --- |
| **10 machines** (G6 pilot) | 10 enrolled workers, up to 20 concurrent active attempts, 50 events/s aggregate, 1 control-plane instance, single-node PostgreSQL/NATS/Neo4j. | Command dispatch-to-worker inbox `p95 <= 2s`; online launch authorization `p95 <= 500ms`; knowledge retrieval `p95 <= 1s` (advisory timeout `2s` fallback to no-context). | **RPO:** `0` for committed local backups; `<= 15m` under scheduled backup cadence. **RTO:** `<= 30m` including restore quarantine, epoch increment, worker journal reconciliation, and Neo4j projection rebuild. |
| **100 machines** (G7 scale) | 100 enrolled workers, up to 200 concurrent active attempts, 500 events/s aggregate, 20 concurrent SPA operator sessions. | Command dispatch `p95 <= 3s`; launch authorization `p95 <= 750ms`; backlog recovery after 15-minute broker/control-plane outage within `<= 5m`. | **RPO:** `<= 5m` (continuous WAL archiving / replicated storage). **RTO:** `<= 20m` for control-plane/broker recovery and fleet reconnect without duplicate execution. |
| **1000 machines** (G7 scale) | 1000 enrolled workers across partitioned pools, up to 1000 concurrent active attempts, 2,500 events/s aggregate, throttled reconnect storm after 30-minute partition. | Command dispatch `p95 <= 5s`; launch authorization `p95 <= 1s`; reconnect-storm stabilization and outbox drain within `<= 15m` without exhausting DB connections or event-loop lag (`p99 <= 200ms`). | **RPO:** `<= 5m`. **RTO:** `<= 30m` for partitioned pool reconciliation and projection catch-up. |

Neo4j Community Edition and local embedding services remain advisory to task execution at all stages: an outage or rebuild of the graph must degrade context enrichment gracefully within the `2s` retrieval timeout without blocking SDLC gates, launch authorization, or task completion (`Invariant 9`, `R10`).
