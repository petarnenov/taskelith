# Source control port contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 7, `define-scm-port`), under independent review. It defines the draft `SourceControlProvider` port, version `0.2.0` since the plan item 20 change `revise-scm-port-refresh-and-authorization`, through which an SCM plugin issues, refreshes, and ends per-run credentials, derives a repository's remote URL, hosts change requests, commit statuses, and protected merges, and verifies webhooks, and the SCM-neutral conformance suite that every SCM plugin passes. [ADR 0006](../decisions/0006-github-first-scm.md) makes GitHub.com the first SCM and Forgejo a later second one; the [GitHub qualification](../qualification/github.md#consequences-for-the-scm-port) states the port's needs in SCM-neutral terms. G3 item 20 implements the port for GitHub, and item 9 maps it onto the wire schemas.

## 1. Purpose and parties

| Port | Client | Implemented by |
| --- | --- | --- |
| `RunCredentialIssuer`: per-run credentials, refresh, adoption confirmation, revocation | The launch path, which delivers a credential to one run (item 21, section 10) | SCM plugins |
| `RepositoryRemoteResolver`: a repository's remote URL (section 4.1) | The repository binding and the credential issue of [control-plane wire contracts](control-plane-wire-contracts.md) section 4.1 | SCM plugins |
| `ChangeRequestHost`: merge protection, change requests, commit statuses, merges | The integration and merge flow (items 21 and 23) | SCM plugins |
| `WebhookVerifier`: verification of a delivery on its raw body | The webhook receiver, G3 work of items 9, 20, 26, and 37 (section 6) | SCM plugins |
| `SourceControlProvider`: the four ports with the plugin's capabilities | The plugin registry | SCM plugins |

The ports belong to the Integrations module, the "SCM / Tracker integrations" module of [architecture section 6](../architecture.md#modules), next to the [product ports](product-ports.md) of item 8. They are plugin-facing, so the module exports them through its `./port` entry, which holds only port types and constants, as `@taskelith/sdlc/port` does for the SDLC framework port ([ADR 0009](../decisions/0009-frozen-sdlc-framework-port.md)). Each client depends on the narrowest port it uses ([ADR 0004](../decisions/0004-first-class-engineering-principles.md) principle 2).

## 2. Common rules

1. **No vendor names.** No type, value, or test of the module names an SCM. A plugin maps its service onto the port; section 7 records how GitHub and Forgejo map.
2. **Untrusted plain data.** Requests and results are plain strings and arrays, as in the SDLC framework port and the item 8 `IntakeSource` and `WriteBack` ports. Enumerated values are typed as `string` in results, so that an unknown value is a finding rather than a type lie, and the module checks every result at run time.
3. **Opaque identifiers.** Repositories, change requests, commits, runs, credentials, and deliveries are opaque strings that the module compares exactly and never parses. A service's numeric change request number becomes a string. A run identifier is the module's own and has the kernel identifier syntax (`parseIdentifier`: 1 to 128 printable ASCII characters without whitespace). The other identifiers are external: the service issues them, and each is a non-empty string of at most 1024 characters. The module checks both at run time, and the conformance suite reports any other value.
4. **The plugin's own identity.** Change request, status, and merge operations act as the plugin's own identity. The identity that opens a change cannot approve it, so the port has no approval operation.
5. **Failures.** Every operation returns a kernel `Result`. Callers branch on the kernel failure codes: `invalid` for a malformed request, `not-found`, `forbidden` for a refused credential or signature, `precondition-failed` for a refused merge, and `unavailable` for an undeclared merge method or a service that cannot be reached.
6. **Instants.** Expiries are kernel instants: UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`. A plugin normalizes its service's format.
7. **Draft status.** The port stays a draft until a second SCM maps onto it. The item 20 change `revise-scm-port-refresh-and-authorization` raised it from `0.1.0` to `0.2.0`: a refresh keeps the previous secret until the run confirms adoption of the new one (section 3), a run credential carries its version and its `authorization`, and `resolveRemoteUrl` derives a repository's remote URL (section 4.1). Item 20 still adds the plugin SDK re-export and the plugin API version; Forgejo's admission may revise the port again.

## 3. Credentials

| Constant | Values |
| --- | --- |
| `SCM_PERMISSIONS` | `read-code`, `write-code`, `write-change-requests`, `write-statuses` |

- `issueRunCredential` takes the run, its repositories, and the permissions it needs, and returns a credential for that run only, limited to those repositories for every permission, reads included, with its effective repositories, permissions, and expiry, at version 1.
- **Version.** A credential's versions share its `credentialId`; a version is the secret that one issue or refresh returned, numbered 1 at issue and one more at each refresh, as the version of [execution wire contracts](execution-wire-contracts.md) section 8.7.
- **Authorization.** Each version also carries `authorization`, the complete value of the HTTP `Authorization` header that sends its secret, which the Git workspace places in `http.extraHeader` ([Git workspace contract](git-workspace.md) section 7). The plugin forms it, because the form belongs to the service (section 7). It is a scheme, one space, and credentials of visible ASCII characters with inner spaces only, so that no line break reaches a header, at most 65536 characters as the wire's `ScmAuthorization`, and it is as secret as the secret itself. The workspace's `WorkspaceCredential` is the part of `RunCredential` it uses, `authorization` included.
- The effective permissions are what the credential can actually do: each one works in the project, and a permission not listed does not.
- Effective permissions cover the request and may exceed it when the service has no narrower permission, and the plugin reports them; a credential requested without `write-code` never has it. A service whose only permission for change request or status writes also writes code therefore cannot serve a request for them without `write-code`, and the conformance suite reports such a grant (section 7 records this gate for Forgejo). The policy that accepts or refuses a wider set belongs to the module's use cases.
- The secret goes only to its run and is never logged or stored. G2 has no mechanism for this: the redaction of log text and of `@taskelith/secrets` matches Taskelith's own secret shapes (`tkop_`, `tken_`, and `tkwk_` tokens, NKey seeds, JWTs, and `.creds` blocks) and secrets in marked positions (URL user information in both; `Bearer` tokens, `key=value` pairs, and log fields whose names mark a secret in logs), but no rule matches a bare SCM token outside these marked positions, and no production path calls `scrubEnvironment` of `@taskelith/secrets`. Both are G3 obligations: item 20 (`implement-github-scm-plugin`) adds the per-run SCM credential's secret shape to the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`, which log redaction and `@taskelith/secrets` both use, and item 21 (`implement-review-and-verification-stages`), which owns the delivery of the credential to a run (section 10), scrubs it on that delivery path.
- Credentials of different runs are independent: neither widens the other, and revoking one leaves the other usable.
- `refreshRunCredential` returns the next version of the credential: the same `credentialId`, repositories, and permissions, a new secret and `authorization`, and a later expiry, so that a long run keeps working. It ends no earlier version: each one stays valid, reads included, until an adoption confirmation ends it, a revocation ends the credential, or its own expiry, its deadline, passes. The service enforces that expiry where it can; otherwise the plugin refuses the version from its next operation on. A refresh fails with `not-found` for an unknown or revoked credential.
- `confirmRunCredentialAdoption` (request `RunCredentialAdoption`) names the credential and the version its run adopted, and ends every earlier version, reads included; the adopted version and later ones stay valid. A repeated confirmation, or one of a version at or below one already confirmed, succeeds and ends nothing more. It fails with `not-found` for an unknown or revoked credential and for a version not yet issued. As with item 26's worker credentials, the predecessor stays valid until its successor is confirmed or its deadline passes; the module ends a version without a confirmation by confirming a later one, and the version's own expiry ends it in any case.
- Delivery of a refreshed credential to a running run is open G3 work. Item 9 (`define-g3-wire-contracts`) defines the notice that tells the worker of it, which carries no secret, the HTTPS fetch with which the worker then takes it (`fetchRunScmCredential`, sub-change 9c), and the worker's confirmation that the run adopted it (sub-change 9d, [worker messages and terminal](worker-messages-and-terminal.md) section 6), item 21 delivers it, item 18 (`implement-harness-host-in-worker`) adopts it by passing the run's current credential to the item 16 workspace per operation and sends the confirmation, and item 21 ends the previous version through `confirmRunCredentialAdoption` by the run-wide rule of that section 6. Because a refresh ends no earlier version, a failed delivery leaves the run working with the version it holds.
- `revokeRunCredential` ends the credential, every version of it, reads included, and returns no value. It fails with `not-found` for an unknown or revoked credential.

## 4. Change requests, statuses, and merges

| Constant | Values |
| --- | --- |
| `CHANGE_REQUEST_STATES` | `open`, `closed`, `merged` |
| `COMMIT_STATUS_STATES` | `pending`, `success`, `failure`, `error` |
| `MERGE_METHODS` | `merge-commit`, `squash`, `rebase` |

- `ensureMergeProtection` configures the base branch's required status contexts and reports `bindsProvider`, which is true only when the service enforces the protection against the plugin's own identity.
- `openChangeRequest` and `readChangeRequest` return the change request with its repository, branches, head commit, state, and link. A merge made outside the port, such as a manual merge, appears as the `merged` state and as a `change-request` webhook event; the module records it through the item 8 `MergeQueue.recordManualMerge`.
- `setCommitStatus` posts a status on one commit in one context.
- `mergeChangeRequest` (request `ChangeRequestMerge`) names the expected head and the project's merge method. It fails with `precondition-failed` while any required status is missing, `pending`, `failure`, or `error`, or when the head differs from the expected one, and with `unavailable` for a method the plugin does not declare. On success it returns the method used and the base branch head after the merge as its merge commit.
- A refused merge leaves the change request open and the base branch unchanged.

### 4.1 Repository remote

- `resolveRemoteUrl` takes a repository and returns it with its remote URL, as the plugin's own identity reads it from the service: an HTTPS URL of at most 2048 characters with a host name, not an IPv6 literal, an optional port from 1 to 65535, and no white space, user information, query, or fragment, the `RemoteUrl` form of the execution wire document and the form that the repository binding requires ([control-plane wire contracts](control-plane-wire-contracts.md) section 4, "Repository binding"). It fails with `not-found` for a repository that the plugin's identity cannot see.
- [Control-plane wire contracts](control-plane-wire-contracts.md) section 4.1 assigns this operation to item 20, after which a binding's `remoteUrl` becomes output-only; that change of the wire contract and of the binding's handlers is not part of the port.

## 5. Review identity

By G3 plan decision D8 (a), independent review is Taskelith evidence, posted as a commit status in the project's review context that merge protection requires.

| Constant | Values |
| --- | --- |
| `REVIEW_EVIDENCE_KINDS` | `required-status` (mandatory), `native-approval` (reserved for a separate reviewer identity, D8 (b)) |

A plugin declares its merge methods and review evidence in `SourceControlCapabilities`. A merge is refused while the review context is pending, even after verification has succeeded.

## 6. Webhooks

| Constant | Values |
| --- | --- |
| `WEBHOOK_EVENT_KINDS` | `change-request`, `commit-status`, `push`, `other` |

- `verifyWebhookDelivery` receives the headers, with names in lower case, and the body bytes exactly as received. It verifies the signature over those bytes before it trusts any payload.
- It fails with `forbidden` for a missing signature, a signature made with another secret, or a body that was parsed and serialized again.
- The receiver that calls it needs an ingress that the service can reach, with TLS. The installation has no externally reachable ingress: it publishes the control-plane API on `127.0.0.1` only, over HTTPS on a certificate of the installation CA since G3 sub-change 26a ([local installation](../local-installation.md)). Item 9 (`define-g3-wire-contracts`) defines the receiver's HTTP operation, item 20 builds the receiver, item 26 (`secure-remote-connectivity`) provides the TLS of D11 (b), and item 37 (`extend-installation-for-g3`) the installation that serves it. Until they merge, no service can deliver a webhook to an installation.
- The verified event carries an opaque `deliveryId` that every redelivery of the same delivery repeats and that differs between deliveries; the module deduplicates by it.

## 7. SCM mapping

The GitHub column follows the [GitHub qualification](../qualification/github.md#consequences-for-the-scm-port) record. The Forgejo column is an assumption about Forgejo's model, written without a source consulted for this change and without a pinned version. The Forgejo plugin must confirm each row at its pinned version, with sources, before admission ([ADR 0006](../decisions/0006-github-first-scm.md) decision 4). The unconfirmed conditions are, per row: how a plugin creates a token for the bot user, and with which authentication; the available token scopes; whether a token can expire or only be deleted; the `Authorization` form that Git's HTTP transport accepts for a token; whether branch protection can deny a merge override to the bot user; the merge API's method values and whether it can require the expected head; and the names of the signature and delivery headers.

| Port element | GitHub.com | Forgejo |
| --- | --- | --- |
| Run credential | Installation access token from the installation's App, requested with `repositories` and `permissions` | Access token of a per-project bot user that is a collaborator only on the project's repositories, with token scopes |
| Permissions | `contents` read or write, `pull_requests` write, `statuses` write | Token scopes are coarser (repository read or write, assumed `read:repository` and `write:repository`); the plugin reports the effective set; `write:repository` writes code, so it cannot serve a request without `write-code` (admission gate below) |
| Refresh | A new installation token before the hour expires; the previous token stays valid until its own expiry | A new token; the old one stays until its revocation, so its deadline is enforced by revocation |
| Adoption confirmation | Revoke every earlier installation token of the credential | Delete every earlier access token of the credential |
| Authorization | `Basic ` followed by the base64 of `x-access-token:<secret>` ([Git workspace contract](git-workspace.md) section 14) | The form of a token in Git's HTTP authentication |
| Remote URL | The repository's HTTPS clone URL | The repository's HTTPS clone URL |
| Revocation | Revoke the installation token | Delete the access token |
| Merge protection binding the plugin | Protected branch with required status checks and `enforce_admins: true` | Branch protection with required status checks, with the bot user given no merge override |
| Change request | Pull request; number as an opaque string | Pull request; index as an opaque string |
| Commit status | Commit status API with a context | Commit status API with a context |
| Merge with method and expected head | Merge API with `merge_method` and `sha` | Merge API with `Do` (merge, squash, or rebase) and the head commit |
| Review evidence (D8 (a)) | Required commit status posted by the App | Required commit status posted by the bot user |
| Webhook signature | HMAC-SHA256 of the raw body in `X-Hub-Signature-256` | HMAC-SHA256 of the raw body in the signature header |
| Delivery identifier | `X-GitHub-Delivery` | The delivery header's GUID |

The gaps are recorded, not hidden: Forgejo's coarser token scopes make the effective permissions a superset for some runs, and its credential refresh is a revocation flow rather than a service expiry. A superset is allowed except for `write-code` (section 3). If Forgejo allows change request or status writes only with a scope that also writes code, such as `write:repository`, its plugin cannot serve a request for `write-change-requests` or `write-statuses` without `write-code`, and the suite's credential cases report every such grant. This is a Forgejo admission and compatibility gate: its admission must show a narrower mechanism at its pinned version, or the port must be revised (section 2, rule 7) before Forgejo is admitted.

## 8. Conformance suite

`runSourceControlConformance` runs against a live service with the plugin's own credential. The plugin's test supplies a fixture: the provider, a project repository, a foreign repository outside the project that the plugin's own identity can access, so that a refusal shows the credential's scope, a hidden repository that the plugin's own identity cannot see, the project repository's remote URL as the service names it, the base branch, the merge method, and native helpers to create and advance a head branch, read a branch head, observe a merge's method, attempt with a run credential the action that each permission allows (a code read and a code write, which send the credential's `authorization` as the Git workspace does, a change request write, and a status write), attempt the most privileged native merge, and sign a delivery with the plugin's secret or another one. The report has a finding for each thrown error, malformed or unknown result value, and outcome that differs from this contract. No finding carries a value that the plugin or the fixture supplied. A finding names a thrown value only by a fixed category, one of the built-in error classes, another `Error` class, or a value that is not an `Error`, and never by its message, name, stack, or other payload. It names a malformed, unknown, or mismatched result field, of the plugin or of a fixture `Result`, by its path and the kind of problem, never by its value. It may name the suite's own terms: operations, fixture steps, its contexts and run probes, the port's constants, and values that matched them. A secret in a thrown error, in a result, or in a fixture value therefore never reaches the report. Among others, the suite checks on the service that:

- in the project, every credential, read-only, write, change request, status, and refreshed, can do exactly what its effective permissions allow and nothing else, and outside the project it can do nothing, reads included;
- an issue returns version 1, and a refresh of a read-only credential and of one with every permission keeps the `credentialId` and the effective permissions and returns the next version, a later expiry, and a new secret and `authorization`;
- after a refresh both versions can do exactly what the permissions allow, and after the adoption of the new one the previous one can do nothing, reads included, while the new one still works;
- an adoption ends only the versions before the adopted one, a repeated or stale adoption ends nothing more and restores nothing, an adoption of a version not yet issued, of an unknown credential, or of a revoked one fails with `not-found`, a credential still refreshes after a confirmed adoption, and a revocation ends every version, reads included;
- `resolveRemoteUrl` returns the requested repository with an HTTPS remote URL without user information, query, or fragment, the fixture's URL for the project repository, and another one for the foreign repository, and fails with `not-found` for the hidden repository;
- two runs' credentials stay independent and have distinct secrets and `authorization` values;
- each required context, including any the service already required, blocks a merge through the port and through the native bypass while it is missing, pending, failed, or in error, for every declared merge method, and a moved head blocks every declared method too;
- the native bypass merges a change request whose statuses all succeed, so that a broken helper cannot pass as protection;
- every declared method merges with that method and reports the base branch head as its merge commit, and every undeclared method fails with `unavailable`;
- a re-serialized body, a foreign signature, and a missing signature fail with `forbidden`, and delivery identifiers are stable per delivery and distinct between deliveries.

## 9. Required tests

- This item: the suite against a test-only in-memory SCM, and against defective variants of it, each of which the suite must report. The change `revise-scm-port-refresh-and-authorization` added the variants for the revision: a refresh that ends the previous version, an adoption that ends nothing, the adopted version, or a later one, a stale adoption that restores an ended version, an adoption of an unknown or a revoked credential that succeeds, a refresh after a confirmed adoption that fails, a revocation that leaves an earlier version, an `authorization` that grants no access or does not change, a remote URL shared by two repositories, and a remote URL invented for a repository the plugin cannot see.
- Item 20: the suite through `make` against GitHub.com with the plugin's own credential and disposable repositories, including a run that outlives a credential's original expiry, and the revised refresh, whose previous secret works until the run confirms adoption.
- Item 21: a refreshed credential delivered to a running run and adopted by it, the previous secret ended after the adoption is confirmed, and a failed delivery, after which the run keeps the previous secret.
- Forgejo's admission: the suite against Forgejo, with the mapping of section 7 confirmed.

## 10. Not in this contract

- SCM plugins and their I/O: item 20 for GitHub; Forgejo later.
- The Git workspace and its use of the run credential: item 6, the [Git workspace contract](git-workspace.md).
- The module's use cases: credential delivery to a run, a refreshed credential included (item 21, with its notice, fetch, and adoption confirmation in item 9 and its adoption in item 18), webhook deduplication, and merge orchestration (items 21 and 23).
- The plugin SDK re-export and the plugin API version: item 20.
- Wire schemas, including the webhook receiver's HTTP operation: item 9.
