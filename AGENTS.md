# Taskelith contributor instructions

## Identity and language

- Product: Taskelith. Repository, npm package, and CLI: `taskelith`.
- All repository content, documentation, comments, specifications, issues, commits, and pull requests must be English.
- Chat, progress updates, reports, and final answers addressed to the owner must be Bulgarian. Preserve exact technical identifiers.

## Scope and architecture

- Implement only the requested work. The architecture plan is a roadmap, not blanket implementation authorization.
- Product-owned code is TypeScript. Do not introduce Go code or a Go bridge.
- Follow [docs/architecture.md](docs/architecture.md): hexagonal modules, explicit ports/adapters, and established OSS dependencies.
- Design and review every change against the first-class principles in [ADR 0004](docs/decisions/0004-first-class-engineering-principles.md): Clean Code, SOLID, hexagonal architecture, microkernel, Docker, contract-first OpenAPI, Makefile-driven operation, a mandatory SDLC framework with OpenSpec as the default, and code coverage of at least 75% of lines, branches, and functions.
- A code comment is at most two lines of at most 80 characters each (owner rule, 2026-10-24). Count every line of the comment, including the `/**` and `*/` lines of a block comment, and count indentation and the comment marker; a trailing comment counts its whole physical line. The rule applies to every comment in tracked authored source, script, build, and configuration files (`*.ts`, `*.mts`, `*.cts`, `*.js`, `*.mjs`, `*.cjs`, `*.sh`, `*.yml`, and `*.yaml` files, files named `Makefile` or `Dockerfile`, and extensionless scripts), whether or not a change's diff touches it. Generated files (written by a tool, never edited by hand), lockfiles, captured third-party artifacts under `docs/qualification/`, and fixture copies of those captures, for example the SpecKit plugin's byte-for-byte copy, are exempt. `make verify` enforces the rule through `npm run verify:comments`.
- Keep bootstrap status honest; do not expose commands that imply unimplemented orchestration.

## SDLC

- Every agent task must be tracked through the selected SDLC framework, including docs and maintenance.
- Every task that develops Taskelith is bound to a change of the selected SDLC framework, without exception. OpenSpec is the default and the framework of this repository until a project-maintainer selects another ([ADR 0004](docs/decisions/0004-first-class-engineering-principles.md) principle 8 as amended by [ADR 0008](docs/decisions/0008-product-ui-and-integration-authority.md)). Every project, Taskelith included, selects its framework through replaceable SDLC plugins.
- Use the pinned local CLI through `npm run openspec -- ...`.
- Record scope, requirements, verification evidence, and remaining gates. Do not claim independent review or deployment validation that did not occur.
- Follow the [independent review process](docs/governance.md#independent-review-process): authorized read-only reviewers, two reviewers of different harnesses per task (A for passes 1 and 3, B for pass 2) with a replacement when a reviewer is unavailable, at most three passes, and Low-only passes fixed without another review.
- Since 2026-10-26 a session develops each task in a subagent it briefs and checks ([subagent execution](docs/agent-task-protocol.md#subagent-execution)).
- When several agent sessions work in parallel, follow the [agent task protocol](docs/agent-task-protocol.md): workers develop, archive on their own branch, and hand off one task at a time, and the coordinator integrates it into `dev` with one pull request. A session whose context approaches 150,000 tokens tells the owner and recommends `/compact` or `/clear` ([context size](docs/agent-task-protocol.md#context-size)).
- Publication and deployment require owner authorization. The initial repository/package publication is explicitly authorized by the bootstrap request.

## Checks and commits

- Run `make setup` once per worktree (it installs the dependencies and enables the hooks, which are shared repository configuration); `make doctor` checks the environment. `make verify` must pass before every push except one that only deletes remote refs; the `pre-push` hook enforces it.
- Develop each change on its own feature branch in its own git worktree, so changes can proceed in parallel, and target `dev`, the default branch. Only promotion pull requests from `dev` target `main` (see [docs/releases.md](docs/releases.md)).
- Inspect the actual package tarball before publishing; never include credentials or local state.
- Use conventional commit messages without attribution or session trailers.

## Automated release policy

- Follow [docs/releases.md](docs/releases.md) for commit classification and publishing.
- The owner authorizes automatic releases from main after all verification gates pass.
- Do not manually bump package versions or introduce npm publish tokens.
