# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 22 and owner decision D13 (a). The coordinating session (Niki) assigned it to the worker session Maki, with Claude Fable 5.1 (medium) as the reviewer by rotation. Base revision: `5878679` on `dev`, with items 11 (PostgreSQL state and outbox) and 12 (NATS transport) merged and archived.

Scope: the row of item 22. That covers structured logs with command and attempt correlation and no secrets, and the architecture section 12 signals that G2 produces, behind a log sink and a metrics port with adapters outside the domain. Out of scope:
- dashboards, alerting, and an exporter deployment;
- wiring the sampler and sinks into the applications (items 16 and 20);
- worker-side capacity and journal signals (item 20).

## Evidence

- Environment: macOS arm64, Node v24.22.1, npm 12.2.1, Docker 29.6.1. The integration services are those of `infra/services/compose.yaml`: PostgreSQL 18.6, nats 2.15.1, and Toxiproxy 2.13.0, each pinned by digest.
- Evidence check: the change adds only repository-relative links and no external one.
- Dependencies: none added. The adapters use Node built-ins (`perf_hooks`, `stream`, `timers/promises`), so no owner approval was needed. The dependency inventory is regenerated for the two new workspace links.

## Author self-check

Done before pass 1 and written into this record afterwards.

- Every topic of the plan row is covered:
  - correlated records;
  - redaction;
  - outbox and inbox lag;
  - assignment age;
  - unknown execution count;
  - worker capacity;
  - event-loop lag;
  - database latency.
- The ports live in a module, the adapters outside it, and the boundary check passes.
- No logging or metrics library was added.
- Every spec scenario has a test.
- Comments follow the AGENTS.md rule.
- `npm run openspec -- validate add-execution-observability --strict` passes.

## Checks

`make verify` ran in the worktree, with every file tracked, before pass 1 and after each round of fixes. Each run included the PostgreSQL, NATS, and Toxiproxy integration tests.

- At `bf06f39`, before pass 1: 806 tests passed, 0 failed; coverage 99.28% lines, 93.40% branches, 99.24% functions.
- At `699fffa`, after the pass-1 fixes: 810 passed, 0 failed; 99.27% lines, 93.40% branches, 99.24% functions.
- At `ab5509d`, after the pass-2 fixes: 820 passed, 0 failed; 99.30% lines, 93.45% branches, 99.32% functions.
- At `7b8d83a`, after the pass-3 fixes: 820 passed, 0 failed; 99.30% lines, 93.45% branches, 99.32% functions.
- Each run passed the comment, boundary, coverage-scope, contract-compatibility, dependency-inventory, OpenSpec, archive, and package checks.

## Independent review

The prompts and logs are kept outside the worktree.

**Pass 1, Claude Code.** Session `340703dc-80a2-4697-8708-9c670479e992`, run as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json` and reviewing `git diff 5878679..bf06f39`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `c6b730aa…5e29`, equal. The reviewer ran the unit tests, the comment check, and OpenSpec validation. It could not run the integration tests, because the session lacked the service endpoints.

Findings: 0 Critical, 0 High, 2 Medium, 8 Low, all resolved at `699fffa`:
1. Medium: `event-loop.lag` included the histogram resolution, so an idle process read about 20 ms. The monitor now subtracts the resolution, and a test shows an idle window below it.
2. Medium: the snapshot read in a `SERIALIZABLE` transaction, whose predicate locks could abort writers. `PostgresDatabase.readOnly` now reads in `REPEATABLE READ READ ONLY`, and a test shows that a write inside it is a defect.
3. Low: secret field names matched substrings, such as `passedChecks` or `promptTokens`. Names are now matched by whole segments.
4. Low: the text rules missed `password=` pairs and passwords containing `@`. Both are now redacted, with tests.
5. Low: the partial index on tasks was on `(id)`. It is now on `(unknown_executions)`.
6. Low: the backfill listed the non-terminal states positively. It now excludes the terminal states, as `EXECUTION_TRANSITIONS` defines them.
7. Low: PostgreSQL events carry no command correlation. The design records that the composition in item 16 logs around each command with its correlation.
8. Low: `docs/operational-targets.md` said "created" for the offer time. It now says "offered".
9. Low: the password assertions were weak. They are strengthened, and strengthened again under pass-2 finding 8.
10. Low: `docs/architecture.md` section 6 lacked the new packages. The module table and the package tree now list them.

**Failed attempt, not a pass.** The pass-2 run of Claude Code at 14:00 EET ended with `Error: No messages returned from query`: exit 1, no session, and no output. The snapshot was unchanged, `649680ab…fb76`. Under the governance rule "Unavailable reviewer", Claude Fable 5.1 was paused for 30 minutes, and the worker proposed the next reviewer in the rotation. The coordinator assigned Codex CLI for the remaining passes, and the pass count carried over.

**Pass 2, Codex CLI.** Session `01a172f1-e3c1-7cb1-89b2-87067a5504a6`, run as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. The prompt gave pass 1's findings and fixes. The reviewer confirmed them through `git diff bf06f39..699fffa`, then reviewed `git diff 5878679..699fffa` as a whole. Snapshot before and after: `649680ab…fb76`, equal.

It confirmed pass-1 findings 1 to 3, 5, 6, 8, and 10, and accepted the deferral of 7. It found 4 and 9 only partly resolved; the gaps are findings 1 and 8 below. Findings: 0 Critical, 0 High, 6 Medium, 2 Low, all resolved at `ab5509d`:
1. Medium: quoted passwords leaked after the first space. Quoted values are now redacted whole, unterminated quotes included.
2. Medium: acronym names such as `APIToken`, `DBPassword`, and `JWTToken` bypassed redaction. Acronym boundaries are now segments, with tests.
3. Medium: an asynchronous stream error in `JsonLinesLogSink` could end the process. The sink now listens for `error` and drops every later record. A real `Writable` test covers it.
4. Medium: the sink ignored backpressure. It now drops records until `drain`. A test shows that 1000 records against a full output keep the buffer bounded.
5. Medium: the backfill cast whole records to `jsonb`, which rejects the escapes of a lone surrogate or NUL that a stored reference may hold.
   - A temporary function now replaces escaped backslashes and `\uXXXX` escapes before the cast.
   - The migration test stores a task whose record holds a lone surrogate, a NUL, and an escaped backslash before `u`.
   - Running PostgreSQL showed that `json` processing rejects these escapes too.
6. Medium: `outbox.lag` read the lowest position, not the oldest `appended_at`. It now reads `min(appended_at)` over a new partial index, with a test of the reversed order.
7. Low: the new ports had no shared conformance suites. `LOG_SINK_CONFORMANCE`, `METRICS_CONFORMANCE`, and `CONTROL_PLANE_SIGNALS_CONFORMANCE` now run against every adapter.
8. Low: the password assertions checked only specific wrappers. The PostgreSQL tests now connect as a login role whose password is a unique sentinel. They assert that neither the sentinel nor its URL encoding appears in any record.

**Pass 3, Codex CLI.** Session `01a172fa-e68c-7f91-b758-b3484c20d83f`, with the same invocation and header. It confirmed the resolutions through `git diff 699fffa..ab5509d`, then reviewed `git diff 5878679..ab5509d` as a whole. Snapshot before and after: `504dc677…9826`, equal.

It confirmed all eight pass-2 findings. Findings: 0 Critical, 0 High, 1 Medium, 1 Low:
1. Medium: an unquoted value with a backslash-escaped space, such as `password=two\ words`, leaked its suffix.
2. Low: a write whose callback failed later was not counted in `dropped`.

The three passes were spent with a Medium left, so the worker stopped and presented options to the owner through the coordinator. **On 2026-10-25 the owner chose an exceptional fourth pass after the fixes, as an exception to the three-pass cap.** Both findings are resolved at `7b8d83a`:
- The unquoted alternative is now `(?:\\.|\S)+`, with tests for an escaped space and an escaped tab.
- `dropped` now counts each failed callback once; the `error` event of the same failure does not count again.

**Pass 4, Codex CLI, by the owner's exception.** Session `01a17301-b63c-7fe2-95e3-042f438c1737`, with the same invocation and header. As the owner limited it, the pass covered only `git diff ab5509d..7b8d83a` and the two fixes. Snapshot before and after: `b67f2b18…c50b`, equal. It confirmed both fixes and found 0 Critical, 0 High, 0 Medium, 0 Low.

## Remaining gates

- Integration into `dev` by the coordinator, then archiving the change.
- The composition of the sampler, sinks, and adapters in the applications (items 16 and 20).
- G6 verification of the provisional section 4 values in `docs/operational-targets.md`.
