## Context

The coordinator's brief (Niki, 2026-10-28) assigns the follow-up that the worker self-check admission change recorded as its first limitation ([archived verification](/openspec/changes/archive/2026-10-28-implement-worker-self-check-admission/verification.md), section Limitations): `make verify-installation` passed but checked only build, bootstrap, start, enrollment, restart, and removal, not the worker admission, so no Docker gate showed that the real Linux worker image passes `linux-containment` and is `admitted`.

### What exists at dev `1c73e1a7`

- **The gate.** `verify` in `scripts/installation.sh` builds, bootstraps, starts, enrolls, stops, starts, checks that every service runs, re-issues the certificates (change 26a, `issue-installation-certificates`), and removes the project. Its waits are bounded constants: `CONTACT_SECONDS=90` and the enrollment's 60 one-second polls.
- **The workers view.** `WorkerAdmissionView.workers()` (`packages/modules/fleet/src/ports/worker-admissions.ts`) returns `asOf` (database time) and each enrolled, unrevoked worker with its worker admission, the database time of its last consumed report (`reportedAt`), and its stored results; `CommittingWorkerAdmissions` (`packages/adapters/postgres/src/worker-admission-repositories.ts`) implements it. Nothing composes it: no HTTP operation exists (G3 item 9), and the administrative entry had no command for it.
- **The containment check.** The worker runs `linux-containment` only on Linux with a launch command; without one it reports `not-applicable` with `no-launch-command` and is admitted ([worker admission contract](/docs/contracts/worker-admission.md) section 4). The installation's base composition sets no `TASKELITH_WORKER_COMMAND`; only the smoke override does.

## Goals / Non-Goals

**Goals:** the bring-up check waits, bounded, until the worker is `admitted` with `linux-containment` `passed`, after the enrollment and again after the restart; it distinguishes a failed self-check, a read failure other than `unavailable`, and a timeout, all with a non-zero status, and prints the failed check IDs with redacted details only.

**Non-goals:** an HTTP operation for the view (item 9); the workers screen (item 33); a negative Docker case (D5); changes to the self-check, the worker admission states, or placement.

## Decisions

### D1: The view through a new administrative command

The gate runs on the host and has no HTTP operation to call, so it reads the view through the administrative entry, which already runs on the host with the database and the operator credential. `worker-admission` authenticates `TASKELITH_OPERATOR_TOKEN` as the other operator commands do (`Administration.workerAdmission`, `apps/control-plane/src/admin/administration.ts:160`), then prints `CommittingWorkerAdmissions.workers()` as JSON (`apps/control-plane/src/admin/admin-main.ts:130`). The operator credential stands for `installation-owner`, which the view requires (worker admission contract section 8). Reading the `workers` table directly with `psql` was rejected: it would bypass the view the brief names and duplicate its mapping.

### D2: Redaction at the print boundary

The worker redacts each detail before it journals it (worker admission contract section 3), but the printed view leaves the control plane, so `printableWorkerAdmission` (`apps/control-plane/src/admin/admin-main.ts:145`) redacts every detail again with `redactSecrets`. The operator credential reaches the command only through `--env TASKELITH_OPERATOR_TOKEN`, by name, and is never an argument or printed; the shell test asserts that it appears in no output or recorded `docker` call. A failed read prints only `redactFailure` output, as every administrative command does.

### D3: A launch command for the gate

`infra/installation/verify/compose.yaml` sets the worker's `TASKELITH_WORKER_COMMAND` to the smoke's harmless `node` process, so `linux-containment` runs instead of being `not-applicable`. `verify` adds it like `smoke` adds its override. The gate submits no task, so the command never runs. A composition test checks that the override changes only that variable.

### D4: The wait and its outcomes

`await_worker_admission AFTER` (`scripts/installation.sh:366`) polls `worker-admission` and pipes each output into `scripts/installation-admission.ts linux-containment AFTER`, which decides:

| Output | Verdict | Exit | Loop |
| --- | --- | --- | --- |
| One worker `admitted`, `linux-containment` `passed`, report after `AFTER` | admitted; prints `asOf` | 0 | stop, pass |
| `awaiting-self-check`, or a report not after `AFTER` | waiting | 3 | poll again |
| Empty output (the run itself failed) or an `unavailable` read | waiting | 3 | poll again |
| `self-check-failed` with a current report | refused, with each failed check ID and its details | 1 | stop, fail |
| `admitted` with `linux-containment` not `passed` or missing | refused | 1 | stop, fail |
| Any other read failure, such as `forbidden` | refused | 1 | stop, fail |
| Not JSON, no workers view, not exactly one worker, or an unknown state | refused | 1 | stop, fail |

- **Bound.** `ADMISSION_SECONDS` defaults to 300 seconds per wait, minutes for the loaded 2020 Intel iMac, where a 2 second bound broke before; `TASKELITH_ADMISSION_SECONDS` sets another, and a value that is not a positive whole number of seconds, `0` included, is a usage error (status 2) before any read (review pass 2, L2). The value is read in base 10, so `08` is 8 seconds and `010` is 10 (review pass 1, L1). Each read runs in the background (`bounded_admission_read`) and is killed when it is still running at the deadline, because neither `docker compose run` nor the administrative entry's database connection has a timeout of its own; no read starts after the deadline, and an admission decided at or after it counts as a timeout, also when its read ended in time (review pass 1, M1; review pass 2, L1). The background read replaces its subshell with `docker` (`exec`), so the kill reaches the client; macOS has no GNU `timeout`. Reads are 5 seconds apart (`ADMISSION_POLL_SECONDS`). The wait is a subshell function, so its temporary files are removed by its own `EXIT` trap on every exit (review pass 2, L2). Status 3 is `ADMISSION_WAITING`, the shell name of the helper's `WAITING` (review pass 2, L6). A worker still waiting at the bound fails with status 3 and `the worker was not admitted within <bound>s`; a refusal fails with status 1 and `the worker admission check failed`. Both print the last read's diagnostics first.
- **Restart.** The first wait, after `enroll`, returns the view's `asOf`; the second, after `stop`, `start`, and `check_running`, passes it as `AFTER`, so the admission of the first start cannot satisfy it. Both `asOf` and `reportedAt` are database times, so no host clock is compared.
- **Why a helper.** JSON parsing and the verdict live in a TypeScript module with unit tests, as `scripts/installation-tls-probe.ts` does for 26a; the shell keeps only the loop. `node` is already required on the host by the 26a re-issue probe.
- **Command.** `installation.sh check-admission PROJECT` runs one wait on a running project, like `check-containment`; it exists for the tests and for manual use.

### D5: The negative case is deferred

A Docker case in which the containment check fails, the worker ends `self-check-failed`, and it gets no offers is not cheap, so it is left to a follow-up:

- **No cheap failing containment.** In a correctly delegated worker container the check passes. Making it fail needs a change to the image or entrypoint, for example a test hook, because the obvious environment overrides are refused before the check runs: the worker settings refuse an execution account of uid 0 (`readAccountId`, `apps/worker/src/settings.ts:181`), and the entrypoint refuses a containment parent at or under the worker's own cgroup (`infra/installation/worker-entrypoint.sh`).
- **No offers needs a task.** Showing that the worker gets no offers needs the smoke's workflow and task submission and a bounded negative wait, on another fresh composition: several more minutes of the shared Docker slot on the loaded iMac.
- **Covered without Docker.** The behaviour after a failed report is already tested: placement skips a `self-check-failed` worker and frees its ungranted assignments (`apps/control-plane/test/observation-service.test.ts`, "a failed self-check makes the worker ineligible, and a later passing report admits it again" and "an offer refused after a failed self-check releases its assignment for another worker"), and the worker refuses every offer after a failed self-check (`apps/worker/test/command-intake.test.ts`, "after a failed self-check every offer is refused, before any limit or pressure, and none is journaled to launch"). The gate's own handling of a `self-check-failed` view is tested with a fake `docker` (D6).

### D6: Tests

Fail-before tests, which fail at dev `1c73e1a7` because the command, helper, or override does not exist:

- `test/installation-admission.test.ts`: each verdict row of D4, the `AFTER` rule, and the printed failed check IDs and details.
- `test/installation-script.test.ts`: with a fake `docker`, the wait polls until admitted and prints `asOf`; a failed self-check fails after one read and names the check; a timeout fails with status 3 and starts no read after the bound; a hung read is killed at the bound, also one that would return an admission after it; an admission read in time but decided after the bound, through a slowed `node`, is a timeout; `08` and `010` are read in base 10; a refused read fails after one read; a malformed bound and `0` are usage errors before any read; no temporary file is left; the operator secret appears nowhere.
- `apps/control-plane/test/admin-worker-admission.test.ts`: the printed view redacts a secret-shaped detail and keeps everything else; the usage names the command.
- `apps/control-plane/test/administration.integration.test.ts` (PostgreSQL and NATS through `make test`): a wrong credential is `forbidden`; the operator credential prints the enrolled worker as `awaiting-self-check` with no results; an extra argument is a usage error.
- `test/installation-composition.test.ts` (`docker compose config`, no daemon): the verify override changes only the worker's `TASKELITH_WORKER_COMMAND`.

`make verify-installation` itself is the end-to-end evidence and runs in the coordinator's Docker slot.

## Risks / Trade-offs

- **A new administrative command.** It widens the administrative surface by one read-only command; it needs the operator credential and prints nothing the view's contract withholds. Item 9 will add the HTTP operation; the command can stay as the host's read.
- **Longer gate.** Two waits add the time the worker needs to report, normally seconds; a hung admission costs up to 300 seconds per wait before it fails.
- **One worker.** The helper refuses a view with other than one worker, which holds for the throwaway project of `verify`; `check-admission` on a project with several workers fails rather than guessing.

## Review checklist

Invocation (from the brief): `make findings ARGS="checklist --capability local-installation,installation-enrollment,worker-runtime --save assert-worker-image-admission --at 1c73e1a7 --size S-M"`; the text below is the output of the same query without `--save`.

```
Review checklist (capabilities local-installation, installation-enrollment, worker-runtime), most frequent finding categories first:
1. error-handling (8): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The plain NATS client probe took any -ERR, such as an authorization refusal, as proof that TLS is required"
2. contract-drift (7): Code, a contract document, and its specification disagree. Example: "The server certificate ended 397 days after issuance instead of 397 days after its backdated start"
3. docs (5): Documentation is missing, wrong, or out of date with the change. Example: "The guide's running worker host wording was unclear"
4. missing-fail-before-test (5): A fix has no test that fails before it and passes after it. Example: "The scenarios Browser certificate in the composition and Plain broker client had no test"
5. redaction (5): A secret or private value can leak into output, logs, or records. Example: "The private key check missed double-escaped and single-line keys and read the working copy"
6. spec-wording (5): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "PostgreSQL was said to stay plain on localhost, though the composition does not publish it"
7. evidence-mismatch (3): A recorded result, count, or claim differs from what the checks show. Example: "The qualification named a macOS x86_64 host and verification.md an arm64 one"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (71): A recorded result, count, or claim differs from what the checks show. Example: "The record called the coverage of the scripts unmeasured instead of measuring it"
2. docs (49): Documentation is missing, wrong, or out of date with the change. Example: "The proposal said no other file changes and no other tracked file documents the invocation, though the change adds OpenSpec records and archived records quote the old invocation"
3. spec-wording (40): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Second Claude Code slot ends with "no rotation across Claude accounts can arise", which is untestable and goes beyond section 7.1"
4. stale-citation (29): A cited file line, commit, or record no longer matches its target. Example: "Tasks and design listed the spec changes without the two requirements and new scenarios added after pass 1"
5. contract-drift (14): Code, a contract document, and its specification disagree. Example: "The spec delta and the protocol did not say that both parts of an OpenCode model must be non-empty"
6. process (14): A protocol, governance, or review rule was not followed. Example: "The record did not include the coordinator's passing make verify on the pass 1 head and still listed it as a gate"
7. scope (6): The change does more or less than its assigned scope. Example: "The worker start slot rule sits in git-workspace-port"

Dev commit: 1c73e1a70d92fab0883f3972672dd56b1d01ae77.
```

How the design answers it: error handling distinguishes a read failure other than `unavailable`, a failed self-check, and a timeout, each non-zero (D4); the view, the contracts, and the spec deltas say the same (D1, D2); the guide, the installation contract section 4, and the worker admission contract section 8 change with the code; each scenario has a fail-before test (D6); details are redacted at the print boundary and the operator secret is never printed (D2); the scenarios name observable outcomes.
