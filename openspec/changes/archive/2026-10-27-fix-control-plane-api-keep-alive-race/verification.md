# Verification

Date: 2026-10-27. The author's verification is recorded below, with review pass 1 and its Low-only fixes.

## Scope and source

- **Source:** item B6 `stabilize-control-plane-fetch-tests`, symptoms a (`control-plane-api.integration.test.ts` "the control plane did not answer", cause `TypeError: fetch failed`) and b (`read ECONNRESET` on a control-plane API GET after a hang of about 8 s in the scenario tests). The coordinator (Niki) diagnosed the root cause, assigned this change, and decided option 1 (design decision 1).
- **Base revision:** `370fa59` on `dev`.
- **Scope:** `createApiServer` answers every request with `Connection: close`, with a unit test and a `control-plane-api` requirement.
- **Out of scope:** retries, widened timeouts, client-side changes, contract changes (design decision 3), and symptoms c and d of B6. B6 had four symptoms: (a) and (b) are this change; (c), `http-evidence-publisher.test.ts` reporting "asynchronous activity after the test ended", is a separate test bug handled by change `stabilize-evidence-publisher-test-server`; (d), `placement.integration.test.ts:226` "tasks are placed in fair order across projects", is unexplained (0 of 60 failures under stress, failing assertion output not available) and left alone by the coordinator's decision until it recurs.

## Environment

macOS (Darwin 25.6.0, arm64), Node.js v24.22.1 (`.nvmrc`), Docker for the services of `make verify`.

## Author self-check

- The change is one statement in the request handler of `createApiServer`, with a two-line rationale comment within the comment length rule.
- Nothing in the repository relies on connection reuse with this server: a search of `apps` and `packages` for `keepAlive`, `keep-alive`, `shouldKeepAlive`, `Agent`, `undici`, `dispatcher`, and `'connection'` listeners found no client agent with keep-alive and no test counting connections. The clients (`worker-control-plane-client`, `apps/worker`, the tests) use the global `fetch`, which handles `Connection: close`.
- No contract or OpenAPI text mentions keep-alive or connection reuse (`docs/contracts`, `packages/contracts/documents`, `apps/control-plane/src`).

## Evidence check

External links: none.

## Checks and results

1. New test before the fix (`node --experimental-strip-types --test --test-name-pattern='closes its connection' apps/control-plane/test/api-server.test.ts` after `npm run build`, source unchanged): fails.

   ```text
   ✖ every response closes its connection, so no idle socket is reused
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     + 'keep-alive'
     - 'close'
   ```

2. The same command after the fix: `✔ every response closes its connection, so no idle socket is reused`, tests 1, pass 1, fail 0.
3. `apps/control-plane/test/api-server.test.ts` in full: tests 19, pass 19, fail 0.
4. `npm run openspec -- validate fix-control-plane-api-keep-alive-race --strict --no-interactive`: valid.
5. `npm run verify:comments`: every comment is within the comment length rule.
6. `make verify` (with its own PostgreSQL, NATS, and Toxiproxy services, so the control-plane integration tests and the `worker-control-plane-client` tests run): exit 0. `npm test`: tests 1930, suites 38, pass 1928, fail 0, skipped 2 (coverage: all files lines 99.29%, branches 92.08%, functions 99.04%; `api-server.js` 98.92 / 96.26 / 95.00). The control-plane integration tests, including `control-plane-api.integration.test.ts`, and the `worker-control-plane-client` tests pass against the closing server. Contract compatibility, `verify:dependencies`, `openspec validate --all --strict` (70 passed), `verify:archive`, and `verify:package` pass. Re-run on the final tree after the pass 1 fixes: exit 0, tests 1930, pass 1928, fail 0, skipped 2 (all files lines 99.28%, branches 92.08%, functions 99.04%), 70 specs valid, archive dry run and package checks pass.

The race itself is not reproduced in the suite: a test would need a stall of several seconds. The coordinator's standalone reproduction (design, Context) is its evidence: `ECONNRESET` at idle 0 ms with a 6500 ms stall and at idle 2500 ms with a 4000 ms stall, and 201 with `response.shouldKeepAlive = false`.

## Independent review

### Pass 1

- **Reviewer:** OpenCode CLI, model `opencode-go/deepseek-v4-pro`, variant `high`, `reviewer` agent (read-only), assigned by the coordinator.
- **Invocation:** the `kimi-k3.1-pro` row of [docs/agent-task-protocol.md](/docs/agent-task-protocol.md) with the coordinator-assigned model, because the `deepseek` row had not landed on `dev` yet. From the worktree: `opencode run --standalone --agent reviewer -m 'opencode-go/deepseek-v4-pro#high' --format json --title fix-control-plane-api-keep-alive-race "$(cat <prompt-file>)" < /dev/null > <log>`.
- **Revision:** `774a060` (diff `370fa59..774a060`).
- **Model confirmation:** the stored assistant messages record provider `opencode-go`, model `deepseek-v4-pro`, variant `high`; session `ses_e85b9c2f7ffeZoHy4yZyfJ6p95`.
- **Read-only check:** worktree snapshot `7380b551f884fdd541023ad7b5a284edd6199f48f2a031eb330248e6a9c0fb8c` before and after, unchanged.
- **Findings:** 0 Critical, 0 High, 0 Medium, 2 Low.
  - L1: `proposal.md` named the commit types `chore` and `test`, but the branch has `chore(control-plane)` (fix and test) and `docs`. Resolved: the text names the actual types; history is not rewritten.
  - L2: symptom d of B6 was named out of scope without a description, and symptom c was not mentioned. Resolved: the proposal, design, and this record describe all four symptoms of B6.
- **Confirmed without a finding:** the fix covers every response, error paths included; no streaming responses exist; the test's connection count is deterministic; the decision not to change the contract is right.
- The fixes of L1 and L2 are unreviewed, as the Low-only rule of the [independent review process](/docs/governance.md#independent-review-process) allows.

## Archive checks

Worker step 7, run by the worker session after review pass 1 and its fixes. The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive fix-control-plane-api-keep-alive-race --yes` (base `6b3a806`).

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`: exit 0; 1930 tests, 1928 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.08%, functions 99.04%.
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-27-fix-control-plane-api-keep-alive-race` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/control-plane-api/spec.md`, which gains the requirement "Connection closed after each response" with its scenario, the intended edit.

## Limitations

- Symptom d of B6 (`placement.integration.test.ts:226`) is left unexplained; it is out of scope until it recurs.
- Symptoms a and b are attributed to this race by the coordinator's diagnosis; this change does not re-run the loaded-host conditions that produced them.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
