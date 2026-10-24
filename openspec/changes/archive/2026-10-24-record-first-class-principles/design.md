## Context

Hexagonal architecture and the microkernel were already recorded (architecture section 6, ADR 0003). Docker, OpenAPI, SOLID, Clean Code, and Makefile had no project-level rule, and AGENTS.md called OpenSpec a bootstrap choice that is not a permanent core dependency.

## Goals / Non-Goals

Record each principle as a checkable rule with its scope and limits. Do not add the Makefile, images, contracts, or lint tooling here; do not select dependencies.

## Decisions

- State each principle as concrete rules a reviewer can check, and name existing enforcement where it exists (`scripts/check-boundaries.ts`).
- Keep macOS workers native and Kubernetes optional, which the owner's Docker scope allows.
- Separate mandatory OpenSpec for developing Taskelith from the product's per-project framework choice, as the owner clarified, so the replaceable-framework architecture stays.
- List implementation as follow-up OpenSpec changes rather than claiming it.

## Risks / Trade-offs

Rules without automation depend on review until lint, contract, and container tooling exist. Docker as the primary path adds image maintenance and digest updates to every release.
