# Verification

Date: 2026-10-26. Author verification is recorded below; the review section is left for the session.

## Scope and source

A stop that waits a full idle poll because `abortableDelay` ignores an already aborted signal, assigned by the coordinating session, which briefed an implementation subagent that wrote this change.

- Base revision: `311c40d` on `dev`; branch `harden-worker-linux-and-broker-stop`.
- Split: the change was first assigned as `harden-worker-linux-and-broker-stop`, which also covered excluding the worker's home cgroup from the unrecorded-process scan. The contract states no rule for that, so no code was written for it. Under away run `20261026T130340Z-opencode-33653`, the coordinator, as the owner's delegate, chose option A (a self-check refusal) and moved it to its own change, `harden-worker-linux-self-check-home-layout`; this change was renamed `harden-nats-broker-stop`.
- Out of scope: contracts (`docs/contracts`, AsyncAPI, OpenAPI), requirements, admission pressure, disk and backlog work (20e2), task 23b, and `apps/worker`.

## Evidence

- Environment: Ubuntu 24.04.5 LTS, Linux 6.8 x86_64, Node v24.22.0, Docker 27.3.1 for `make verify`.
- Dependencies: none added.
- Files outside tests: `packages/adapters/nats/src/abortable-delay.ts` only.

## Author self-check

- **Failure before the fix (not committed):** with `abortableDelay` restored to `311c40d`, the new test `a stop during an idle publication round ends the loop without the pause` failed with `'paused' !== 'ended'`: the loop was still waiting on its timer after the next event-loop turn.
- **After the fix:** the same test passes. It mocks `setTimeout`, so neither result depends on wall-clock time.
- **Callers:** `runPublicationLoop`, the validating consumer's pull loop, and the quarantine capture loop each check `signal.aborted` after the delay, so resolving at once only ends them sooner.
- **Comment rule:** `npm run verify:comments` passes as part of `make verify`.
- **OpenSpec:** `npm run openspec -- validate harden-nats-broker-stop --strict` passes with `skip_specs: true` (proposal "Modified Capabilities", design D1).

## Checks

- `make verify` at `REVISION`: RESULT

## Review passes

TODO: the independent review is run by the session.

## Limitations and remaining gates

- `make verify-linux-cgroup` was not run; no cgroup code changed.
- Independent review, integration, and archive are pending.
