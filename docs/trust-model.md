# G0 identity, enrollment, and trust boundary contract

Status: selected G0 design contract for future G2–G3 implementation; runtime authentication, enrollment services, and worker daemons are not implemented yet.

## 1. Principals and identity hierarchy

Taskelith enforces explicit identity separation across every control-plane, broker, and worker boundary. No identity, credential, or session is imported from another installation or external cloud service.

| Principal / identity | Scope and lifecycle | Permitted authority |
| --- | --- | --- |
| `installationId` | Immutable global identifier created once during explicit control-plane bootstrap; paired with a monotonic `recoveryEpoch`. | Binds all databases, evidence stores, broker subjects, and enrolled workers to one installation. |
| Operator / user principal | Authenticated human principal managed via the replaceable `Access` authentication adapter; initial bootstrap creates the first `installation-owner` credential explicitly. | Performs interactive SPA/CLI/API actions according to assigned installation and project roles. |
| Worker principal (`workerId`) | Per-worker service identity established by exchanging a short-lived, single-use enrollment token; bound to `installationId` and credential generation. | Initiates outbound control-plane/broker/relay connections, polls addressed commands, requests launch authorization, and publishes observations for its own `workerId`. |
| Attempt launch authorization (`launchAuthId`) | Short-lived online token/grant issued transactionally by the control plane for a specific `(attemptId, workerId, executionId, ownershipGeneration, recoveryEpoch, artifactRevision, policyRevision)`. | Authorizes starting or adopting one admitted execution attempt within the declared clock-skew and expiry window. |

## 2. Installation bootstrap and disaster recovery authority

- **Explicit initialization:** A fresh control-plane installation generates a new `installationId`, initializes `recoveryEpoch = 1`, and outputs or provisions a one-time operator bootstrap credential. Starting a worker or CLI command never initializes a control-plane installation implicitly.
- **Operator recovery:** Operator credential reset requires direct administrative invocation against the control-plane host/storage boundary and records an immutable audit event; it never bypasses `recoveryEpoch` quarantine.
- **Restore quarantine (`recoveryEpoch`):** Restoring PostgreSQL enters quarantine with scheduler dispatch, command publication, and online launch authorization disabled. The operator fences any surviving old control-plane instance, increments `recoveryEpoch` using a durable record outside the rolled-back database snapshot (or forces explicit worker re-enrollment/reconciliation if unavailable), reconciles broker and worker journals against restored state, and explicitly lifts quarantine. Old-epoch launch tokens and stale ownership generations fail closed.

## 3. Project-scoped authorization roles

Every mutating command and query is authorized against `installationId`, `projectId`, and the caller's role before domain execution:

| Role | Scope | Capabilities |
| --- | --- | --- |
| `installation-owner` | Installation-wide | Manage installation settings, operator principals, worker enrollment/revocation/drain, disaster recovery quarantine, and project creation/deletion. |
| `project-maintainer` | Per project | Configure project defaults (including default SDLC framework and policy revisions), approve SDLC gates and framework migrations, manage project integrations, and perform all `project-operator` actions. |
| `project-operator` | Per project | Submit tasks, interact with sessions/turns, respond to native runtime permission/input requests for admitted attempts, and trigger cancellations or retries within project budgets. |
| `project-viewer` | Per project | Read project tasks, workflow stages, artifacts, evidence snapshots, and project-scoped knowledge records. |

Cross-project isolation is mandatory: knowledge retrieval (`Knowledge` module), artifact/evidence downloads (`EvidenceStore`), and session streams filter and authorize by `projectId` prior to returning results.

## 4. Worker enrollment, rotation, and revocation

- **Enrollment:** An `installation-owner` generates a short-lived, single-use enrollment token bound to expected host metadata/pool constraints. The worker presents this token over TLS to the control plane, which mints a unique `workerId` and per-worker credentials for the control plane and NATS subjects.
- **Subject and database isolation:** Workers receive no PostgreSQL or Neo4j credentials. Broker permissions scope each `workerId` strictly to its own command consumer subject and its own observation publication subject; Worker A cannot read Worker B's commands or publish events under Worker B's identity.
- **Credential rotation and revocation:** Worker credentials carry a generation number. Rotation issues a new generation and invalidates the predecessor after a bounded grace window. Revocation immediately denies new command fetches, online launch authorizations, and observation writes from the revoked credential. If a revoked worker had an active attempt, that attempt transitions to uncertain/unreachable ownership rather than being silently assumed dead or safe to auto-reassign.

## 5. Execution trust boundary and workspace credentials

- **Explicitly trusted enrolled hosts:** Initial Linux and macOS workers are operated on explicitly enrolled, trusted hosts (`docs/worker-platforms.md`). Linux workers and their harnesses run in the digest-pinned worker container image, and macOS workers run natively ([ADR 0004](decisions/0004-first-class-engineering-principles.md)). Protecting the control plane and broker does not turn either a worker container or a native worker OS user into a sandbox against arbitrary shell commands executed by an admitted agent harness; container isolation is not claimed as a security boundary until it is separately qualified.
- **Per-workspace credential scoping:** Workers must not expose installation-wide secrets, broker credentials, or another project's tokens to child agent processes. Git/SCM credentials injected into an attempt are scoped to the specific workspace/project; for the GitHub.com SCM they are GitHub App installation tokens limited to the project's repositories and delivered only to that run ([ADR 0006](decisions/0006-github-first-scm.md)). Harness provider credentials come from subscription account slots: each is scoped to its slot and the projects explicitly allowed for it, and is injected only for the run that reserved it ([ADR 0005](decisions/0005-harness-subscription-account-pools.md)). All of them are scrubbed from environment variables, logs, lessons, and error payloads by default.
- **Separation of approvals:** SDLC gate approval (`GateDecision`) authorizes lifecycle stage progression for exact artifact/code/policy revisions. Runtime native approval (`NativeApprovalRequest`) authorizes a specific tool/input request within one live attempt and provider generation. Neither implies the other.

## 6. Plugin trust and capability contract

- **Startup registration of pinned packages:** Plugins (`SdlcFramework`, `AgentHarness`, `SourceControlProvider`) are loaded at startup from pinned, reviewed packages declared in the composition root. Dynamic hot-reload, remote plugin marketplaces, and arbitrary directory scanning are prohibited.
- **Scoped SDK ports:** The `plugin-sdk` provides only the narrow outbound ports required by the plugin's declared role and capabilities. Plugins never receive the full dependency container, raw database connections, raw broker clients, or methods to self-authorize SDLC gates or alter ownership generations.
- **Honest isolation boundary:** In-process TypeScript plugins run with the privileges of their host process. Scoped SDK exports prevent accidental architectural coupling and enforce server-side authorization on worker observations, but they are not an OS sandbox against malicious in-process code. Supporting untrusted third-party extensions in the future requires an explicit out-of-process/container RPC boundary and adversarial verification (R04, R30).
