# Verification

Date: 2026-10-28. The author's self-check and checks are recorded below, with review passes 1 and 2 and their fixes; pass 3 is pending.

## Scope and source

G3 sub-change 26b of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26), under owner decision D11 (b) and decisions 3 and 4 of away run `20261027T221048Z-claude-63826`, as the coordinator's brief carries them. The open questions of the first handoff (bundle shape and variable, the worker's trust settings, `undici`, roots without a pin, the listener proof) were decided by the away delegate Claude Fable 5.1, run 20261028T053446Z-claude-21305, relayed by the coordinator: all accepted with conditions, applied in `0ebd089d`, `0111a251`, and `79c77a63`; the coordinator's follow-up put the operator's authorization before the CA read (`8e53aa2f`). It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/enroll-remote-worker-over-tls` on branch `enroll-remote-worker-over-tls`.

- **Base revision:** `1c73e1a7` (`origin/dev`, merge of pull request #381).
- **Revision verified:** `79c77a63`, with this record's final edit uncommitted. After the first handoff (`54607dbc`): the authorization before the CA read (`8e53aa2f`), `undici` behind the `HttpFetch` port (`0ebd089d`), the missing pin's message and the https-only message test (`0111a251`), the contract and register wording (`79c77a63`). Before it: the contract, spec deltas, and docs (`bf25c6d5`); the control plane (`4a99002f`); the worker (`b94e3ef7`); the worker tests and harnesses (`cf94d761`, `782a437e`); the installation (`7d1fdf22`); the control-plane integration tests (`ddc79b74`); the dependency register and journal layout (`2dbd4c43`); the run-time key of the keyed CA test (`f75d4678`).
- **Scope:** the CA fingerprint in the enrollment bundle; the public `readInstallationCa` operation; the CA check before the token; the pinned CA for the worker's HTTPS calls and its broker TLS; `worker/installation-ca.pem`; `https:` only; the outbound-only test over TLS; the local installation and the harnesses that start workers.
- **Out of scope:** mutual TLS, rotation delivery (26c), CA rollover (G6), the private-network bind and the acceptance worker (26d).

## Environment

macOS 26.6.2 arm64 (Apple M3, `Mac15,13`, `uname -m` `arm64`), Node.js 24.22.1 from `.nvmrc`, Docker Engine 29.6.1; the integration services that `make test` starts.

## Author self-check

- **Contract first.** `bf25c6d5` holds the proposal, design, the five spec deltas, the OpenAPI operation and schema (0.4.0 to 0.5.0), and the contract and guide sections, before any code commit.
- **Spec deltas.** `installation-enrollment`: "Installation CA fingerprint in the enrollment bundle" added. `control-plane-api`: "Public installation CA" added. `execution-wire-contracts`: "Execution HTTP operations" modified. `local-installation`: "TLS of the local installation" modified. `worker-runtime`: "Enrollment on first start", "Worker settings", and "Outbound connections only" modified; "Installation CA checked before the token" and "Pinned installation CA" added.
- **Architecture.** The `InstallationCaSource` port is in `@taskelith/fleet`; the HTTP read and the pinned `Agent` are in the private adapter `@taskelith/worker-control-plane-client`; the fingerprint comparison is in `apps/worker` (`worker-start.ts`), the pin file in `@taskelith/worker-journal`. `npm run check:boundaries` passes as part of `npm test`.
- **Secrets.** No failure quotes the token, the fingerprint input, or PEM text; the CA operation's schema admits one certificate block, and a keyed answer is a 500 without key text (`api-server.test.ts`). Test keys are generated at run time; `npm run verify:private-keys` passes.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `chore`, `test`, `build`, and `docs`; only private packages, infrastructure, tests, and documents change. The published `taskelith` package does not change.

## Checks and results

- `npm run openspec -- validate enroll-remote-worker-over-tls --strict`: valid.
- `make verify` at `79c77a63` (final): exit 0; `ℹ tests 2544`, `ℹ suites 45`, `ℹ pass 2537`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 7`; `ℹ all files | 99.35 | 92.47 | 99.06` (lines, branches, functions); "Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s)."; "Contract documents have no undeclared breaking change." (0 in each of the four documents against `1c73e1a70d92`); "Verified 766 package paths"; "Totals: 70 passed, 0 failed (70 items)"; "Every active OpenSpec change archives into strictly valid specs."; "Packed file allowlist and installed CLI verification passed." The added checks are assertions in existing tests, so the count is unchanged.
- `npm audit --omit=dev` at `79c77a63`: "found 0 vulnerabilities".
- `npm run openspec -- validate enroll-remote-worker-over-tls --strict` at `79c77a63`: "Change 'enroll-remote-worker-over-tls' is valid".
- `grep TASKELITH_NATS_CA docs/contracts/installation-and-enrollment.md` at `79c77a63`: one line, 97, the **Broker** bullet: "The control plane and the administrative entry read the CA from `TASKELITH_NATS_CA`, or, when it is not set, from `installation-ca.pem` of their data root". The **Workers** bullet names no trust setting.
- `npm pack --dry-run` of `taskelith` at `79c77a63`: `taskelith@0.1.0`, "total files: 5", no line with `undici` (`grep -ci undici` gives 0); the root `package.json` has no `dependencies`. `undici` is pinned as `"undici": "7.30.1"` only in `packages/adapters/worker-control-plane-client/package.json`, and after `0ebd089d` only `src/undici-fetch.ts` imports it; the package's emitted `index.d.ts` and `control-plane-http.d.ts` name no `undici` type.
- Earlier, `make verify` at `f75d4678`: exit 0; 2544 tests in 45 suites, 2537 pass, 0 fail, 0 cancelled, 7 skipped; coverage of all files lines 99.35%, branches 92.48%, functions 99.06%; 58 findings files and 38 pass summary files valid; 0 breaking changes in the four contract documents against `1c73e1a70d92`; 766 package paths verified; `validate --all --strict` 70 passed, 0 failed; every active OpenSpec change archives into strictly valid specs; the packed file allowlist and installed CLI checks passed. The first run, at `2dbd4c43`, failed at `npm run verify:private-keys` on the literal key block of `api-server.test.ts`; `f75d4678` generates that key at run time.
- Coverage of the changed modules in that run: `http-installation-ca-source` 100% lines, 92.86% branches; `control-plane-http` 100% lines, 95.24% branches, 88.89% functions; worker `settings` 100%; `worker-start` 99.34% lines, 90.71% branches; `worker-credentials` 100% lines, 87.50% branches; `worker-root` 96.13% lines, 79.46% branches; `installation-authority` 98.54% lines, 78.57% branches.
- `npm audit --omit=dev`: 0 vulnerabilities. `bash -n` passes on `scripts/installation.sh` and `scripts/installation-scenarios.sh`.
- `make verify-installation` (Docker) at `f75d4678`: exit 0, "built, bootstrapped, started, enrolled, restarted, certificates re-issued and served, removed"; the Linux worker container enrolled with the bundle's fingerprint and no trust volume, and restarted on its pin after the re-issue. Its log holds no `PRIVATE KEY` line and no `tken_` token.

## Fails before the change

Each test below failed before its fix and passed after it; each item names the revision it ran against, and an item shown by mutation names what was mutated. After each run the tree was restored to `HEAD` and rebuilt.

- **Base sources** of the first four items. `git checkout 1c73e1a7 -- apps/worker/src packages/adapters/worker-control-plane-client/src packages/adapters/worker-journal/src packages/modules/fleet/src`, the new `http-installation-ca-source.ts` and the four packages' `dist` moved aside, `npm run build`, over the tests of `782a437e`; the line numbers are those of that file.
- **Fingerprint mismatch.** `apps/worker/test/enrollment-tls.test.ts`, "a CA with another fingerprint aborts the start before the token is sent": failed at line 154, `worker` was a started worker instead of `undefined`; the base ignored the fingerprint and sent the token to the fake control plane.
- **System-trusted foreign certificate.** Same file, "a system-trusted certificate that the installation CA did not issue gets no token": failed at line 162; the base's global `fetch` trusted the foreign CA as a default root, the impostor got the token, and the worker started.
- **Broker pinning.** Same file, "a worker enrolls over pinned TLS, pins the broker too, and listens on nothing": failed at line 174, the broker endpoint's `tls` was `undefined` instead of `{ca: <installation CA>}`. With the adapter file below, that run was 4 tests, 0 pass, 4 fail.
- **Adapter.** `packages/adapters/worker-control-plane-client/test/pinned-tls.test.ts` failed to load at the base: `@taskelith/worker-control-plane-client` exports no `HttpInstallationCaSource` (1 test, 1 fail).
- **No listening socket.** This is the fail-before proof by mutation, as the away delegate accepted. The base already opened none, so the test was shown to fail by mutating `apps/worker/src/worker-start.ts`: with `createServer().listen(0, '127.0.0.1').unref()` of `node:net` added at the top of `startWorker`, the test failed with `AssertionError [ERR_ASSERTION]: the worker opened no listening socket` at `enrollment-tls.test.ts:175:10`, `actual: [ 'TCPSERVERWRAP' ]`, `expected: []` (1 test, 0 pass, 1 fail); the mutation was then reverted with `git checkout HEAD -- apps/worker/src` and the test passed. Its first form, which counted the listening handles of `process.getActiveResourcesInfo`, passed under that mutation, because that list omits unreferenced handles; `782a437e` replaced it with an `async_hooks` hook, which records every listening handle created during the start.

- **Authorization before the CA.** `apps/control-plane/test/administration.integration.test.ts` with a wrong operator secret while `installation-ca.pem` is moved away, run against `4a99002f`'s `issueEnrollmentToken` before `8e53aa2f`: 7 tests, 6 pass, 1 fail, "AssertionError [ERR_ASSERTION]: authorization comes before the CA", `actual: 'precondition-failed'`, `expected: 'forbidden'`. After the fix that file and `control-plane-api.integration.test.ts`: 31 tests, 31 pass.
- **Missing pin's message.** `packages/adapters/worker-journal/test/worker-root.test.ts`, "the pinned installation CA is read only while present, nonempty, and safe", with `worker-credentials.ts` of `0ebd089d`: failed at line 160, `actual: 'the pinned installation CA is missing'`; it passes with `0111a251`.

## Review

The coordinator assigned reviewer A, Codex CLI `gpt-6.1-sol`, for passes 1 and 3, and reviewer B, Claude Code `claude-opus-5-5` with effort `high`, for pass 2. Each pass adds its section here and a line in `passes.jsonl`. Passes 2 and 3 are pending.

### Review pass 1

- **Reviewer:** A, Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run by the coordinator.
- **Session:** `01a18109-0d4c-7b40-b983-958c59614519`, as the coordinator relayed it.
- **Revision reviewed:** the branch at `af95ddb1`, its last commit before the pass, against the base `1c73e1a7`.
- **Snapshot:** identical before and after the pass, as the coordinator relayed it.
- **Result:** Critical 0, High 1, Medium 1, Low 1; `findings.jsonl` records each finding in the author's words.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | High | The pinned `Agent` set only `ca`; with `NODE_TLS_REJECT_UNAUTHORIZED=0` Node verified nothing, so a foreign server that served the public CA could pass the fingerprint check and get the token | The pinned `Agent` sets `rejectUnauthorized: true` (`undici-fetch.ts`). The broker needed no change: `@nats-io/transport-node` 3.4.0 sets `rejectUnauthorized: true` before it merges the endpoint's `tls` (`node_transport.js` lines 204 and 253); a new test covers it | `4724f166`, `fba0a08b` |
| 2 | Medium | `fetch` followed redirects, so a 307 or 308 to `http:` sent the token in the clear and the client took the plain answer | `HttpInit` carries `redirect: 'error'` for every request, the CA read included, so every `HttpFetch` sees it | `4724f166` |
| 3 | Low | The guide's bootstrap step still copied the CA into the removed worker trust volume | The step names only the broker files; the worker gets the fingerprint through the bundle | `648a227e` |

Spec and contract text changed with the fixes (`648a227e`): the `worker-runtime` requirement "Pinned installation CA" says the worker verifies the server whatever `NODE_TLS_REJECT_UNAUTHORIZED` says and follows no redirect, with the scenarios "Verification turned off by the environment" and "Redirect"; its last sentence, on the bearer and broker JWT, moved to "Outbound connections only" to keep the requirement under 500 characters; the installation contract's **Pin** bullet and design decision 5 say the same.

Fails before the fixes, each run before its fix was written:

- **Finding 1, control plane.** `pinned-tls.test.ts`, "NODE_TLS_REJECT_UNAUTHORIZED=0 does not let a foreign server get the token", on `af95ddb1` with the test added: `AssertionError [ERR_ASSERTION]: expected a failure` at `pinned-tls.test.ts:173:19`, `actual: false`, `expected: true`: the enrollment to the foreign server succeeded, so it got the token. It passes with `4724f166`.
- **Finding 1, broker.** `enrollment-tls.test.ts`, "NODE_TLS_REJECT_UNAUTHORIZED=0 does not let a foreign broker get the credential", passes without a code change, because the client pins `rejectUnauthorized` itself. To show that it can fail, `packages/adapters/nats/src/connection.ts` was mutated to pass `rejectUnauthorized: false`: `AssertionError [ERR_ASSERTION]: the client refused the foreign certificate` at `enrollment-tls.test.ts:207:10`, `actual: 1` (one completed handshake); the mutation was reverted with `git checkout`. Its first form, with an unparsable `.creds` text, also passed under the mutation, because the client failed before the TLS upgrade; it now uses a well-formed `.creds` from `credsFile` and a generated user seed (`@nats-io/nkeys` 2.0.3 as a development dependency of `@taskelith/worker`).
- **Finding 2.** `pinned-tls.test.ts`, "a 307 redirect to plain HTTP is not followed, for the token or the CA read" and the same for 308: `AssertionError [ERR_ASSERTION]: no enrollment through a redirect` at `pinned-tls.test.ts:189:12`, `actual: true`, `expected: false`, for each. With the three new tests that run was 7 tests, 4 pass, 3 fail; with `4724f166` the adapter's tests give 44 tests, 44 pass.
- **Finding 3** is documentation only.

`make findings ARGS="validate"` after recording: "Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s)."

After pass 1, `make verify` on `648a227e` with these records: exit 0; `ℹ tests 2548`, `ℹ suites 45`, `ℹ pass 2541`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 7`; `ℹ all files | 99.35 | 92.50 | 99.06`; "Contract documents have no undeclared breaking change."; "Verified 766 package paths"; "Totals: 70 passed, 0 failed (70 items)"; "Every active OpenSpec change archives into strictly valid specs."; "Packed file allowlist and installed CLI verification passed." The four new tests account for 2548 against 2544.

## Limitations

- The Linux scenario runs and the native scenario depend on hosts this change could not exercise here: `make verify-linux-g2-scenarios` and `make verify-linux-crash-windows` need a Linux host network that Docker Desktop on macOS does not give (26a's record shows `ECONNREFUSED`), and `make scenario-native-worker-lifecycle` needs free host disk above the worker's floor. These files changed for them and ran only where `make verify` runs them: `test/g2-scenarios/scenario-worker.ts`, `test/g2-scenarios/crashing-worker.ts`, `test/g2-scenarios/fixtures/crash-before-ack-worker.ts`, `test/g2-scenarios/scenario-installation.ts` (a comment), `scripts/installation-scenarios.sh` (the native worker's start), and `apps/control-plane/test/harness-composition.ts` and `apps/control-plane/test/fixtures/worker-composition.ts`, whose Linux paths only the Linux suites run.
- `make installation-smoke` was not run; `make verify-installation` covers the container's enrollment and broker connection over the pin.
- The CA read uses TLS that does not verify the server; a man in the middle can answer another CA, which the fingerprint check refuses, so it learns that a worker enrolls but gets no token (design, risks).
- Roots enrolled before this change have no `worker/installation-ca.pem` and fail closed with reason `corrupt` and the message "the pinned installation CA is missing; remove worker/ and enroll again with a new token and its fingerprint". No migration, pre-release.

## Remaining gates

- Independent review passes 1 to 3 under the [independent review process](/docs/governance.md#independent-review-process), and their fixes.
- The Linux suites and the native scenario on a host that can run them.
- Archive of the change on this branch.
- Integration into dev by the coordinator (single pull request).
