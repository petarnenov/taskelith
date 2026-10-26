## Context

`abortableDelay` (`packages/adapters/nats/src/abortable-delay.ts`) adds an `abort` listener and a timer. An `AbortSignal` that has already aborted never dispatches `abort` again, so the delay ran its full length.

## Goals / Non-Goals

- Goal: a stop requested while a loop is between rounds ends the loop without the pause.
- Non-goals: any contract change, any requirement change beyond the stop of the publication loop, admission pressure and disk work (20e2), task 23b, changes to `apps/worker`, and the home cgroup layout, which moved to `harden-worker-linux-self-check-home-layout`.

## Decisions

- **D1: Settle at once on an aborted signal.** `abortableDelay` returns a resolved promise when `signal.aborted` is already true, before any timer or listener exists. This matches the existing abort path, which also resolves; callers check `signal.aborted` after the delay and stop. The `nats-transport` delta records the stop in "Outbox publication" only.
- **D2: Other callers without new requirements.** The validating consumer's pull loop and the quarantine capture loop, which fall under "Validation and quarantine", use the same helper, so they now also end promptly on a stop during a retry wait. No requirement is added for them, to keep the requirement change minimal.

## Risks / Trade-offs

- None known: every caller's loop checks `signal.aborted` after the delay, so resolving sooner only ends the loop sooner.
