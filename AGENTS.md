# Taskelith contributor instructions

## Identity and language

- Product: Taskelith. Repository, npm package, and CLI: `taskelith`.
- All repository content, documentation, comments, specifications, issues, commits, and pull requests must be English.
- Chat, progress updates, reports, and final answers addressed to the owner must be Bulgarian. Preserve exact technical identifiers.

## Scope and architecture

- Implement only the requested work. The architecture plan is a roadmap, not blanket implementation authorization.
- Product-owned code is TypeScript. Do not introduce Go code or a Go bridge.
- Follow [docs/architecture.md](docs/architecture.md): hexagonal modules, explicit ports/adapters, and established OSS dependencies.
- Keep bootstrap status honest; do not expose commands that imply unimplemented orchestration.

## SDLC

- Every agent task must be tracked through the selected SDLC framework, including docs and maintenance.
- OpenSpec is selected for the initial bootstrap. It is not a permanent core dependency; the planned runtime supports interchangeable frameworks.
- Use the pinned local CLI through `npm run openspec -- ...`.
- Record scope, requirements, verification evidence, and remaining gates. Do not claim independent review or deployment validation that did not occur.
- Publication and deployment require owner authorization. The initial repository/package publication is explicitly authorized by the bootstrap request.

## Checks and commits

- Run `npm test` and validate any changed OpenSpec artifacts.
- Inspect the actual package tarball before publishing; never include credentials or local state.
- Use conventional commit messages without attribution or session trailers.
