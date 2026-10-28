# Verification

Record after review pass 1 and its fixes; the reruns of `make verify` and `make verify-installation` on the fixes and passes 2 and 3 are pending.

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28) for the follow-up that the worker self-check admission change left as its first limitation ([archived verification](/openspec/changes/archive/2026-10-28-implement-worker-self-check-admission/verification.md), section Limitations). Size S-M.
- **Base revision:** `1c73e1a7` (`origin/dev`, merge of pull request #381), which includes change 26a (`issue-installation-certificates`): the API over HTTPS and NATS over TLS.
- **Revision verified:** first `2e0f98c3`: the contract and spec deltas (`487caa57`), the `worker-admission` command (`b0695069`), and the admission waits of `make verify-installation` (`2e0f98c3`), with this record's draft in `431d1ddf`. Then `8230fdd1`, the fixes of review pass 1 (section Review pass 1), with this record committed after it.
- **Scope:** a bounded wait, after the enrollment and after the restart, until the worker of `make verify-installation` is `admitted` with `linux-containment` `passed`, read through `WorkerAdmissionView` by the new administrative command `worker-admission`; distinct failures for a failed self-check, a refused read, and a timeout; redacted details; a test-only launch command so that the containment check runs; the guide and the contracts.
- **Out of scope:** the negative Docker case, deferred (design D5); an HTTP operation for the view (G3 item 9); the workers screen (item 33).

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node v24.22.1 and npm 12.2.1 through nvm. The author ran no Docker command: under the coordinator's rule of one Docker run at a time on this iMac, the coordinator's session, Niki, ran `make verify` and `make verify-installation` in its Docker slot on the same host.

## Author self-check

- **Contract first.** `487caa57` holds the proposal, the design with the review checklist, `checklist.json`, both spec deltas, the installation contract section 4, the worker admission contract section 8, and the local installation guide, before the code commits.
- **Spec deltas.** `local-installation`: "Opt-in bring-up check" modified from the full living text (468 characters); "Bounded admission wait of the bring-up check" added (410). `installation-enrollment`: "Workers view in the administrative entry" added (298).
- **Architecture.** The command composes the existing PostgreSQL view adapter in the administrative entry, the composition root of the host commands; no module or port changes. The published `taskelith` package does not change.
- **Secrets.** The operator credential reaches the command by name through `--env`; a shell test asserts that it is in no output and no recorded `docker` call. Each printed detail is redacted again; a unit test covers a secret-shaped detail.
- **Timing.** Waits of 300 seconds by default with 5 seconds between reads, set by `TASKELITH_ADMISSION_SECONDS`, for the loaded 2020 Intel iMac.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `docs` and `chore`: only the private `apps/control-plane`, scripts, test infrastructure, and documents change.

## Checks and results

Author checks, run on `2e0f98c3` without Docker:

- `npm run openspec -- validate assert-worker-image-admission --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run build`: passed.
- `npm run check:boundaries` (type check of sources, tests, and scripts, and the boundary check): passed.
- `node --experimental-strip-types --test test/installation-admission.test.ts test/installation-script.test.ts apps/control-plane/test/admin-worker-admission.test.ts test/installation-tls-probe.test.ts`: 37 tests, 37 pass.
- `npm run verify:comments`, `npm run verify:private-keys`, `npm run verify:links`, `npm run verify:archive`, `npm run verify:package`, `npm run verify:dependencies`: passed.
- `make findings ARGS="validate"` (`npm run verify:findings`): 58 findings files and 38 pass summary files valid.
- `bash -n scripts/installation.sh`: passed. `shellcheck` is not installed on this host.
- Not run here, because they need Docker: `test/installation-composition.test.ts` (`docker compose config`) and `apps/control-plane/test/administration.integration.test.ts` (PostgreSQL and NATS), both part of `make test` in `make verify`.

## Fails before the change

- With `scripts/installation.sh` of `1c73e1a7` restored in the working tree and the tests of `2e0f98c3`, the five new admission tests of `test/installation-script.test.ts` failed (5 of 5); the file was restored afterwards.
- `test/installation-admission.test.ts` and `apps/control-plane/test/admin-worker-admission.test.ts` import `scripts/installation-admission.ts` and `printableWorkerAdmission`, which do not exist at `1c73e1a7`, so they fail there.
- The new composition test reads `infra/installation/verify/compose.yaml`, which does not exist at `1c73e1a7`.

## Coordinator checks on `431d1ddf`

Run by the coordinator's session, Niki, in its Docker slot, before review pass 1:

- **`make verify`:** passed; 2545 tests, 2538 pass, 0 fail, 7 skipped; coverage of all files 99.36% lines, 92.51% branches, 99.06% functions. It ran `test/installation-composition.test.ts` and `apps/control-plane/test/administration.integration.test.ts`, which the author checks left out.
- **`make verify-installation`:** passed, ending with `installation.sh: built, bootstrapped, started, enrolled, admitted, restarted, admitted again, certificates re-issued and served, removed`. So the real Linux worker image was `admitted` with `linux-containment` `passed`, before and after the restart.

Both ran before the fixes of review pass 1 and must run again on them (Remaining gates).

## Review passes

### Review pass 1

- **Reviewer:** A, Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, read-only.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run by the coordinator from the worktree.
- **Confirmation:** the output header names model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`; session `01a180e7-3932-7c21-8253-444196812986`.
- **Revision reviewed:** `431d1ddf`, against the base `1c73e1a7`.
- **Snapshot:** `2028ba2b01b47cdf001e161284c9d80372ae1c777f337818bc282ab26cf92d22` before and after the pass, unchanged.
- **Result:** Critical 0, High 0, Medium 1, Low 2, as in `passes.jsonl` and `findings.jsonl`.

| Finding | Resolution |
| --- | --- |
| M1 (`local-installation`, `error-handling`): the wait had no real deadline. Each read ran in the foreground without a timeout, the deadline was checked only after it returned, so a hung `docker compose run` or database read could block the gate for ever, and an admission read after the deadline was accepted | `bounded_admission_read` (`scripts/installation.sh`) runs each read in the background, replaced by `docker` through `exec`, and kills it when it is still running at the deadline; no read starts after the deadline, and an admission read at or after it is a timeout. Tests: a hung read is killed at a 2 second bound, and an admission returned after a 1 second bound is a timeout (`8230fdd1`) |
| L1 (`local-installation`, `error-handling`): a bound with a leading zero was read as octal, so `08` aborted the shell arithmetic and `010` meant 8 seconds | The bound is converted with `10#`. Test: `08` admits, and `010` times out after 10 seconds with `within 10s` (`8230fdd1`) |
| L2 (record): this record and `tasks.md` still called `make verify`, the Docker gate, and the integration checks not run, though the coordinator had run them | Section Coordinator checks on `431d1ddf` records them, tasks 4.2 and 4.3 are ticked, and the author checks stay as they ran (the records commit after `8230fdd1`) |

The design (D4, D6), the spec delta ("Bounded admission wait of the bring-up check", now 471 characters, with the scenario Hung read), and the local installation guide state the killed read and the base 10 bound.

- **Fails before the fixes:** with `scripts/installation.sh` of `431d1ddf` restored in the working tree and the tests of `8230fdd1`, the three new tests failed (3 of 3): the hung read blocked for 30 seconds and was then accepted as an admission, the late admission was accepted, and `08` aborted. The file was restored afterwards.
- **Checks after the fixes,** on `8230fdd1` without Docker: `npm run openspec -- validate assert-worker-image-admission --strict` valid; `npm run check:boundaries` passed; `node --experimental-strip-types --test test/installation-admission.test.ts test/installation-script.test.ts apps/control-plane/test/admin-worker-admission.test.ts test/installation-tls-probe.test.ts` 40 tests, 40 pass; `npm run verify:comments` passed. With this record: `make findings ARGS="validate"` valid (58 findings files, 38 pass summary files), `npm run verify:links` passed, and the strict validation again valid.

Passes 2 (reviewer B) and 3 (reviewer A): pending.

## Limitations

- The end-to-end admission of the real Linux worker image is shown by the Docker gate on `431d1ddf`, before the pass 1 fixes changed the wait; it has not run on them yet.
- The negative case, a worker whose containment check fails and gets no offers, has no Docker case (design D5); its behaviour is covered by unit and integration tests of item 27.
- The composition test and the administrative integration cases ran only in the coordinator's `make verify` on `431d1ddf`.

## Remaining gates

- `make verify` and `make verify-installation` again on the pass 1 fixes (coordinator's Docker slot).
- Review passes 2 and 3 and their records.
- Archive (worker step 7).
- Integration into dev by the coordinator (single pull request)
