# Taskelith contributor instructions

## Identity and language

- Product: Taskelith. Repository, npm package, and CLI: `taskelith`.
- All repository content, documentation, comments, specifications, issues, commits, and pull requests must be English.
- Chat, progress updates, reports, and final answers addressed to the owner must be Bulgarian. Preserve exact technical identifiers.

## Scope and architecture

- Implement only the requested work. The architecture plan is a roadmap, not blanket implementation authorization.
- Product-owned code is TypeScript. Do not introduce Go code or a Go bridge.
- Follow [docs/architecture.md](docs/architecture.md): hexagonal modules, explicit ports/adapters, and established OSS dependencies.
- Design and review every change against the first-class principles in [ADR 0004](docs/decisions/0004-first-class-engineering-principles.md): Clean Code, SOLID, hexagonal architecture, microkernel, Docker, contract-first OpenAPI, Makefile-driven operation, and mandatory OpenSpec.
- Keep bootstrap status honest; do not expose commands that imply unimplemented orchestration.

## SDLC

- Every agent task must be tracked through the selected SDLC framework, including docs and maintenance.
- OpenSpec is mandatory for every task that develops Taskelith, without exception ([ADR 0004](docs/decisions/0004-first-class-engineering-principles.md)). Projects managed by Taskelith select their own framework through replaceable SDLC plugins.
- Use the pinned local CLI through `npm run openspec -- ...`.
- Record scope, requirements, verification evidence, and remaining gates. Do not claim independent review or deployment validation that did not occur.
- Follow the [independent review process](docs/governance.md#independent-review-process): authorized read-only reviewers, one reviewer per task, at most three passes, and Low-only passes fixed without another review.
- Publication and deployment require owner authorization. The initial repository/package publication is explicitly authorized by the bootstrap request.

## Checks and commits

- Run `make hooks` once per clone. `make verify` must pass before every push; the `pre-push` hook enforces it.
- Develop on feature branches that target `dev`, the default branch. Only promotion pull requests from `dev` target `main` (see [docs/releases.md](docs/releases.md)).
- Inspect the actual package tarball before publishing; never include credentials or local state.
- Use conventional commit messages without attribution or session trailers.

## Automated release policy

- Follow [docs/releases.md](docs/releases.md) for commit classification and publishing.
- The owner authorizes automatic releases from main after all verification gates pass.
- Do not manually bump package versions or introduce npm publish tokens.
