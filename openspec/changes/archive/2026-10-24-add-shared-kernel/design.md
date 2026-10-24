## Context

Architecture section 6 lists the kernel's content: opaque identifiers, basic error vocabulary, and stable event metadata; domain-specific state machines belong to their owning module. Section 9 lists the fields of commands and events on the wire. ADR 0003 decision 8 keeps the kernel free of harness, provider, and SCM names. G1 item 1 creates the workspace and forbids kernel source from importing any `@taskelith/*` package, anything outside `packages/kernel`, or an infrastructure SDK.

## Goals / Non-Goals

Goals: the shared types that items 4, 6, and 7 need, with validating constructors and full test coverage.

Non-goals: module identifiers (`TaskId`, `WorkflowRunId`, and so on), state machines, command envelopes, wire schemas (G1 item 13), plugin registration (item 8), and identifier or clock adapters.

## Decisions

1. **Identifier generation stays behind a port, outside the kernel.** The kernel only validates and brands identifiers; it reads no clock and no random source. A module that creates identifiers or timestamps declares a port for it when its first use case needs one, and an adapter implements it, for example with `crypto.randomUUID`. Domain code and tests stay deterministic, because a test passes fixed values. The kernel compiles with `"lib": ["ES2022"]` and `"types": []`, so neither Node nor DOM declarations are available to it; standard ECMAScript APIs such as `Date.now` and `Math.random` still type-check, so review enforces that the kernel does not call them.
2. **Opaque, permissive identifier format.** An identifier is 1–128 printable ASCII characters without whitespace (`\x21`–`\x7e`). This accepts UUIDs and native identifiers that plugins map to platform identifiers, and implies no structure that callers could parse. The length limit bounds storage and logs.
3. **One generic brand, kinds declared by owners.** `Identifier<Kind>` is a string branded with a kind, so a `TaskId` cannot be passed where a `WorkflowRunId` is expected. The kernel declares only the kinds its own event metadata uses (`EventId`, `CorrelationId`, `CausationId`); modules declare theirs, for example `type TaskId = Identifier<'TaskId'>`, and construct them with `parseIdentifier('TaskId', text)`.
4. **Failure is data, not an exception class.** `Failure` holds a stable code, a human-readable message, and string details, and is frozen. Callers branch on the code, never on the message. Plain data crosses ports, serializes into events and API problems without a framework type, and carries no stack. Exceptions remain for programming defects. The codes are `invalid`, `not-found`, `conflict` (for example a stale ownership generation, invariant 1), `precondition-failed` (for example a gate not passed, invariant 11), `forbidden`, `unavailable`, and `internal`. Adding a code is an additive change; renaming or removing one is breaking.
5. **Minimal result shape.** `Result<T, E = Failure>` is a discriminated union on `ok`. No combinators are added until a use case needs them.
6. **Event metadata fields.** Every event carries `eventId` (stable event identity, section 9), `eventType`, `schemaVersion` (section 9 versions messages), `occurredAt`, `correlationId` (section 9), and an optional `causationId` for the command or event that caused it; the first message of a chain has none. Attempt and ownership generation (section 9) describe execution events only, so they belong to the Execution module's events, not to the kernel. Per-producer sequence (section 9) can apply to any durable event stream; whether it becomes an optional kernel field or an envelope field is decided with the wire envelopes in G1 item 13, and the kernel omits it until then. `eventType` is at least two dot-separated segments of lowercase letters, digits, and inner hyphens, each starting with a letter, such as `sdlc.gate.passed`, at most 128 characters; the owning module chooses the first segment.
7. **Canonical UTC time.** `Instant` is the exact form `Date#toISOString` produces (`YYYY-MM-DDTHH:mm:ss.sssZ`), checked by a round trip, so equal instants are equal strings and impossible dates are rejected. `instantFromEpochMilliseconds` converts a time a clock port supplied; the kernel never reads the clock.
8. **The kernel validates values, not wire messages.** The constructors protect domain values. Wire messages are still validated against the generated OpenAPI and AsyncAPI schemas (ADR 0004 principle 6, G1 item 13).

## Risks / Trade-offs

- Brands are compile-time only; a cast can forge one. Constructors are the only sanctioned way to create branded values, and review checks for casts.
- The failure codes may prove too coarse. They are a small base; a module adds detail through `details` and may propose a new code through an OpenSpec change.
- `parseEventMetadata` reports only the first invalid field, which is enough for a programming or adapter error; wire validation reports all errors.
