# Verification: stabilize-evidence-publisher-test-server

## Scope and source

The coordinator Niki assigned the task B6, `stabilize-control-plane-fetch-tests`. Its diagnosis found symptom c: `packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` fails intermittently under load with `Test hook "before" at ...:45:1 generated asynchronous activity after the test ended. This activity created the error "Error: aborted" ... unhandledRejection`. The diagnosis saw it in 3 of 80 runs under stress and in 0 of 40 idle runs. This change fixes that test only; the product publisher is unchanged.

Base revision: `c73c0fa` on `dev`. Test commit: `1906799`.

## Environment

macOS 26.6.2 on arm64, Node.js 24.22.1.

## Author self-check

- Only the test file changes: a total fake-server handler, `closeAllConnections()` in `after`, and one regression test.
- No product code, no retries, and no widened timeouts.
- Every new comment is one line of at most 80 characters. All content is English.

## Evidence check

The change adds no external link.

## Checks and results

- Regression test before the handler fix: the new test was added to the unchanged file and the file was run with `node --experimental-strip-types --test packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts`. The file failed every time, 10 of 10 runs, with exit code 1 and:
  `Error: Test hook "before" at packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts:45:1 generated asynchronous activity after the test ended. This activity created the error "Error: aborted" and would have caused the test to fail, but instead triggered an unhandledRejection event.`
  The summary was `tests 6, pass 5, fail 1`, where the failure is the file itself.
- After the fix: the same command passed with `tests 5, pass 5, fail 0`. Under load, 10 rounds of 8 parallel runs of the file, 80 runs in total, all passed.
- `npm run openspec -- validate stabilize-evidence-publisher-test-server --strict` passed.
- `make verify` passed at `1906799`: 1930 tests, 1928 passed, 0 failed, 2 skipped; coverage of all files was 99.29% lines, 92.07% branches, and 99.04% functions.

## Independent review

Pending.

## Limitations

- The intermittent failure depended on load. The stress runs above show that it no longer appears in 80 runs, which does not prove that it cannot appear. The regression test reproduces the cause deterministically instead.
- The handler also destroys the response on any other server-side failure; a test that depends on such a failure still fails on its own assertion.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
