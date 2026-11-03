## Why

G3 plan item 20 (`docs/g3-plan.md`, row 20) needs the GitHub.com SCM plugin on the item 7 port, revised to version `0.2.0` by `revise-scm-port-refresh-and-authorization`. This third change of the item's split builds the plugin's core against a mocked GitHub API; live conformance against GitHub.com and the webhook receiver come in later sub-changes.

## What Changes

- New private package `@taskelith/scm-github` with its manifest and `registerGithubSourceControl`, implementing the draft `SourceControlProvider` `0.2.0` over one GitHub App installation: per-run installation tokens narrowed to the run's repositories and permissions, refresh, adoption, and revocation, which revoke ended tokens at GitHub; `authorization` as `Basic` of `x-access-token:<secret>` (Git workspace contract section 14); `resolveRemoteUrl`; pull requests; commit statuses; protected branches with `enforce_admins: true`; `required-status` review evidence (G3 plan D8 (a)); webhook verification by `node:crypto` HMAC-SHA256 over the raw bytes; API version `2022-11-28` on every request.
- Credential versions live in the plugin's memory only, a stated limitation: after a restart every earlier credential is unknown and fails with `not-found`; durable state waits for item 21.
- `@octokit/core@7.0.8`, `@octokit/auth-app@8.3.1`, and `@octokit/plugin-paginate-rest@16.0.0` installed exact-pinned in the plugin; `@octokit/webhooks-methods` is not installed. The dependency register rows and the regenerated inventory record them.
- Plugin API `0.3.0`: the plugin SDK re-exports the SCM port's types only in a type-only `draft` namespace, outside the frozen root export; the OpenSpec plugin's range becomes `^0.3.0`; a root test checks that every bundled manifest accepts the SDK's version.
- A redaction rule for `Basic` credentials after an `Authorization` header name, as Git's `http.extraHeader` carries them, in the shared `SECRET_SHAPE_RULES`, used by log redaction and `@taskelith/secrets`.
- The SCM conformance suite probes that a refresh or a revocation of a revoked or an unknown credential fails with `not-found`, with defective fakes that it reports.

## Capabilities

### Modified Capabilities

- `scm-port`: the GitHub plugin's credentials, merges, webhooks, and in-memory credential state; refresh and revocation of a missing credential and the suite's probe of it.
- `plugin-registration`: plugin API `0.3.0`, the draft SCM port in a `draft` namespace, and bundled manifests that accept the SDK's version.
- `execution-observability`: log redaction of `Authorization: Basic` credentials.
- `installation-enrollment`: secret scrubbing of `Authorization: Basic` credentials.

## Impact

- Code: `packages/plugins/scm-github` (new), `packages/plugin-sdk`, `packages/plugins/sdlc-openspec`, `packages/modules/integrations` (suite cases and test fake), `packages/modules/observability` (rule), tests in `packages/adapters/secrets` and `test/plugin-manifests.test.ts`.
- Dependencies: three Octokit packages and their tree in `package-lock.json`; `docs/dependencies.md`, `docs/g3-dependencies.md` section 6, and the inventory under `docs/dependencies/`.
- Docs: `docs/contracts/source-control.md` sections 2, 3, 7, 8, 9, and 10; `docs/contracts/installation-and-enrollment.md` section 8; `docs/architecture.md` package layout.
- No OpenAPI, wire, migration, or published `taskelith` package change.
