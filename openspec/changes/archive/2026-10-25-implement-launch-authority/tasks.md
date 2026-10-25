## 1. Modules

- [x] 1.1 Add the `LaunchRecords` and `LaunchAuthorityClient` ports, `LaunchOutcome`, `rejectUnknownAssignment`, and `workerLaunchDeadline` to Execution.
- [x] 1.2 Add the `CurrentRevisions` port, its in-memory adapter, and its conformance suite to SDLC.
- [x] 1.3 Add `invalidateLaunches` and `invalidateWorkerLaunches` to Scheduling, and the cancellation reason.

## 2. PostgreSQL

- [x] 2.1 Add the migration with the grant index and its backfill, the final rejections, and the current revisions.
- [x] 2.2 Keep the index in step in the task repository, and add the adapters and the crash points.

## 3. Control plane and worker client

- [x] 3.1 Add `LaunchAuthority`, the `authorizeLaunch` route and wire mapping, and the seeding in `submitTask`.
- [x] 3.2 Make worker revocation an invalidating writer, and compose the authority.
- [x] 3.3 Add the worker-only package `@taskelith/worker-control-plane-client`.
- [x] 3.4 Record the G2 implementation in the launch authorization contract.

## 4. Verification and review

- [x] 4.1 Add unit, conformance, integration, and end-to-end tests.
- [x] 4.2 Run `make verify` and record the results.
- [x] 4.3 Obtain independent review (OpenCode `deepseek-v4.1-flash`, high, read-only) and record the results.
