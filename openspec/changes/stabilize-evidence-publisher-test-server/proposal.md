## Why

`packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` fails intermittently under load with `Test hook "before" ... generated asynchronous activity after the test ended. This activity created the error "Error: aborted" ... unhandledRejection`. The cause: the test's fake server is an `async` request callback with no error handling. In the timeout case the publisher aborts after 20 ms; under load the abort can land before the server has read the multipart body, so reading the request rejects with `Error: aborted`, and nothing handles the rejection. `verification.md` records the diagnosis evidence.

## What Changes

- The fake server's handler becomes total. When the client left mid-body (`request.errored` is set), it destroys the response. Any other failure answers 500, so a failure inside the fake server stays visible to the test as `internal`.
- A regression test sends a request body that never ends, aborts the request after the server has received it, and then checks that the fake server still answers a publication.

No spec delta: the change is test-only and the requirement "Evidence publication client" (`openspec/specs/worker-runtime/spec.md`) is unchanged; the publisher already reports a timeout or lost connection as `unavailable`. The change sets `skip_specs: true`, following the test-only precedent `2026-10-25-fix-flaky-event-loop-lag-test`.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

One test file. No product code, no retries, and no widened timeouts.
