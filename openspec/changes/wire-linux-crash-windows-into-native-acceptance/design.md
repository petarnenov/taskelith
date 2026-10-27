## Context

Gate (step 0): the omission is a known limitation, not a decision. `openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/design.md:31` puts adding the target to the Linux entry "outside this change", and its `verification.md:92` and `:126` list it as a limitation carried to `close-g2`. No spec or document requires the omission.

## Decisions

1. **Two proofs, as on macOS.** The macOS entry runs the crash windows and the duplicate delivery as two proofs of different rows (`harness_proofs`). The Linux entry does the same through `make verify-linux-crash-windows`, with the same scenario names, `acceptance-crash-windows` and `acceptance-duplicate-delivery`; the context's entry tells them apart. The cost is a second build check and services project, about 90 s each with the image cached.
2. **`SKIP_PATTERN` on the target.** `verify-linux-crash-windows` accepted only `PATTERN`. A negative name pattern would not exclude the duplicate delivery reliably beside the suite of crash windows, so the target passes `--test-skip-pattern` when `SKIP_PATTERN` is set, as the macOS proof does. Without it the target runs as before.
3. **Not applicable off Linux.** The target needs the host network of a Linux Docker host; Docker Desktop gives it only inside its virtual machine (`run-g2-crash-windows-on-linux` design decision 3). On a macOS host the Linux entry reports both proofs as not applicable on standard error, and the run's last line lists them, whether the run passed or failed. They do not fail the run.
4. **No record for a not-applicable proof.** The scenario recorder accepts only `passed` and `failed` (`packages/testing/src/scenario-results.ts:18`). Widening that shared contract for this follow-up is out of scope, so a not-applicable proof is reported, not recorded; the acceptance table of a run on macOS cites the report.
5. **Acceptance context in the container.** The scenarios of the target record their own results inside the container, which did not get `TASKELITH_ACCEPTANCE`; "Platform facts of a proof" requires those records to carry the proof's context, so `linux-crash-windows.sh` passes it when set.

## Plan checklist

From `make findings ARGS="checklist --capability native-worker-acceptance,linux-crash-windows --files Makefile,scripts/native-acceptance*,scripts/*crash*,docs/**acceptance**"`:

1. error-handling (2): a failure swallowed or misreported, for example a script that mounted secrets without checking their variable. Here: a not-applicable proof must neither fail the run nor hide a failed one; the failure line also lists it.
2. contract-drift (1): the runner, the spec delta, and `docs/local-installation.md` must say the same.
3. docs (1): the docs name the new proofs, the macOS report, `SKIP_PATTERN`, and `TASKELITH_ACCEPTANCE`.
4. missing-fail-before-test (1): every new test is run on `bd6108d4` and fails there.
5. process (1): OpenSpec change, `findings.jsonl`, no `passes.jsonl` (no such rule on `dev`), conventional commits.

Record quality: docs (18), evidence-mismatch (16), stale-citation (10), spec-wording (9). Every count, result, and `file:line` in `verification.md` is checked against the tree and the logs.

## Risks

- A run on a Linux host takes longer by the two target runs.
- A run on macOS still leaves the Linux crash-window rows unproven; only a Linux host proves them.
