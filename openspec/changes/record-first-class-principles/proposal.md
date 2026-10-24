## Why

On 2026-10-24 the owner directed that Clean Code, Docker, OpenAPI, SOLID, hexagonal architecture, the microkernel, Makefile-driven operation, and mandatory OpenSpec be first-class, and that all design be done against them. The owner confirmed the scope of Docker (images for every runnable component, Compose, containerized CI, native macOS workers) and OpenAPI (contract-first OpenAPI 3.1 with generation and breaking-change checks, AsyncAPI for messages), and limited mandatory OpenSpec to developing Taskelith itself.

## What Changes

- Add ADR 0004 recording the eight principles, their scope, and their follow-up work.
- Update the architecture (direction, SDLC selection and governance sections, section 15, API contracts, installation composition), AGENTS.md, the governance policy, README, the foundation ledger, ADR 0001 (a dated note), the trust model, the worker platform contract, and the operational targets.

## Capabilities

### New Capabilities
- `engineering-principles`: Owner-decided first-class principles that every design, change, test, and review is checked against.

### Modified Capabilities

None.

## Impact

Documentation only; no runtime, CI, or package impact. The Makefile, container images, API contracts, and lint tooling are follow-up changes.
