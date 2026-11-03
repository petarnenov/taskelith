## Context

G3 plan item 20 is split; this is its third change, `implement-github-scm-plugin-core`, briefed by the coordinator for the worker Zaki. The port is the draft `SourceControlProvider` `0.2.0` of `@taskelith/integrations` ([source control contract](/docs/contracts/source-control.md)); the GitHub facts come from the [GitHub qualification](/docs/qualification/github.md) and [ADR 0006](/docs/decisions/0006-github-first-scm.md), and the client from [G3 dependency evaluation](/docs/g3-dependencies.md) section 6. Out of scope: live conformance and its `make` target (20d), the webhook receiver and its dedupe migration (20e), delivery of credentials to runs and `scrubEnvironment` on that path (item 21), and any OpenAPI, wire, or migration change.

## Goals / Non-Goals

**Goals:** a plugin that passes the shared conformance suite against an emulated GitHub API, the SDK surface it builds against without freezing the port, the Octokit set at its pinned versions, and the redaction of the plugin's `authorization` form.

**Non-goals:** live GitHub calls or real credentials in tests; a composition root that registers the plugin; durable credential state.

## Decisions

### 1. Package and boundary

`packages/plugins/scm-github` mirrors `sdlc-openspec`: `GITHUB_PLUGIN_MANIFEST` (`id` `scm-github`, `pluginApiRange` `^0.3.0`, `port` `SourceControlProvider`, the port's own name, capability `required-status`) and `registerGithubSourceControl(host, options)`, which creates the provider only after `registerPlugin` admits the manifest. Its `src/` imports only the kernel, the plugin SDK, Octokit, and Node built-ins; `@taskelith/integrations` is a development dependency for the conformance suite in tests. `github-api.ts` is the only module that touches Octokit: the rest sees routes, plain data, and HTTP statuses. Failures carry GitHub's status, never its message (`github-data.ts`).

### 2. Draft port in the plugin SDK (Q1)

`packages/plugin-sdk/src/draft.ts` re-exports the SCM port's types from `@taskelith/integrations/port`, and the root export adds `export type * as draft`. Plugins write `draft.SourceControlProvider`; the root export holds no SCM type, and `draft` adds no runtime value. The port is not frozen and has no entry in `PLUGIN_API_PORT_VERSIONS`. Because the plugin API is below 1.0, a caret range accepts only its own minor version, so `PLUGIN_API_VERSION` becomes `0.3.0`, `sdlc-openspec` declares `^0.3.0`, and a change to the draft port needs another minor version. Promotion: when a second SCM maps onto the port and it is frozen, its types move to the root export with a recorded version, as ADR 0009 did for `SdlcFramework`. A subpath export such as `@taskelith/plugin-sdk/draft` was not chosen, because the workspace package contract allows only a root export, and a port entry for modules only.

### 3. Run credentials (Q2)

- **Narrowed tokens.** `installation-tokens.ts` checks that every requested repository is one of the installation's (`GET /installation/repositories`, read with `plugin-paginate-rest`), maps the port permissions to App permissions (`read-code` to `contents: read`, `write-code` to `contents: write`, `write-change-requests` to `pull_requests: write`, `write-statuses` to `statuses: write`), and requests a token with `repositories` and `permissions`. It reads the effective permissions back from GitHub's answer; a token whose repositories differ, that misses a requested permission, or that has `write-code` without a request is revoked at once and the call fails with `internal`.
- **Not through auth-app's cache.** `auth-app` signs the App JWT and supplies the plugin's own installation token, but run tokens are requested directly: `auth-app` caches installation tokens and shares one pending request among identical concurrent requests, so two runs with the same grant could get one token, which would break run isolation and let one revocation end the other.
- **Versions in memory.** `run-credentials.ts` keeps, per `credentialId` (a random UUID), the run, the effective grant, and each version's token until it ends. A refresh mints the next token for the same grant and requires the same effective permissions. An adoption confirmation revokes every earlier live token at GitHub (`DELETE /installation/token`, a 401 counting as already ended); a revocation revokes every live one and then forgets the credential. When GitHub does not confirm a revocation, the operation fails with `unavailable` and keeps that token for a retry; a credential being revoked no longer refreshes or confirms. A refresh that a revocation overtakes revokes its new token and fails with `not-found`.
- **Limitation, fail safe.** After a restart nothing is known: refresh, confirmation, and revocation of an earlier credential fail with `not-found` and never succeed, and its tokens end at GitHub's own expiry, an hour after issue. Ended versions are revoked at GitHub, so no token outlives the plugin's record beyond that expiry. Durable state waits for item 21.
- **Authorization.** `Basic ` and the base64 of `x-access-token:<secret>`, the form Git's HTTP transport accepts for an installation token (Git workspace contract section 14).

### 4. Change requests, protection, and merges

- `ensureMergeProtection` reads the branch's protection, keeps its required contexts, and writes protection with the union of contexts, `strict: false`, `enforce_admins: true`, and no review or push restrictions; `bindsProvider` is GitHub's `enforce_admins.enabled`. Writing the whole protection replaces an operator's review and push restrictions on that branch: the App cannot approve its own pull requests (D8 (a)), so a required approval would block every merge. A failed read leaves the protection unwritten.
- Pull request numbers are opaque strings; `merged_at` makes the state `merged`. A merge passes `sha` (the expected head) and `merge_method`; GitHub's 405 (protection) and 409 (head moved) become `precondition-failed`, and an undeclared method fails with `unavailable` before any request. The merge commit is GitHub's answer `sha`, the new base head.
- The installation's merge methods are configuration (`mergeMethods`), because the repository settings decide which ones GitHub allows.

### 5. Webhooks (Q3)

`verifyWebhookDelivery` checks `X-Hub-Signature-256` (`sha256=` and 64 hexadecimal digits) by computing HMAC-SHA256 with `node:crypto` over the raw body bytes and comparing the digests with `timingSafeEqual` after a length check; the body is never turned into text for this. Only then is the body decoded (strict UTF-8) and parsed. `X-GitHub-Delivery` is taken as a string, so identifiers above 2^53 stay exact (qualification finding). `pull_request`, `status`, and `push` map to `change-request`, `commit-status`, and `push`; any other event is `other`. `@octokit/webhooks-methods` is not installed: its `verify` takes the payload as a string, which can change bytes that are not valid UTF-8.

### 6. API version

`withApiVersion` adds a `before` hook to both Octokit instances that sets `x-github-api-version: 2022-11-28` on every request, including `auth-app`'s own token requests, which do not pass through the plugin's call options.

### 7. Basic credential redaction (Q4)

`redactBasicCredentials` replaces credentials after `Authorization` (also `Proxy-Authorization`, quoted, escaped, or glued to text in front), `:` or `=`, and `Basic`, case-insensitively: the header as Git's `-c http.extraHeader=`, a `GIT_CONFIG_VALUE_<n>` value, or a log line holds it. It runs last in `TOKEN_SHAPE_RULES`, so in `SECRET_SHAPE_RULES` and log redaction after every token shape, and it continues through a `[redacted]` that an earlier rule left inside the credentials. A token shape glued inside the base64 is therefore redacted first and the whole credential after it; run first, the rule would stop at the token's `_` and leave its body. A bare `Basic` value without the header name stays, as does `WWW-Authenticate: Basic realm=…`.

### 8. Conformance probe

`checkRevokedCredential` now ends with refresh and revocation of the revoked credential and of an unknown one, each expected to fail with `not-found`. The in-memory fake gains three defects: a refresh that revives a revoked credential, a refresh of an unknown one that fails with another code, and a revocation of a missing one that succeeds.

### 9. Emulated GitHub in tests

`test/github-emulator.ts` answers the REST routes the plugin uses and Git's HTTP endpoints through an injected `fetch`: RS256 App JWTs checked against a key pair generated per test run, narrowed tokens with expiry on its own clock, revocation, branch protection that binds an administrator token only with `enforce_admins`, pull requests, statuses, and merges with GitHub's 405 and 409. The conformance fixture acts on it natively, so the shared suite runs against the plugin with no network and no real credential.

## Risks / Trade-offs

- The emulator encodes this change's reading of GitHub; 20d's live suite checks it against GitHub.com, including narrowing to one of several installed repositories, which the qualification did not test.
- Two refreshes within one second can return the same `expiresAt`, because GitHub's expiry has second precision; a refresh happens long before expiry in practice.
- Writing the whole branch protection drops an operator's review and push restrictions (decision 4).
- In-memory credential state is lost on restart (decision 3).
