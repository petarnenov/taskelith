# ADR 0004: First-class engineering principles

Date: 2026-10-24
Status: Decided by the owner on 2026-10-24 in the project conversation; principle 9 was added the same day and is enforced in `make verify`. Recorded; container images and API contracts do not exist yet.

## Context

The owner directed that eight principles be first-class, and later the same day added a ninth (code coverage), in Taskelith and that all design be done against them. The architecture already required hexagonal modules and, since [ADR 0003](0003-first-integrations-and-plugin-kernel.md), a plugin microkernel. The other principles were implicit or absent: the architecture named no container, API-contract, or task-runner policy, and the repository instructions called OpenSpec a bootstrap choice that is "not a permanent core dependency".

## Decisions

Every design, code change, test, and review is checked against all nine principles. A change that cannot meet one records the conflict and asks the owner, rather than silently exempting itself.

1. **Clean Code.** Code and tests are written for local reasoning: precise names, small single-purpose functions, explicit mutation, isolated error handling, and comments only for rationale or contracts. Review checks it. Automated lint rules are selected later through the dependency policy.
2. **SOLID.** Modules have one reason to change. Integrations extend the product through plugins, not kernel edits. Every adapter of a port passes that port's shared conformance suite, so adapters are substitutable. Ports stay small and specific to their clients. Application code depends on ports, never on adapters.
3. **Hexagonal architecture.** The domain core and application modules depend only on ports. Adapters, framework, persistence, transport, and vendor details stay outside them, and the composition roots wire them. `scripts/check-boundaries.ts` enforces the import boundaries in `npm test`.
4. **Microkernel.** The rules of ADR 0003 decision 8 apply to every integration type: harnesses, SCM providers, SDLC frameworks, and similar plugins.
5. **Docker.** Every runnable Taskelith component and its infrastructure ships as an OCI image pinned by digest: the control plane and its roles, PostgreSQL, NATS, Neo4j, the embedding service, and Linux workers. Docker Compose is the primary development and small-installation path. CI runs its checks in containers. On Linux workers each harness runs inside the worker image; the Claude Code qualification showed that a harness's self-update can write outside its configuration directory. macOS workers run natively, because macOS has no native containers. Kubernetes stays optional.
6. **OpenAPI.** Every HTTP API, including the control-plane API used by the SPA and external clients, is contract-first: a versioned OpenAPI 3.1 document is written and reviewed before the implementation. TypeScript types, runtime request and response validation, and clients are generated from it. CI fails on an unversioned breaking change. Messages over NATS follow the same contract-first rule with AsyncAPI documents.
7. **Makefile.** Every operation is run and managed through `make` targets: setup, build, test, checks, dependency inventory, OpenSpec validation, package verification, container build and run, and qualification runs. CI calls the same targets. npm scripts may remain the implementation behind a target, but documentation and CI invoke `make`.
8. **Mandatory OpenSpec for Taskelith development.** Every task that develops Taskelith itself goes through an OpenSpec change, without exception: features, fixes, documentation, tests, maintenance, dependencies, infrastructure, qualification, and emergencies. This applies only to the development of Taskelith. Each project that Taskelith manages selects its own spec-driven framework, such as OpenSpec or SpecKit, through the replaceable SDLC framework plugins.
9. **Code coverage of at least 75%.** Added by the owner on 2026-10-24. Automated tests cover at least 75% of lines, branches, and functions. `make verify` enforces the thresholds with Node's built-in test coverage over the compiled product code in `dist/` alone, so that well-tested repository scripts cannot mask low product coverage, and fails when a product module under `src/` is missing from the coverage report, because the built-in coverage counts only modules that tests load.

   Amendment, 2026-10-24: after the owner chose npm workspaces for the code layout ([G1 work plan](../g1-plan.md), decision D1), the same rule covers every workspace package. Coverage is measured over the compiled code in `dist/` of the root package and of each workspace package, still without repository scripts, and the scope check covers the modules under `src/` of each.

## Consequences

The architecture, repository instructions, governance policy, README, and foundation ledger are updated to match. This ADR does not implement anything. Follow-up changes, each tracked through OpenSpec:

- Add a `Makefile` that wraps the existing npm scripts, switch CI and the documentation to `make` targets, and move the qualification probe behind a target once the agent port exists.
- Add container images and a Compose file when the first runnable component exists (G2), and run CI checks in containers.
- Write the first OpenAPI and AsyncAPI contracts with the G1 wire schemas, and select generators and a breaking-change checker through the dependency policy.
- Select lint tooling for Clean Code rules through the dependency policy.
