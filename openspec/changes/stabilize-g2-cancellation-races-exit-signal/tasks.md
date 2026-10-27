## 1. Diagnose

- [x] 1.1 Run the suite alone 50 times and record failures and seeds.
- [x] 1.2 Trace the exit status from the supervisor and `cancelled` from the attempt outcome; check the contract in `execution-model`.
- [x] 1.3 Measure the cancel latency under CPU oversubscription and reproduce the failure by delaying cancellation commands.

## 2. Fix

- [x] 2.1 Add the held scripted process (`HELD_RUN`) with release and hold to the scenario worker and the crash-before-ack fixture.
- [x] 2.2 Run held processes in scenarios c, e, and f; release them in f only for a round that was not granted.

## 3. Verify

- [x] 3.1 Rerun the 50-run loop alone and the perturbation, and record both in `verification.md`.
- [x] 3.2 Run `npm run openspec -- validate stabilize-g2-cancellation-races-exit-signal --strict` and `make verify`.
- [x] 3.3 Record an evidence run of the suite in `results.jsonl` (requirement "Recorded scenario results").
- [ ] 3.4 Independent review, recorded in `verification.md`.

## Review checklist

From `make findings ARGS="checklist --capability execution-supervisor,worker-supervisor,execution-model,g2-failure-scenarios --files test/g2-*"`:

```
Review checklist (capabilities execution-supervisor, worker-supervisor, execution-model, g2-failure-scenarios; files test/g2-*), most frequent finding categories first:
1. error-handling (5): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The file guard closed leftover installations without killing their processes"
2. naming (4): A name hides intent or uses two terms for one concept. Example: "The partition file bypassed journalOf, duplicated the control plane state check, and had its own delay"
3. docs (3): Documentation is missing, wrong, or out of date with the change. Example: "The design did not name the Linux-only skip or the scenario bounds"
4. evidence-mismatch (3): A recorded result, count, or claim differs from what the checks show. Example: "The records said only verification.md and results.jsonl change after the evidence commit, though tasks.md changed too"
5. concurrency-race (2): Concurrent operations can interleave into a wrong state or result. Example: "Scenario f took the first answer of a round, which a re-placement could give"
6. scope (2): The change does more or less than its assigned scope. Example: "Unused revokeWorker and ScenarioWorker.executions in the scenario helpers"
7. test-flakiness (2): A test depends on timing, ordering, or shared state and can fail at random. Example: "CrashingWorker.start and exited() had no bound"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (28): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
2. evidence-mismatch (28): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
3. stale-citation (15): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (14): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
6. process (3): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
```
