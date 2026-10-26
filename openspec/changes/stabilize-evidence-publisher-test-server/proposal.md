## Why

`packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` fails intermittently under load with `Test hook "before" ... generated asynchronous activity after the test ended. This activity created the error "Error: aborted" ... unhandledRejection`. The cause was diagnosed under the change `stabilize-control-plane-fetch-tests` (symptom c): the test's fake server is an `async` request callback with no error handling. In the timeout case the publisher aborts after 20 ms; under load the abort can land before the server has read the multipart body, so reading the request rejects with `Error: aborted`, and nothing handles the rejection.

## What Changes

- The fake server's handler becomes total: a client that leaves mid-body destroys the response instead of raising an unhandled rejection.
- The `after` hook closes all open connections before closing the server, so the 200 ms delayed answer cannot outlive the file.
- A regression test sends a request body that never ends and aborts it after 20 ms, then checks that the fake server still answers a publication.

No spec delta: the change is test-only. The publisher already maps an abort to `unavailable`, and no requirement changes.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

One test file. No product code, no retries, and no widened timeouts.
