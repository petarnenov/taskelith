## Context

`abortableDelay` (`packages/adapters/nats/src/abortable-delay.ts`) adds an `abort` listener and a timer. An `AbortSignal` that has already aborted never dispatches `abort` again, so the delay ran its full length.

## Goals / Non-Goals

- Goal: a stop requested while a loop is between rounds ends the loop without the pause.
- Non-goals: any contract or requirement change, admission pressure and disk work (20e2), task 23b, changes to `apps/worker`, and the home cgroup layout, which moved to `harden-worker-linux-self-check-home-layout`.

## Decisions

- **D1: Settle at once on an aborted signal.** `abortableDelay` returns a resolved promise when `signal.aborted` is already true, before any timer or listener exists. This matches the existing abort path, which also resolves; callers check `signal.aborted` after the delay and stop. No spec delta: no requirement states stop latency.

## Risks / Trade-offs

- None known: every caller's loop checks `signal.aborted` after the delay, so resolving sooner only ends the loop sooner.
