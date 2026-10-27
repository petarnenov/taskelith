## Context

`run-hosted-runner-linux-check` ([archived design](/openspec/changes/archive/2026-10-27-run-hosted-runner-linux-check/design.md), decision 3) split the hosted-runner check into two steps: it added the dispatch-only workflow, and this change records the first run after integration. The coordinator dispatched the workflow "Linux acceptance" on `dev` and downloaded its artifact; this change takes the run's facts from the artifact and the run metadata, not from the job log.

The precedents for the records are the archived [Linux-host run](/openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/acceptance.md) and the [x86_64 run](/openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/acceptance.md) (25c). Since those runs, `wire-linux-crash-windows-into-native-acceptance` (#345) added the Linux crash windows and the duplicate delivery to the Linux entry, so this run has 42 records where the Linux-host run had 11.

## Decisions

1. **The tested revision.** The run checked out `4fe094562e6ccb9e568dee91be24ff2c93108004`, the merge of #355 (`run-hosted-runner-linux-check`) into `dev`, and every record names it. It is an ancestor of this change's base `b87abe75`. Later `dev` commits change code that the run exercises, for example `packages/adapters/worker-journal/src/worker-root.ts`, `apps/control-plane/src/application/placement-service.ts`, `test/g2-scenarios/scenario-worker.ts`, and `tools/linux-cgroup/run.sh`; the evidence is of `4fe09456` and is not claimed for later revisions.
2. **Records as captured.** `results.jsonl` is the artifact's file, unchanged (its SHA-256 is in `verification.md`). `run.log`, `environment.txt`, `disk-before.txt`, and `disk-after.txt` stay in the artifact, which GitHub keeps for 90 days, and are not committed: `acceptance.md` cites the facts it uses from them.
3. **One entry, one runner.** The run proves the `linux-ubuntu-24.04-x86_64` entry on one GitHub-hosted `ubuntu-24.04` x86_64 runner: Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, Docker Engine 28.0.4, cgroup v2. It says nothing about the arm64 entries, macOS, or other runner images.
4. **Rows judged by the table's rule.** As in the precedents, a row is met in its G2 part only when every listed proof passed and nothing of its G2 part is open. Every process ownership proof passed, the crash windows included, but the worker-kill proof killed after the task had exited, unlike the Linux-host run's kill of a running execution (`started` with uncertain evidence), so process ownership is not marked met; the limits that [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 keeps "before Linux worker support is claimed" (the arm64 Linux entry, and a root test process in the privileged test image rather than the worker image) stay. The cancellation and connectivity parts left to 24c stay deferred to G3 as ADR 0015 decision 5 records, because no proof of this run exercises them. No row is fully accepted.
5. **No extra scenario.** The workflow runs the Linux entry only (`run-hosted-runner-linux-check` design decision 7); `scenario-worker-namespace-confinement` did not run, so no confinement result is claimed for this runner.
6. **Living status only.** `docs/foundation.md` is the living status and is updated. ADR 0015, an accepted record, and `docs/g3-plan.md` still describe the check as open; they are listed in `verification.md` for the coordinator and not edited here.

## Review checklist

The coordinator's brief asked for the output of `make findings ARGS="checklist --capability native-worker-acceptance,foundation-closure --files docs/foundation.md"`. On this branch it prints, verbatim:

```text
Review checklist (capabilities native-worker-acceptance, foundation-closure; files docs/foundation.md), most frequent finding categories first:
1. docs (3): Documentation is missing, wrong, or out of date with the change. Example: "A task line called findings.jsonl empty although it holds the pass 1 finding"
2. missing-fail-before-test (2): A fix has no test that fails before it and passes after it. Example: "No test covered a failed proof together with a not-applicable one in the run's last line"
3. process (2): A protocol, governance, or review rule was not followed. Example: "The Linux cancellation and connectivity rows pointed to 24c, whose records come from the test-side process-group launch host on Linux x64, with no deferral"
4. contract-drift (1): Code, a contract document, and its specification disagree. Example: "The native worker volume still named its Linux file system with stat -f alone, so ext4 read ext2/ext3"
5. error-handling (1): A failure is swallowed, misreported, or leaves inconsistent state. Example: "An early setup failure made the always-run upload fail a second time because the evidence directory did not exist"
6. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "The row map gave report-control-plane-failure-cause and report-all-unconfirmed-sealed-executions the pull request of another change"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (50): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (41): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (23): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (21): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (9): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (7): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```

How this change meets it is in `verification.md`, "Author self-check".

## Risks and limitations

- One hosted run on one runner image; a later image update can change the kernel or Docker versions without a change here.
- The kill of the `scenario-worker-kill` proof landed after the task had exited (the record: executions `exited` just after the kill), so this run does not show a restart with a kept journal after a kill during a running execution; the disk-loss proof killed the worker with its attempt started but then removed the journal. The Linux-host run's worker-kill proof showed it ([its acceptance](/openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/acceptance.md), process ownership).
