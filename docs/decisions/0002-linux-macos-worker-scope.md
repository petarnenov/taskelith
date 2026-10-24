# ADR 0002: Linux and macOS workers

Date: 2026-10-24
Status: Initial OS-family scope accepted by the owner; design contract independently reviewed by a separate Codex reviewer agent (`gpt-6.1-sol`, `effort: medium`) on 2026-10-24; implementation and native acceptance pending.

## Context

The architecture proposed Linux first and left the initial worker matrix to the owner. The owner explicitly selected Linux and macOS in the project conversation. Both become initial delivery obligations rather than treating macOS as a developer-only host.

## Decision

Target Linux and macOS workers through the same versioned remote protocol, shared TypeScript application logic, and explicit native adapters. Worker support includes enrollment, journals, launch authorization, stable execution identity/adoption, cancellation, resource admission, drain, and upgrade/recovery on each selected platform. Windows is outside the initial scope.

Do not infer control-plane hosting on macOS from the worker choice. A macOS worker connecting to a Linux-hosted control plane is sufficient for this scope. Exact OS/distribution releases and CPU architectures require qualification before a supported-version matrix is frozen. The owner selected families, not every version or processor combination.

## Consequences

Both platforms require native failure drills and service-lifecycle evidence in [worker acceptance](../worker-platforms.md). Shared unit tests and the current macOS bootstrap tests do not satisfy those gates. Infrastructure editions and agent/model binaries must also support the selected worker environment. [Storage conventions](../storage.md) specify future roots without introducing runtime commands.

The selected scope supersedes the Linux-only proposal in architecture sections 2, 13, and 15. Historical bootstrap and inventory verification records retain their original limits. Independent review of the design contract was completed on 2026-10-24; integration and native qualification remain pending. Note, 2026-10-24: this ADR was later integrated through pull request #3; native qualification remains pending. [ADR 0007](0007-g0-closure.md) set the initial matrix (Linux x86_64 and arm64 in the worker image; macOS on Apple Silicon and Intel).
