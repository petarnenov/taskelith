# Verification

Date: 2026-10-26. Author verification is recorded below; the review section is left for the session.

## Scope and source

Two follow-ups assigned by the coordinating session, which briefed an implementation subagent that wrote this change: the home cgroup risk recorded in the [unrecorded-process scan design](../archive/2026-10-26-implement-unrecorded-process-scan/design.md) ("Risks / Trade-offs", and L5 of its verification), and a stop that waits a full idle poll because `abortableDelay` ignores an already aborted signal.

- Base revision: `311c40d` on `dev`.
- Out of scope: contracts (`docs/contracts`, AsyncAPI, OpenAPI), requirements, admission pressure, disk and backlog work (20e2), task 23b, and `apps/worker`.
- Item 1 stopped at the gate without code (design D1); only item 2 changes code.

## Evidence

- Environment: Ubuntu 24.04.5 LTS, Linux 6.8 x86_64, Node v24.22.0, Docker 27.3.1 for `make verify`.
- Dependencies: none added.
- Files outside tests: `packages/adapters/nats/src/abortable-delay.ts` only.

## Author self-check

- **Gate (item 1):** `docs/contracts/supervisor-identity.md` lines 23, 117, 178, 206, and 209 define the containment, the self-check, and the `unrecorded-process` fact; none says whether a home cgroup under the containment parent is refused or skipped. `checkLinuxContainment` probes the home only for write access. No code was written for item 1.
- **Failure before the fix (not committed):** with `abortableDelay` restored to `311c40d`, the new test `a stop during an idle publication round ends the loop without the pause` failed with `'paused' !== 'ended'`: the loop was still waiting on its timer after the next event-loop turn.
- **After the fix:** the same test passes. It mocks `setTimeout`, so neither result depends on wall-clock time.
- **Callers:** `runPublicationLoop`, the validating consumer's pull loop, and the quarantine capture loop each check `signal.aborted` after the delay, so resolving at once only ends them sooner.
- **Comment rule:** `npm run verify:comments` passes as part of `make verify`.
- **OpenSpec:** `npm run openspec -- validate harden-worker-linux-and-broker-stop --strict` passes with `skip_specs: true` (proposal "Modified Capabilities", design D2).

## Checks

- `make verify` at `f8ebd03`: passed in 160 s (1704 tests, 1688 pass, 0 fail, 0 cancelled, 16 skipped macOS-only tests; coverage 99.18% lines, 91.76% branches, 98.81% functions; archive dry run and package verification passed).

## Review passes

TODO: the independent review is run by the session.

## Limitations and remaining gates

- Item 1 is open: the owner decides whether the self-check refuses a home cgroup under the containment parent, the scan skips it, or both; either needs a contract statement first.
- `make verify-linux-cgroup` was not run; no cgroup code changed.
- Independent review, integration, and archive are pending.
