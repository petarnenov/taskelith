## Context

The `execution` and `worker-journal` fixtures export `value` with the same message as the harness's `value`, and identical failure helpers named `failureOf` and `failed`. `worker-journal` already depends on the harness; `execution` does not. The conformance `must` helpers under `src/` stay, because product sources may not import the harness.

## Goals / Non-Goals

Use the harness helpers in the `execution` and `worker-journal` tests without changing what they check. Out of scope: the `@taskelith/sdlc` tests, the `code` helpers, and other refactors.

## Decisions

- The shared failure helper is named `failed`, matching `value` as a short verb-like name; `failureOf` call sites are renamed.
- `@taskelith/sdlc` is left out, as the coordinator decided: `@taskelith/testing` has a development dependency and a tsconfig reference on `@taskelith/sdlc` for `import type { Clock }` in `packages/testing/test/simulated-host.test.ts`. The workspace contract makes tsconfig references equal dependencies, so the reverse dependency would be a project-reference cycle.

## Risks / Trade-offs

`@taskelith/execution` gains a development dependency on the harness; the harness does not depend on it, so no cycle forms.
