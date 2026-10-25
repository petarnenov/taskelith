# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work item 18 in [docs/g2-plan.md](../../../docs/g2-plan.md), assigned by the coordinator under the agent task protocol. The branch was created from `origin/dev` at `a1a27a1`, which contains items 6, 7, 10, and 11. Scope: the Scheduling domain, ports, in-memory adapters, conformance suites, and application services for resource admission; the second `@taskelith/postgres` migration and the repositories of the capacity ports; integration tests against PostgreSQL; and provisional values in `docs/operational-targets.md` and the capacity contract. The change adds the `resource-admission` capability.

The coordinator decided the design questions before implementation: Scheduling owns narrow read ports for workers, installation, quotas, lineage, and the ledger, with lineage, charges, delegations, and quotas as its own tables and minimal `workers` and `installation` tables that item 13 owns and extends (Q1 a); delegation admission is a Scheduling service called in the creating transaction (Q2 a); and the author's defaults, including the provisional bounds, which are to be recorded in the operational targets.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: pure decision functions with one check each, application services that read, decide, and write in that order, and comments only for rationale and contracts.
- SOLID and hexagonal architecture: the decisions are pure domain; the services depend on Scheduling's ports only; `@taskelith/postgres` implements them; the boundary check passes.
- Microkernel: no harness, provider, or vendor is named; provider credentials stay an empty list in G2.
- Docker and Makefile: the integration tests run against the digest-pinned PostgreSQL of the Compose project through `make test` and `make verify`.
- OpenAPI: no wire contract changes; the command payloads are marked provisional until item 8.
- OpenSpec: this change tracks the work; strict validation passes.
- Coverage: every new Scheduling module has 100% line coverage; branch coverage is 80% for the service, 88.89% for the fair order, and 93–100% elsewhere.
- Dependencies: none added.

Evidence check: the reasons, budgets, and transaction steps follow [the capacity reservation contract](../../../docs/contracts/capacity-reservation.md) sections 2 to 7 and 11, and the owner decisions D-A, D-B, and D-C recorded in the archived `define-capacity-reservation-contract` change. One deviation from the brief: the coordinator accepted "full jitter" for the backoff, but full jitter can wait less than the contract's initial `5s`, so each delay is the doubling base plus jitter of up to one more base below the `60s` cap, which keeps it within `[5s, 60s]`.

## Checks

Environment: macOS (Darwin 25.6.0, arm64), Node v24.22.1, npm 12.2.1 (through `make verify`), Docker Engine 29.6.1, Docker Compose v5.2.0, PostgreSQL 18.6 from the pinned image.

On `28338ff`: `make verify` passed: comment rule, workspace package contract and boundary checks, 540 tests (including 15 resource admission and 13 capacity conformance integration tests), coverage 99.70% lines, 95.97% branches, 99.56% functions, contract compatibility, the dependency inventory (710 package paths), strict OpenSpec validation (45 items), the archive dry run, and package verification.

## Independent review

Assigned reviewer: Claude Code with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt on stdin, run from the worktree; prompt and output files were kept outside the worktree.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- Items 13, 20, and 21 do not yet write the workers, installation, and delegation records; tests seed them.
- The scheduling loop that drives waiting tasks and picks candidate workers, and refusal handling, belong to later items.

## Remaining gates

Independent review; integration into `dev` and archive by the coordinator; promotion to `main`.
