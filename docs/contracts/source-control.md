# Source control port contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 7, `define-scm-port`), under independent review. It defines the draft `SourceControlProvider` port, version `0.1.0`, through which an SCM plugin issues per-run credentials, hosts change requests, commit statuses, and protected merges, and verifies webhooks, and the SCM-neutral conformance suite that every SCM plugin passes. [ADR 0006](../decisions/0006-github-first-scm.md) makes GitHub.com the first SCM and Forgejo a later second one; the [GitHub qualification](../qualification/github.md#consequences-for-the-scm-port) states the port's needs in SCM-neutral terms. G3 item 20 implements the port for GitHub, and item 9 maps it onto the wire schemas.

## 1. Purpose and parties

| Port | Client | Implemented by |
| --- | --- | --- |
| `RunCredentialIssuer`: per-run credentials, refresh, revocation | The launch path, which delivers a credential to one run | SCM plugins |
| `ChangeRequestHost`: merge protection, change requests, commit statuses, merges | The integration and merge flow (items 21 and 23) | SCM plugins |
| `WebhookVerifier`: verification of a delivery on its raw body | The webhook receiver | SCM plugins |
| `SourceControlProvider`: the three ports with the plugin's capabilities | The plugin registry | SCM plugins |

The ports belong to the Integrations module, the "SCM / Tracker integrations" module of [architecture section 6](../architecture.md#modules), next to the [product ports](product-ports.md) of item 8. They are plugin-facing, so the module exports them through its `./port` entry, which holds only port types and constants, as `@taskelith/sdlc/port` does for the SDLC framework port ([ADR 0009](../decisions/0009-frozen-sdlc-framework-port.md)). Each client depends on the narrowest port it uses ([ADR 0004](../decisions/0004-first-class-engineering-principles.md) principle 2).

## 2. Common rules

1. **No vendor names.** No type, value, or test of the module names an SCM. A plugin maps its service onto the port; section 7 records how GitHub and Forgejo map.
2. **Untrusted plain data.** Requests and results are plain strings and arrays, as in the SDLC framework port and the item 8 `IntakeSource` and `WriteBack` ports. Enumerated values are typed as `string` in results, so that an unknown value is a finding rather than a type lie, and the module checks every result at run time.
3. **Opaque identifiers.** Repositories, change requests, commits, runs, credentials, and deliveries are opaque strings that the module compares exactly and never parses. A service's numeric change request number becomes a string.
4. **The plugin's own identity.** Change request, status, and merge operations act as the plugin's own identity. The identity that opens a change cannot approve it, so the port has no approval operation.
5. **Failures.** Every operation returns a kernel `Result`. Callers branch on the kernel failure codes: `invalid` for a malformed request, `not-found`, `forbidden` for a refused credential or signature, `precondition-failed` for a refused merge, and `unavailable` for an undeclared merge method or a service that cannot be reached.
6. **Instants.** Expiries are kernel instants: UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`. A plugin normalizes its service's format.
7. **Draft status.** The port stays `0.1.0` until a second SCM maps onto it. Item 20 adds the plugin SDK re-export and the plugin API version; Forgejo's admission may revise the port.

## 3. Credentials

| Constant | Values |
| --- | --- |
| `SCM_PERMISSIONS` | `read-code`, `write-code`, `write-change-requests`, `write-statuses` |

- `issueRunCredential` takes the run, its repositories, and the permissions it needs, and returns a credential for that run only, limited to those repositories for every permission, reads included, with its effective repositories, permissions, and expiry.
- The effective permissions are what the credential can actually do: each one works in the project, and a permission not listed does not.
- Effective permissions cover the request and may exceed it when the service has no narrower permission, and the plugin reports them; a credential requested without `write-code` never has it. The policy that accepts or refuses a wider set belongs to the module's use cases.
- The secret goes only to its run and is never logged or stored.
- Credentials of different runs are independent: neither widens the other, and revoking one leaves the other usable.
- `refreshRunCredential` returns a new secret for the same repositories and permissions with a later expiry, and ends the previous secret, reads included, so that a long run keeps working. `credentialId` may stay the same.
- `revokeRunCredential` ends the credential, reads included, and returns no value.

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
- The verified event carries an opaque `deliveryId` that every redelivery of the same delivery repeats and that differs between deliveries; the module deduplicates by it.

## 7. SCM mapping

The GitHub column follows the [GitHub qualification](../qualification/github.md#consequences-for-the-scm-port) record. The Forgejo column is an assumption about Forgejo's model, written without a source consulted for this change and without a pinned version. The Forgejo plugin must confirm each row at its pinned version, with sources, before admission ([ADR 0006](../decisions/0006-github-first-scm.md) decision 4). The unconfirmed conditions are, per row: how a plugin creates a token for the bot user, and with which authentication; the available token scopes; whether a token can expire or only be deleted; whether branch protection can deny a merge override to the bot user; the merge API's method values and whether it can require the expected head; and the names of the signature and delivery headers.

| Port element | GitHub.com | Forgejo |
| --- | --- | --- |
| Run credential | Installation access token from the installation's App, requested with `repositories` and `permissions` | Access token of a per-project bot user that is a collaborator only on the project's repositories, with token scopes |
| Permissions | `contents` read or write, `pull_requests` write, `statuses` write | Token scopes are coarser (repository read or write); the plugin reports the effective set |
| Refresh | A new installation token before the hour expires | A new token, then revocation of the old one; expiry is enforced by revocation |
| Revocation | Revoke the installation token | Delete the access token |
| Merge protection binding the plugin | Protected branch with required status checks and `enforce_admins: true` | Branch protection with required status checks, with the bot user given no merge override |
| Change request | Pull request; number as an opaque string | Pull request; index as an opaque string |
| Commit status | Commit status API with a context | Commit status API with a context |
| Merge with method and expected head | Merge API with `merge_method` and `sha` | Merge API with `Do` (merge, squash, or rebase) and the head commit |
| Review evidence (D8 (a)) | Required commit status posted by the App | Required commit status posted by the bot user |
| Webhook signature | HMAC-SHA256 of the raw body in `X-Hub-Signature-256` | HMAC-SHA256 of the raw body in the signature header |
| Delivery identifier | `X-GitHub-Delivery` | The delivery header's GUID |

The gaps are recorded, not hidden: Forgejo's coarser token scopes make the effective permissions a superset for some runs, and its credential refresh is a revocation flow rather than a service expiry.

## 8. Conformance suite

`runSourceControlConformance` runs against a live service with the plugin's own credential. The plugin's test supplies a fixture: the provider, a project repository, a foreign repository outside the project that the plugin's own identity can access, so that a refusal shows the credential's scope, the base branch, the merge method, and native helpers to create and advance a head branch, read a branch head, observe a merge's method, attempt with a run credential the action that each permission allows (a code read, a code write, a change request write, and a status write), attempt the most privileged native merge, and sign a delivery with the plugin's secret or another one. The report has a finding for each thrown error, malformed or unknown result value, and outcome that differs from this contract. Among others, the suite checks on the service that:

- in the project, every credential, read-only, write, change request, status, and refreshed, can do exactly what its effective permissions allow and nothing else, and outside the project it can do nothing, reads included;
- a refresh of a read-only credential and of one with every permission keeps the effective permissions unchanged and returns a later expiry and a new secret, and after a refresh or a revocation the previous credential can do nothing, reads included;
- two runs' credentials stay independent;
- each required context, including any the service already required, blocks a merge through the port and through the native bypass while it is missing, pending, failed, or in error, for every declared merge method, and a moved head blocks every declared method too;
- the native bypass merges a change request whose statuses all succeed, so that a broken helper cannot pass as protection;
- every declared method merges with that method and reports the base branch head as its merge commit, and every undeclared method fails with `unavailable`;
- a re-serialized body, a foreign signature, and a missing signature fail with `forbidden`, and delivery identifiers are stable per delivery and distinct between deliveries.

## 9. Required tests

- This item: the suite against a test-only in-memory SCM, and against defective variants of it, each of which the suite must report.
- Item 20: the suite through `make` against GitHub.com with the plugin's own credential and disposable repositories, including a run that outlives a credential's original expiry.
- Forgejo's admission: the suite against Forgejo, with the mapping of section 7 confirmed.

## 10. Not in this contract

- SCM plugins and their I/O: item 20 for GitHub; Forgejo later.
- The Git workspace and its use of the run credential: item 6.
- The module's use cases: credential delivery to a run, webhook deduplication, and merge orchestration (items 21 and 23).
- The plugin SDK re-export and the plugin API version: item 20.
- Wire schemas, including the webhook receiver's HTTP operation: item 9.
