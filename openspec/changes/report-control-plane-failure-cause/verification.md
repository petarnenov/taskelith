# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review is pending.

## Scope and source

- **Source:** the coordinator's brief: `control-plane-http.ts:39` reduced the cause of a failed request to `error.name`, so a `fetch failed` caused by `ECONNRESET` was reported and logged as `TypeError`, which hid the root cause of B6.
- **Base revision:** `c73c0fa` on `dev`.
- **Revision verified:** `d54243f` (spec `408c728`, failing tests `e00a826`, test fix `4981792`, fix `d54243f`).
- **Scope:** the client reports the bounded, sanitized cause chain in the details `cause` and `causeCode` (`packages/adapters/worker-control-plane-client/src/failure-cause.ts`, used at `control-plane-http.ts:40`); the worker logs each failed launch authorization request as `worker.launch.authorization-failed` (`apps/worker/src/launch-orchestrator.ts:526`, `:548`); requirement "Control-plane failure cause" of `worker-runtime`; one paragraph of `docs/contracts/launch-authorization.md` section 11.
- **Out of scope:** the failure code, message, and retry policy; wire schemas and OpenAPI documents, which do not change; the evidence publisher's callers, which do not exist yet.

## Environment

macOS 26.6.2 (x86_64), Node 24.22.1 from `.nvmrc` through nvm, Docker Desktop.

## Author self-check

- The enrollment failure reaches the start failure line with its details through `workerMain` (`apps/worker/src/main.ts`, `redactFailure`), so it needed no change; the launch authorization loop logged nothing and now logs each failed request before its back-off.
- The new requirement is 416 characters, below the archive limit, and each scenario maps to a test:
  - "Reset connection": `a reset connection names its code beside the outer fetch failure`, with `a socket closed by the control plane keeps the code of undici`, `an aggregate error is followed into its first error, and the innermost code wins`, and `a real refused connection reports ECONNREFUSED`;
  - "Secrets in a cause message": `a cause message keeps no URL, bearer value, secret pair, or token`;
  - "Long cause chain": `a long or cyclic cause chain is bounded in links and length`;
  - "No cause": `an error without a cause or code is named alone, without a cause code` and `a thrown value that is not an error is unknown; names and codes must be identifiers`;
  - "Logged authorization failure": `a request without an answer is logged with its cause before it is repeated` in `apps/worker/test/launch-orchestrator.test.ts`.
- The client tests are in `packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts`.
- The comment length rule holds (`npm run verify:comments`).

## Evidence: fail before, pass after

The tests were committed in `e00a826` before the fix and run against the unfixed code after `npm run build`:

```
node --experimental-strip-types --test packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts
node --experimental-strip-types --test --test-name-pattern='logged with its cause' apps/worker/test/launch-orchestrator.test.ts
```

Before the fix: client tests 9, pass 0, fail 9; the worker test failed. For example:

```
✖ a reset connection names its code beside the outer fetch failure
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  +   cause: 'TypeError'
  -   cause: 'TypeError: fetch failed <- Error[ECONNRESET]: read ECONNRESET',
  -   causeCode: 'ECONNRESET'
✖ a request without an answer is logged with its cause before it is repeated
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + []
  - [ { fields: { cause: 'TypeError: fetch failed <- Error[ECONNRESET]: read ECONNRESET', causeCode: 'ECONNRESET', code: 'unavailable', executionId: 'id-1', ...
```

After the fix the first run showed that `http://127.0.0.1:1/` is a port `fetch` refuses as a bad port (`Error: bad port`, no code) before connecting, so `a real refused connection reports ECONNREFUSED` now uses a loopback port that was just closed (`4981792`). After the fix (`d54243f`, same commands, after `npm run build`): the client package's tests 22, pass 22; the worker's tests 236, pass 234, fail 0, 2 skipped.

## Checks

- `npm run openspec -- validate report-control-plane-failure-cause --strict`: `Change 'report-control-plane-failure-cause' is valid`.
- Archive dry run in a scratch copy of `d54243f` (`git archive HEAD`, under the session scratchpad): `npm run openspec -- archive report-control-plane-failure-cause --yes` added one requirement to `worker-runtime`; `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run verify:comments`: every comment is within the rule.
- `make verify` at `d54243f`: exit 0; 1939 tests, 1937 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.10%, functions 99.04%; 0 breaking contract changes against `c73c0fa`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed. The known flaky test "a worker journals its commands before it acknowledges them" did not fail.

## Independent review

Pending: Claude Code `claude-fable-5-1`, assigned by the coordinator.

## Limitations and remaining gates

- The real network failures covered by a test are a refused loopback connection and a timeout (existing tests); a reset connection and an undici socket error are covered with constructed errors of the same shape.
- `make verify` ran on macOS only.
- Remaining gates:
  - independent review by Claude Code `claude-fable-5-1` (pending);
  - archive on the branch (worker step 7, pending);
  - Integration into dev by the coordinator (single pull request).
