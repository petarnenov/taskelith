## Context

The resource admission review counted `value`, `must`, and `id` in four files. `value` and `id` are test helpers. `must` lives in the shared conformance suites under `packages/modules/*/src/ports/`, which are product sources: the boundary check (R03) and the "Test-only harness package" requirement forbid them to import `@taskelith/testing`.

## Goals / Non-Goals

Move the duplicated `value` and `id` test helpers of `@taskelith/postgres` and `@taskelith/scheduling` into the harness without changing what the tests check. Out of scope: the `must` helpers of the conformance suites, identical helpers in other packages, other refactors, and the duplicated `readdir` in `migrations.ts`.

## Decisions

- One `value<T, E>` for any error type, with the most informative of the existing messages, `expected success, got <failure as JSON>`, so that call sites with a non-`Failure` error can share it later.
- `id` is a function with an explicit `Identifier<Kind>` return type, matching the harness's exported-API style.
- Call sites that wrote `value(parseIdentifier(...))` without a local `id` stay as they are; only the local definitions are removed.

## Risks / Trade-offs

A test that fails now prints the failure as JSON instead of its message alone; the message stays part of the JSON. `@taskelith/scheduling` gains a development dependency on the harness; the harness does not depend on it, so no cycle forms.
