# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review is pending.

## Scope and source

- **Source:** item B6 `stabilize-control-plane-fetch-tests`, symptoms a (`control-plane-api.integration.test.ts` "the control plane did not answer", cause `TypeError: fetch failed`) and b (`read ECONNRESET` on a control-plane API GET after a hang of about 8 s in the scenario tests). The coordinator (Niki) diagnosed the root cause, assigned this change, and decided option 1 (design decision 1).
- **Base revision:** `370fa59` on `dev`.
- **Scope:** `createApiServer` answers every request with `Connection: close`, with a unit test and a `control-plane-api` requirement.
- **Out of scope:** retries, widened timeouts, client-side changes, contract changes (design decision 3), and symptom d of B6.

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
6. `make verify` (with its own PostgreSQL, NATS, and Toxiproxy services, so the control-plane integration tests and the `worker-control-plane-client` tests run): exit 0. `npm test`: tests 1930, suites 38, pass 1928, fail 0, skipped 2 (coverage: all files lines 99.29%, branches 92.08%, functions 99.04%; `api-server.js` 98.92 / 96.26 / 95.00). The control-plane integration tests, including `control-plane-api.integration.test.ts`, and the `worker-control-plane-client` tests pass against the closing server. Contract compatibility, `verify:dependencies`, `openspec validate --all --strict` (70 passed), `verify:archive`, and `verify:package` pass.

The race itself is not reproduced in the suite: a test would need a stall of several seconds. The coordinator's standalone reproduction (design, Context) is its evidence: `ECONNRESET` at idle 0 ms with a 6500 ms stall and at idle 2500 ms with a 4000 ms stall, and 201 with `response.shouldKeepAlive = false`.

## Independent review

Pending.

## Limitations

- Symptom d of B6 is left unexplained; it is out of scope.
- Symptoms a and b are attributed to this race by the coordinator's diagnosis; this change does not re-run the loaded-host conditions that produced them.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
