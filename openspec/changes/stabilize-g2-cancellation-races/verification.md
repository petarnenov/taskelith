# Verification: stabilize-g2-cancellation-races

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, first as size S, then as size S-M with a product fix (option 1), developed by briefed subagents: a first subagent diagnosed the cause, and a second one wrote the fix, the tests, the spec delta, and these records. Source: the intermittent G2 cancellation race scenarios e and h (`test/g2-cancellation-races.test.ts:238` and `:398`), on `make verify`'s known-flake list. Scope: `ObservationService`'s contact, the shared current-producer contact of `HeartbeatService`, their tests, the `observation-consumption` delta, and this change. Excluded: the scenario tests themselves, which are unchanged, other flaky tests, and `InventoryService`'s contact (design, "Risks / Trade-offs"). Commit types `chore`, `test`, and `docs`; `@taskelith/control-plane` is private. No `skip_specs` (coordinator decision).

## Revision

- Base: `dev` `6dab1d26` (#444); the checklist was saved with `--at 6dab1d26b271c7210f6929e29394780a80e4b7a2 --size S-M`, which the tool accepted.
- `8cac6eec` `chore: record an observation's contact after its transaction commits` (the fix).
- `ffc74d79` `test: cover the contact recorded after an observation commits`.
- `be3fbe4d` `docs: propose the stabilize g2 cancellation races change` (proposal, design, tasks, the spec delta, `checklist.json`, `.openspec.yaml`, and the empty `findings.jsonl` and `passes.jsonl`).
- `a7a2d000` `docs: record the review route of the stabilize g2 cancellation races change` (`route.json` unedited).
- `d543ef0d` `docs: record the checks of the stabilize g2 cancellation races change`.
- Pass 1 fix round: `98318b66` `docs: record pass 1 of the stabilize g2 cancellation races review` (`passes.jsonl`), `558dc21f` `chore: log a contact transaction that throws after its observation committed`, `b50db636` `test: cover a thrown contact and a reachable worker revoked before its contact`; the commit of these records follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. `make verify` and `make verify-linux-g2-scenarios` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs ran with Node.js 24.22.0 from the shell's `PATH`, after `npm run build`, inside `bash scripts/services.sh run sgcr ...` from the worktree. The logs are in Zaki's session scratchpad `/tmp/claude-1000/-home-petar-taskelith/b2f59113-7371-431b-8ca7-f0f5db414984/scratchpad/sgcr/`.

## Diagnosis

- The failures, from the first subagent's diagnostic runs (`sgcr/all1/`, `sgcr/par1/`): h `Error: the authorized start not met within 20000 ms` (`test/g2-cancellation-races.test.ts:404`), and e `the start not met within 20000 ms` (`:251`). The control plane's logs saved by a diagnostic copy of the test (`sgcr/all1/diag-h-3916389-1793793209691.json`, `sgcr/all1/diag-e-3908064-1793793072193.json`) show `postgres.serialization.exhausted` with `attempts: 5`, in h after a `fleet.worker.contact-lost`. Of the parallel full-file runs of that copy (`sgcr/all1/`, five loops of three), one of 15 failed, in h.
- At the base, `ObservationService` recorded contact inside each observation's SERIALIZABLE transaction (`apps/control-plane/src/application/observation-service.ts:79` and `:163` at `6dab1d26`) with `UPDATE workers SET reachable = true, last_contact_at = greatest(...)` (`packages/adapters/postgres/src/observation-repositories.ts:100`). Heartbeats write the same row every 500 ms in the scenarios (`test/g2-scenarios/scenario-worker.ts:28`, `TIME_SCALE` 20 against the `10s` interval), and a second writer of one row cannot commit under SERIALIZABLE, so even `execution.started`, whose effect leaves the row alone, lost to them. `PostgresDatabase` retries five times (`SERIALIZATION_ATTEMPTS`, `packages/adapters/postgres/src/postgres-database.ts:14`), and the observation then waited for its redelivery.
- The PostgreSQL log of one full run of the Node.js test files (`sgcr/full1-postgres.log`) has 106 `could not serialize access due to concurrent update` errors, 59 of them on that contact statement, more than any other statement, and 46 `read/write dependencies` errors.
- What the in-transaction contact protected, and why none of it needs the effect's transaction: `design.md`, "What the in-transaction contact protected". The fail-closed retirement and revocation are kept by authenticating the moved contact again.

## Author self-check

- Fix: `apply` consumes the observation, then records its contact (`apps/control-plane/src/application/observation-service.ts:50-58`), in its own transaction through `recordCurrentContact` (`apps/control-plane/src/application/journal-reconciliation.ts:89-96`), which `HeartbeatService` shares (`apps/control-plane/src/application/heartbeat-service.ts:31-37`). A failure is logged as `execution.observation.contact-unrecorded` and leaves the consumed outcome (`observation-service.ts:134-152`); a contact transaction that throws is caught there too (`:145-152`). The revoked worker's warning stays in the transaction (`observation-service.ts:85`, `:182-189`). No G2 scenario timeout, retry count, or assertion changed; the changed unit-test transaction counts are listed under "Tests".
- Monotonic contact: `recordContact` keeps `greatest(last_contact_at, $2)` in PostgreSQL and the later instant in memory; the moved write uses its own transaction's database time.
- Tests: `apps/control-plane/test/heartbeat.integration.test.ts:226` (a heartbeat's transaction holds the worker row while an observation is applied: the observation commits first, its contact after), `:249` (a stored later contact is kept), and `:275` (a reachable worker revoked before the contact keeps its last contact and its `reachable` flag, and is no placement candidate); `apps/control-plane/test/observation-service.test.ts:152` (monotonic in memory), `:173-191` (a journal retired, or the worker revoked, between the commit and the contact gets no contact), `:592` (a failed contact is logged and the observation stays applied), and `:618` (a contact transaction that throws is logged redacted and the observation stays applied). Changed unit-test assertions: `:222` (four transactions: the rollback, the replacement and its contact, and the retirement) and `:577-590` (the scripted store answers the contact of the rejected observation; five transactions).
- Spec deltas: `observation-consumption` MODIFIED "One transaction per observation" (requirement text 477 characters, both scenarios copied) and "First contact" (486 characters, both scenarios copied and qualified with "and its contact is recorded", five added: "Worker row held by a heartbeat", "Contact fails after the commit", "Journal retired before the contact", "Worker revoked before the contact", "Newer stored contact"); `worker-contact` MODIFIED "Lost contact" (498 characters, its three scenarios copied, "Contact again" qualified in the same way, one added: "Observation contact fails"). Pass 1 found that the successful-contact scenarios conflicted with the best-effort contact, so the `worker-contact` delta was added in the fix round.
- `npm run openspec -- validate stabilize-g2-cancellation-races --strict`: `Change 'stabilize-g2-cancellation-races' is valid`.
- Archive probe: a copy of `openspec/` in the scratchpad (`sgcr/archive-probe`), `openspec archive stabilize-g2-cancellation-races --yes` with the worktree's pinned CLI (`~ 2 modified`), then `openspec validate --all --strict`: `Totals: 71 passed, 0 failed (71 items)`. Again after the pass 1 fix round (`sgcr/fix1/archive-probe.log`, `sgcr/fix1/archive-validate.log`): `Totals: + 0, ~ 3, - 0, → 0`, then `Totals: 71 passed, 0 failed (71 items)`.
- `npm run verify:comments`: `Every comment is within the comment length rule.` No AI attribution in commits.

## Fail-before

`sgcr/fail-before.sh` stashed `apps/control-plane/src` (the diff against `6dab1d26` was then empty), rebuilt, ran the new tests, restored the fix, and rebuilt (`sgcr/fail-before-summary.txt`).

- PostgreSQL (`sgcr/fail-before-pg.log`), `node --experimental-strip-types --test --test-reporter=spec apps/control-plane/test/heartbeat.integration.test.ts`: `tests 9, pass 8, fail 1`; "an observation commits while a heartbeat holds the worker row, and its contact follows" failed at `heartbeat.integration.test.ts:239` with `AssertionError [ERR_ASSERTION]: committed before the row is free`, `actual: []`, expected the inbox row `unrecorded-worker-a-1`: at the base the observation's transaction waits for the heartbeat's row lock. It is a deterministic regression test of that blocking dependency; it releases one held transaction and does not reproduce five serialization losses, retry exhaustion, the delayed redelivery, or the G2 start timeout. That redeliveries keep losing while heartbeats keep writing is inferred from the diagnosis and the load runs, not shown by this test. "the contact after an observation never moves the last contact backward" passed, as the base's in-transaction contact was monotonic too.
- In memory (`sgcr/fail-before-unit.log`), `apps/control-plane/test/observation-service.test.ts`: `tests 30, pass 25, fail 5`. "a contact that fails after its observation committed is logged, and the observation stays applied" failed with `the observation, then its contact`, `1 !== 2`. The two tests of a retired journal or a revoked worker failed because the base opened only one transaction, so their hook between the two never ran and the in-transaction contact left the worker reachable; they protect the re-authentication rather than reproduce the race. The two changed tests failed on their new transaction counts. The monotonic test passed.

## After

- `npm run build`, then in `bash scripts/services.sh run sgcr ...`: `heartbeat.integration.test.ts`, `observation.integration.test.ts`, and `inventory.integration.test.ts` (`sgcr/int-after.log`, before the `try`/`finally` of `:236-241` was added): `tests 116, pass 116, fail 0`; the unit files `observation-service.test.ts` and `heartbeat-service.test.ts`: `tests 34, pass 34, fail 0`.
- Load repro on `ffc74d79`'s build (`sgcr/after.sh`, logs `sgcr/after1/`): e and h together, `--test-name-pattern='^(e|h)\. '`, 15 runs plain and 15 with 8 busy-loop processes on the 8 logical CPUs: 30 runs, each `tests 2, pass 2, fail 0`, so e and h passed 30 times each; plain e 8507 to 10695 ms and h 9147 to 10328 ms, under the hog e 10886 to 14780 ms and h 10648 to 12012 ms. The hog processes were killed by their saved PIDs; none was left afterwards. Then five parallel loops of three runs of the whole file, as `sgcr/all1/` reproduced h before: 15 runs, each `tests 9, pass 8, fail 0, skipped 1` (g, macOS only), 57658 to 106698 ms each.
- `env -u NODE_ENV make verify-linux-g2-scenarios` on `a7a2d000` (`sgcr/g2-scenarios-1.log`): `tests 18, pass 17, fail 0, skipped 1` (g); cancellation races, worker to NATS, control plane to PostgreSQL, and stale generations passed; exit 0.

## Pass 1 fix round

Logs in `sgcr/fix1/`. The new tests were written before the fix and run on the build of `d543ef0d`.

- M1, fail-before (`sgcr/fix1/fail-before-unit.log`), `apps/control-plane/test/observation-service.test.ts`: `tests 31, pass 30, fail 1`; "a contact whose transaction throws after its observation committed is logged redacted, and it stays applied" failed with `Error: permission denied, password=hunter2`, as the thrown error escaped `apply`. After the fix (`sgcr/fix1/after-unit.log`), with `heartbeat-service.test.ts`: `tests 35, pass 35, fail 0`.
- L1 protects behavior that `d543ef0d` already had, so it has no fail-before: on `d543ef0d`'s build `heartbeat.integration.test.ts` passed (`sgcr/fix1/head-pg.log`, `tests 10, pass 10, fail 0`). A mutation check instead (`sgcr/fix1/mutation-pg.log`): with `recordCurrentContact`'s `!current.value` guard removed and rebuilt, `tests 10, pass 6, fail 4`; the new test failed at `heartbeat.integration.test.ts:287` with `AssertionError [ERR_ASSERTION]: no contact`, the last contact moved forward. The guard was restored and rebuilt.
- After (`sgcr/fix1/after-pg.log`), `heartbeat.integration.test.ts` and `observation.integration.test.ts` in `bash scripts/services.sh run sgcr ...`: `tests 76, pass 76, fail 0`.
- M2, L2, and L3 change only records and specifications.

## make verify

- Run 1, `env -u NODE_ENV make verify` on `a7a2d000` (tree `3202ccdc`, clean), profile full (`sgcr/verify-1.log`): passed, `make verify: passed, profile full, tree 3202ccdc8a961d0a892b7e088b0055eb4a0ac37c; stamp written`; tests 4827, pass 4780, fail 0, skipped 47; all files 99.42% lines, 92.93% branches, 98.83% functions. None of the known flakes failed, so no rerun was needed. `make record` read `sgcr/verify-1.make.log`, the same log without the `exit 0` line that the run's wrapper appended.

### Route

`route.json` of `be3fbe4d`, rule version 5: standard (no trigger); pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) agrees: standard, P(third) 0.36, threshold 0.4. The route is a recommendation only. The review runs at effort medium (owner decision 2026-11-02).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `3202ccdc8a961d0a892b7e088b0055eb4a0ac37c`; tests 4827, pass 4780, fail 0, skipped 47; all files 99.42% lines, 92.93% branches, 98.83% functions.
- `npm run openspec -- validate stabilize-g2-cancellation-races --strict`: passed, `Change 'stabilize-g2-cancellation-races' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 121 file(s); every pass summary file is valid: 101 file(s); every route file is valid: 54 file(s).`.
- Spec diff against the merge base `6dab1d26b271` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not run yet: Zaki runs the passes.

## Limitations

- The intermittent failure was not reproduced on the fixed build in 45 load runs; before the fix it appeared in 1 of 15 parallel runs, so the load runs are evidence, not proof. The held-row test is a deterministic regression test of the blocking dependency; the diagnosis and the load runs are the evidence for the starvation explanation.
- Observation effects that write the `workers` row still contend with heartbeats (design, "Risks / Trade-offs").

## Remaining gates

- Independent review (passes per `route.json`), its records, and the archive.
- Integration into dev by the coordinator (single pull request).
