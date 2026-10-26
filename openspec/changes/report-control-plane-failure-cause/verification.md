# Verification

Date: 2026-10-27. The author's verification and independent review pass 1 with its fixes are recorded below; review pass 2 is pending.

## Scope and source

- **Source:** the coordinator's brief: `control-plane-http.ts:39` reduced the cause of a failed request to `error.name`, so a `fetch failed` caused by `ECONNRESET` was reported and logged as `TypeError`, which hid the root cause of B6.
- **Base revision:** `c73c0fa` on `dev`.
- **Revisions verified:** `d54243f` (spec `408c728`, failing tests `e00a826`, test fix `4981792`, fix `d54243f`); `c44884e` (the coordinator's merge of `origin/dev` `76ec83e`, the revision of review pass 1); and `1b45512` (the pass 1 fixes: specs `bddad32`, tests `cd309dc`, code `1b45512`).
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
  - "Logged authorization failure" (requirement "Journaled launch authorization"): `a request without an answer is logged with its cause, never over its known fields, before it is repeated` at `apps/worker/test/launch-orchestrator.test.ts:169`.
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

- `npm run openspec -- validate report-control-plane-failure-cause --strict` at `d54243f` and again after the pass 1 fixes: `Change 'report-control-plane-failure-cause' is valid`.
- Archive dry run in a scratch copy of `d54243f` (`git archive HEAD`, under the session scratchpad): `npm run openspec -- archive report-control-plane-failure-cause --yes` added one requirement to `worker-runtime`; `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run verify:comments`: every comment is within the rule.
- `make verify` at `1b45512` (after the pass 1 fixes): exit 0; 1946 tests, 1944 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.10%, functions 99.04%; no undeclared breaking contract change; `validate --all --strict`: 70 passed, 0 failed; the archive dry run, the dependency inventory, and the package verification passed. The known flaky test did not fail.
- `make verify` at `d54243f`: exit 0; 1939 tests, 1937 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.10%, functions 99.04%; 0 breaking contract changes against `c73c0fa`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed. The known flaky test "a worker journals its commands before it acknowledges them" did not fail.

## Independent review

### Pass 1

- **Reviewer:** Claude Code, model `claude-fable-5-1`, assigned by the coordinator, who ran the review and recorded its invocation.
- **Revision:** `c44884e` (the branch after the coordinator merged `origin/dev` `76ec83e`).
- **Session ID:** `6e12dffd-03de-463d-b012-6a8b604f05a7`.
- **Result:** Critical 0, High 1, Medium 3, Low 5. The reviewer confirmed the bounds, the identifier rules, the second redaction by the logger, the scope and level of the log line, and that the tests failed on the old code.

Findings and resolutions, fixed in `bddad32` (specs, design, contract), `cd309dc` (tests), and `1b45512` (code). File references are at `1b45512`, in `packages/adapters/worker-control-plane-client/src/` unless named.

1. **High: a secret cut by the raw 2,048-character slice leaked a prefix** (`[redacted] tken_BBBBBBBBBBBB`). Fixed: `sanitizeFailureText` (`failure-cause.ts:51`) redacts the whole text and only then cuts it to 160 characters; the raw slice is gone. Test `a secret cut by a length limit leaves no part of itself` (test file line 96) puts the token at offsets 2,031, 151, and 2,019.
2. **Medium: the key-value rule took only the first `\S+`**, so `password="my secret value"` and `Authorization: Basic …` leaked. Fixed: the logger's quoted-aware `KEY_VALUE` through `redactText`, and an `Authorization`/`Proxy-Authorization` rule that takes the scheme and the value up to `;`, `,`, or the end (`failure-cause.ts:19`). Test at line 88.
3. **Medium: a third, diverging redaction without the JWT rule.** Fixed: the client now depends on the `@taskelith/observability` module and uses its `redactText` (`failure-cause.ts:1`, `:52`), adding only the whole-URL, `Authorization`, JWT (any length), and long-run rules (`:16`-`:24`). The boundary check accepts the dependency, which `@taskelith/nats` and `@taskelith/postgres` already have; the dependency inventory was regenerated. Design decision 4 is rewritten. Moving the JWT and `Authorization` rules into the logger's `redactText` would change the logger's contract and is left out (see "Limitations").
4. **Medium: details could overwrite the log line's known fields, and the server's `reason` was unbounded.** Fixed: the details are spread first and `executionId`, `operationId`, `code`, and `message` last (`apps/worker/src/launch-orchestrator.ts:550`); `statusFailure` sanitizes and bounds the server's message and `reason` to 160 characters (`control-plane-http.ts:55`, `:57`). Tests: the spoofed details in `a request without an answer is logged with its cause, never over its known fields, before it is repeated` (`apps/worker/test/launch-orchestrator.test.ts`), and `a server's message and reason are bounded and sanitized` (test file line 117).
5. **Low: `causeCode` lost the root beyond four links.** Fixed: the chain is walked to 16 links for the code and rendered to four (`failure-cause.ts:5`, `:61`); the deep-chain test now expects `EDEEP`, and the spec says so.
6. **Low: a message could fake a chain link.** Fixed: `<-` in a message becomes `< -` (`failure-cause.ts:53`). Test at line 104.
7. **Low: the refused-connection test races for its port.** Fixed: it accepts `ECONNREFUSED` or `ECONNRESET` (test file line 69).
8. **Low (spec): "long token-like value" was undefined, and the log scenario belonged to the launch loop.** Fixed: the requirement names a run of 32 or more of `[A-Za-z0-9_+=-]` (451 characters), and the log sentence and scenario modify requirement "Journaled launch authorization" with its full current text (489 characters); design decision 7.
9. **Low: U+0085, U+2028, and U+2029 stayed in a message.** Fixed: they become spaces with the control characters (`failure-cause.ts:17`). Test at line 128.

**Fail before the fixes:** the new and changed tests of `cd309dc` ran once against the code of `d54243f` (its built `dist`, since the source with the fixes did not yet compile): 6 of 26 client tests failed, among them `a part of the token leaked into Error: [redacted] tken_BBBBBBBBBBBB` (finding 1), `secret value leaked into Error: password=[redacted] secret value"; Authorization: [redacted] dXNlcjpwYXNz, then eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig ends` (findings 2 and 3), `'Error: fake <- Error[ECONNRESET]: forged'` (finding 6), the server reason (finding 4), `'… and more\x85last'` (finding 9), and `causeCode` `undefined` instead of `EDEEP` (finding 5). After `1b45512`: 26 of 26 pass.

The fixes of `1b45512` are unreviewed until pass 2.

## Limitations and remaining gates

- The real network failures covered by a test are a refused loopback connection and a timeout (existing tests); a reset connection and an undici socket error are covered with constructed errors of the same shape.
- `make verify` ran on macOS only.
- The logger's own `redactText` still lacks the JWT and `Authorization` rules that the client adds; adding them there is a separate change of requirement "Logs without secrets".
- Remaining gates:
  - independent review pass 2 by Claude Code `claude-fable-5-1` (pending);
  - archive on the branch (worker step 7, pending);
  - Integration into dev by the coordinator (single pull request).
