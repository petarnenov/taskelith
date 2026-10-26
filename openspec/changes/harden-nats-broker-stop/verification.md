# Verification

Date: 2026-10-26. Author verification is recorded below; the review section is left for the session.

## Scope and source

A stop that waits a full idle poll because `abortableDelay` ignores an already aborted signal, assigned by the coordinating session, which briefed an implementation subagent that wrote this change.

- Base revision: `311c40d` on `dev`; branch `harden-worker-linux-and-broker-stop`.
- Split: the change was first assigned as `harden-worker-linux-and-broker-stop`, which also covered excluding the worker's home cgroup from the unrecorded-process scan. The contract states no rule for that, so no code was written for it. Under away run `20261026T130340Z-opencode-33653`, the coordinator, as the owner's delegate, chose option A (a self-check refusal) and moved it to its own change, `harden-worker-linux-self-check-home-layout`; this change was renamed `harden-nats-broker-stop`.
- Out of scope: contracts (`docs/contracts`, AsyncAPI, OpenAPI), requirement changes beyond the stop of the publication loop, admission pressure, disk and backlog work (20e2), task 23b, and `apps/worker`.

## Evidence

- Environment: Ubuntu 24.04.5 LTS, Linux 6.8 x86_64, Node v24.22.0, Docker 27.3.1 for `make verify`.
- Dependencies: none added.
- Files outside tests: `packages/adapters/nats/src/abortable-delay.ts` only.

## Author self-check

- **Failure before the fix (not committed):** with `abortableDelay` restored to `311c40d`, the new test `a stop during an idle publication round ends the loop without the pause` failed with `'paused' !== 'ended'`: the loop was still waiting on its timer after the next event-loop turn.
- **After the fix:** the same test passes. It mocks `setTimeout`, so neither result depends on wall-clock time.
- **Callers:** `runPublicationLoop`, the validating consumer's pull loop, and the quarantine capture loop each check `signal.aborted` after the delay, so resolving at once only ends them sooner.
- **Comment rule:** `npm run verify:comments` passes as part of `make verify`.
- **Evidence check:** not applicable. The change's artifacts (`proposal.md`, `design.md`, `tasks.md`, this file, and the `nats-transport` delta) contain no external link (a search for `http` finds none), and the code change cites no external source; only repository paths are named.
- **OpenSpec:** `npm run openspec -- validate harden-nats-broker-stop --strict` passes with the `nats-transport` delta (design D1).

## Checks

- `make verify` at `54ebd74` (before review): passed in 179 s (1704 tests, 1688 pass, 0 fail, 0 cancelled, 16 skipped macOS-only tests; coverage 99.18% lines, 91.76% branches, 98.81% functions; archive dry run and package verification passed).
- `make verify` at `REVISION` (after the pass 1 fixes): RESULT

## Review pass 1

Codex CLI v0.163.0, invoked as `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`; the header confirmed model `gpt-6-astra`, reasoning effort `medium`, sandbox `read-only`; session `01a17858-bda1-7ea0-bfee-51fac3930227`. Reviewed revision `94776e5`, run 15:14:02 to 15:15:29 local time on 2026-10-26. The snapshot was identical before and after the pass (`6f30795545665da686b700ea856c53dab1e65e26552d02d46b6f0b64fea1112c`). The reviewer confirmed that the fix is correct for all three callers (no busy loop, no missed final work) and that the test fails without the fix. It did not run `make verify`, and the sandbox blocked its re-check of the comment rule. Findings: 0 Critical, 0 High, 1 Medium, 1 Low.

- **M1 (fixed, `FIXREV`):** `skip_specs: true` is allowed only for documentation-only work, and this change alters runtime behaviour. `skip_specs` was removed and a `nats-transport` delta modifies "Outbox publication": one sentence ("A stop SHALL end the publication loop without waiting for the next poll.") and the scenario "Stop during a publication round", with the existing text and scenarios copied unchanged. The validating consumer and quarantine loops, under "Validation and quarantine", get no new requirement; design D2 records that the same helper ends them promptly.
- **L1 (fixed, `FIXREV`):** the evidence check was not recorded. It is now recorded in the author self-check as not applicable, with the reason.

## Review pass 2

TODO: the session decides whether a further pass is needed for M1.

## Limitations and remaining gates

- `make verify-linux-cgroup` was not run; no cgroup code changed.
- Independent review, integration, and archive are pending.
