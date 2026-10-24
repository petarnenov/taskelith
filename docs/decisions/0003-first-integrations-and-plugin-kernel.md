# ADR 0003: First integrations, closed-harness scope, and plugin microkernel

Date: 2026-10-24
Status: Decisions made by the owner on 2026-10-24 in the project conversation; decisions 9 to 11 were added later the same day. Recording, independent review, implementation, and qualification are pending.

## Context

The architecture required an open-source first harness, a second harness, and a self-hostable SCM, and it excluded mandatory closed providers. The [candidate assessment](../integration-candidates.md) set out options. The dependency inventory left two open questions: whether the license-coverage evidence is sufficient, and how to treat the bundled release-tool advisories.

## Decisions

1. **Agent harnesses.** The owner selected Claude Code, OpenAI Codex CLI, Antigravity CLI (`agy`), and OpenCode, to be delivered in that order. Claude Code is the first real harness (G3). Codex is the second (G4). Antigravity and OpenCode follow as additional plugins. Exact versions are pinned at qualification.
2. **Scope change for closed harnesses.** Closed-source harnesses and closed model providers are admissible as full harness integrations on equal terms with open-source ones. For agent harnesses and their model providers, this replaces the rule that the baseline must have no mandatory closed provider. All other parts of the open-source policy are unchanged: infrastructure, storage, messaging, the SDLC framework, and build tooling. Each closed harness still needs recorded license terms, provider dependency, data-handling terms, version, maintenance, and security evidence before admission.
3. **SCM.** Forgejo is the first SCM integration. The line and version are chosen at qualification, with an LTS line preferred. (Superseded on 2026-10-24 by [ADR 0006](0006-github-first-scm.md): GitHub.com is the first SCM, and Forgejo a later second SCM plugin.)
4. **Telemetry.** A component whose telemetry is on by default is admissible if the telemetry can be disabled by configuration, and a network-egress test confirms the configuration works.
5. **Open-core.** A component whose vendor also sells a proprietary edition is admissible if every feature Taskelith requires is in the open-source edition.
6. **License coverage evidence.** For development and release tooling, the `notice-only` and `declaration-only` evidence recorded in the [license reviews](../dependencies/license-reviews.json) is sufficient.
7. **Release-tool advisories.** The `ip-address` and `undici` findings bundled in npm 11.21.1 (through `@semantic-release/npm@13.2.0`) and npm 12.2.1 (the CI pin) are accepted as a time-bounded exception. The exception ends when an npm release that bundles fixed versions is available. Remediation then becomes a tracked change. The exception covers only these findings in development and release tooling, not shipped runtime code.
8. **Hexagonal microkernel.** Harnesses, SCM providers, SDLC frameworks, and similar integrations are plugins on a small kernel:
   - The kernel and application modules depend only on ports and declared capabilities.
   - No kernel or module code, type, configuration schema, or test names a specific harness, provider, or SCM.
   - Each integration is a separately versioned package with a manifest. It registers through the composition root.
   - Adding or removing an integration changes only that package and the composition root's pinned plugin list. Data bound to a removed plugin stays readable, and its in-flight work is drained or rejected, never silently rebound.
   - Startup registration of pinned packages stays in force; this decision does not authorize hot reload or a remote marketplace.
9. **License diligence during development.** Until G8, a license name and one official source suffice as license evidence for candidates and dependencies. Checking the LICENSE file at a release tag for each candidate and manual per-package license review are not required. The automated dependency inventory check stays in force. G8 requires a full license audit before the first product release. This does not relax the closed-harness record requirements in decision 2.
10. **Non-telemetry vendor traffic during development.** Until G8, documented outbound traffic to a harness vendor that is not telemetry, such as feature-flag checks, is acceptable. The network-egress test records every such destination. G8 decides whether it stays acceptable for release.
11. **External approvals for every harness.** A harness plugin must answer native permission requests from an external client, comparable to the Claude Code and Codex mechanisms. Running a harness only under pre-set policy is not accepted as the target. For Antigravity CLI 1.4.7, whose headless mode soft-denies approval requests, finding a suitable mechanism is part of its plugin qualification.

## Consequences

The architecture, README, dependency register, inventory, and foundation ledger are updated to match. The first-harness capability contract and conformance suite must be written for the port, not for Claude Code, and checked against Codex before the port is frozen. Closed harnesses bring vendor accounts, credentials, and terms of service into worker execution. The [trust model](../trust-model.md) already scopes provider credentials per workspace. (Note, 2026-10-24: [ADR 0005](0005-harness-subscription-account-pools.md) replaces this for harness provider credentials with per-slot subscription credentials injected per run.) Self-hosting of the control plane, storage, and messaging is unchanged. None of these decisions qualifies a component or claims that any integration works.
