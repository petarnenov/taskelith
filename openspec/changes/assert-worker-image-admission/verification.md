# Verification

Draft before review: the `make verify` run, the Docker gate, and the review passes are pending.

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28) for the follow-up that the worker self-check admission change left as its first limitation ([archived verification](/openspec/changes/archive/2026-10-28-implement-worker-self-check-admission/verification.md), section Limitations). Size S-M.
- **Base revision:** `1c73e1a7` (`origin/dev`, merge of pull request #381), which includes change 26a (`issue-installation-certificates`): the API over HTTPS and NATS over TLS.
- **Revision verified:** `2e0f98c3`: the contract and spec deltas (`487caa57`), the `worker-admission` command (`b0695069`), and the admission waits of `make verify-installation` (`2e0f98c3`). This record is committed after them.
- **Scope:** a bounded wait, after the enrollment and after the restart, until the worker of `make verify-installation` is `admitted` with `linux-containment` `passed`, read through `WorkerAdmissionView` by the new administrative command `worker-admission`; distinct failures for a failed self-check, a refused read, and a timeout; redacted details; a test-only launch command so that the containment check runs; the guide and the contracts.
- **Out of scope:** the negative Docker case, deferred (design D5); an HTTP operation for the view (G3 item 9); the workers screen (item 33).

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node v24.22.1 and npm 12.2.1 through nvm. No Docker command ran: under the coordinator's rule of one Docker run at a time on this iMac, the briefing session runs `make verify` and `make verify-installation` in its Docker slot.

## Author self-check

- **Contract first.** `487caa57` holds the proposal, the design with the review checklist, `checklist.json`, both spec deltas, the installation contract section 4, the worker admission contract section 8, and the local installation guide, before the code commits.
- **Spec deltas.** `local-installation`: "Opt-in bring-up check" modified from the full living text (468 characters); "Bounded admission wait of the bring-up check" added (410). `installation-enrollment`: "Workers view in the administrative entry" added (298).
- **Architecture.** The command composes the existing PostgreSQL view adapter in the administrative entry, the composition root of the host commands; no module or port changes. The published `taskelith` package does not change.
- **Secrets.** The operator credential reaches the command by name through `--env`; a shell test asserts that it is in no output and no recorded `docker` call. Each printed detail is redacted again; a unit test covers a secret-shaped detail.
- **Timing.** Waits of 300 seconds by default with 5 seconds between reads, set by `TASKELITH_ADMISSION_SECONDS`, for the loaded 2020 Intel iMac.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `docs` and `chore`: only the private `apps/control-plane`, scripts, test infrastructure, and documents change.

## Checks and results

Run on `2e0f98c3`, without Docker:

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

## `make verify`

Pending: run by the coordinator's session in its Docker slot. Result: _pending_.

## Docker gate

Pending: `make verify-installation` by the coordinator's session in its Docker slot. Expected success line: `installation.sh: built, bootstrapped, started, enrolled, admitted, restarted, admitted again, certificates re-issued and served, removed`. Result: _pending_.

## Review passes

Pending: pass 1 (reviewer A), pass 2 (reviewer B), and pass 3 (reviewer A) as the coordinator assigns them. `findings.jsonl` and `passes.jsonl` are empty until then.

## Limitations

- The end-to-end admission of the real Linux worker image is shown only by the Docker gate, which has not run on this branch yet.
- The negative case, a worker whose containment check fails and gets no offers, has no Docker case (design D5); its behaviour is covered by unit and integration tests of item 27.
- The composition test and the administrative integration cases have not run yet; `make verify` runs them.

## Remaining gates

- `make verify` on the head before review pass 1 (coordinator's Docker slot).
- `make verify-installation` (coordinator's Docker slot).
- Review passes 1 to 3 and their records.
- Archive (worker step 7).
- Integration into dev by the coordinator (single pull request)
