## Context

Gate (step 0): the omission is a known limitation, not a decision. `openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/design.md:31` puts adding the target to the Linux entry "outside this change", and its `verification.md:92` and `:126` list it as a limitation carried to `close-g2`. No spec or document requires the omission.

## Decisions

1. **Two proofs, as on macOS.** The macOS entry runs the crash windows and the duplicate delivery as two proofs of different rows (`harness_proofs`). The Linux entry does the same through `make verify-linux-crash-windows`, with the same scenario names, `acceptance-crash-windows` and `acceptance-duplicate-delivery`; the context's entry tells them apart. The cost is a second build check and services project, about 90 s each with the image cached.
2. **`SKIP_PATTERN` on the target.** `verify-linux-crash-windows` accepted only `PATTERN`. A negative name pattern would not exclude the duplicate delivery reliably beside the suite of crash windows, so the target passes `--test-skip-pattern` when `SKIP_PATTERN` is set, as the macOS proof does. Without it the target runs as before.
3. **Not applicable off Linux.** The target needs the host network of a Linux Docker host; Docker Desktop gives it only inside its virtual machine (`run-g2-crash-windows-on-linux` design decision 3). On a macOS host the Linux entry reports both proofs as not applicable on standard error, and the run's last line lists them, whether the run passed or failed. They do not fail the run.
4. **No record for a not-applicable proof.** The scenario recorder accepts only `passed` and `failed` (`packages/testing/src/scenario-results.ts:18`). Widening that shared contract for this follow-up is out of scope, so a not-applicable proof is reported, not recorded; the acceptance table of a run on macOS cites the report.
5. **Acceptance context in the container.** The scenarios of the target record their own results inside the container, which did not get `TASKELITH_ACCEPTANCE`; "Platform facts of a proof" requires those records to carry the proof's context, so `linux-crash-windows.sh` passes it when set.

## Plan checklist

The brief's checklist named the capability `linux-crash-windows`, which does not exist (the crash windows live in `g2-failure-scenarios`), and the glob `docs/**acceptance**`, which matches no document. After review pass 1 the checklist was run again with the real names: `make findings ARGS="checklist --capability native-worker-acceptance,g2-failure-scenarios --files Makefile,scripts/native-acceptance*,scripts/*crash*,docs/local-installation.md"`. Its output, with how this change meets each line:

1. error-handling (7), example "The file guard closed leftover installations without killing their processes": a not-applicable proof neither fails a run nor hides a failed one; the failure line also lists it, tested.
2. docs (5), example "The design did not name the Linux-only skip or the scenario bounds": `docs/local-installation.md` and this design name the Linux-only proofs, the macOS report, `SKIP_PATTERN`, and `TASKELITH_ACCEPTANCE`.
3. naming (4), example "The partition file bypassed journalOf, duplicated the control plane state check, and had its own delay": the Linux proofs reuse the macOS scenario names and `duplicate_pattern`.
4. evidence-mismatch (3), example "The records said only verification.md and results.jsonl change after the evidence commit, though tasks.md changed too": every count and revision in `verification.md` is checked against the logs.
5. concurrency-race (2), example "Scenario f took the first answer of a round, which a re-placement could give": the proofs run one after another, as every proof does.
6. scope (2), example "Unused revokeWorker and ScenarioWorker.executions in the scenario helpers": only the runner, the target, the container script, the docs, and their tests change.
7. test-flakiness (2), example "CrashingWorker.start and exited() had no bound": the new tests use stubs and the runner's 20 s bound.

Record quality: docs (18), evidence-mismatch (16), stale-citation (10), spec-wording (9), contract-drift (4), process (2). Every count, result, and `file:line` in `verification.md` is checked against the tree and the logs; `findings.jsonl` and `passes.jsonl` follow the merged schemas.

## Risks

- A run on a Linux host takes longer by the two target runs.
- A run on macOS still leaves the Linux crash-window rows unproven; only a Linux host proves them.
