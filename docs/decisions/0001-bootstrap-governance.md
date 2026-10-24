# ADR 0001: Repository-governed bootstrap with OpenSpec

Date: 2026-10-24
Status: Accepted by the owner on 2026-10-24; independently reviewed by a separate Codex reviewer agent (`gpt-6.1-sol`, `effort: medium`) on 2026-10-24; integration remains pending.

## Context

The runtime cannot govern its own initial construction. Contributor instructions already select OpenSpec for bootstrap, while the architecture requires replaceable SDLC frameworks and explicit external authority.

## Decision

Keep OpenSpec 1.14.3 as a pinned development dependency and use version-controlled native change artifacts with [policy version 1](../governance.md). Owner scope, author verification, independent review, acceptance, integration, and release remain distinct records. The repository workflow does not require PostgreSQL, a worker, or a running admission service.

## Consequences

Bootstrap tasks can proceed with auditable artifacts. CLI validation checks structure and does not grant semantic approval. OpenSpec commands and document checkboxes are not a runtime security boundary. Runtime ports must remain framework-neutral; both OpenSpec and SpecKit native workflow fixtures must be examined before the G1 port is frozen.

This decision does not qualify either framework's maturity, select runtime integrations, or establish G0 completion. Those gates remain in the foundation checklist. Replacing the selected repository framework requires an explicit tracked policy decision and preservation of prior evidence.

Note, 2026-10-24: [ADR 0004](0004-first-class-engineering-principles.md) makes OpenSpec mandatory for developing Taskelith without exception, beyond bootstrap. Runtime ports stay framework-neutral, and managed projects select their own framework.
