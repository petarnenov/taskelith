## Context

ADR 0006 selects GitHub.com as the first SCM plugin, with a GitHub App per installation and a per-run installation token limited to the project's repositories. The GitHub qualification states the port's needs in SCM-neutral terms ("Consequences for the SCM port"): per-run credentials limited by repository and permission, merge blocking that the plugin's own identity cannot bypass, a reviewer identity separate from the identity that opens a change, webhooks verified on the raw body with opaque identifiers, and a refresh path for tokens that last about an hour. The owner decided D8 (a) on 2026-10-25: review is Taskelith evidence, posted as a required commit status that branch protection enforces. The architecture places SCM ports in the "SCM / Tracker integrations" module and names the port `SourceControlProvider`.

## Goals / Non-Goals

Goals:

- A small, SCM-neutral port that the GitHub plugin can implement and that Forgejo can map onto.
- A conformance suite that every SCM plugin passes with its own credential against its service.

Non-goals: the GitHub plugin, SCM I/O, the module's use cases (credential delivery to a run, webhook deduplication, merge orchestration), the plugin SDK re-export, and wire contracts.

## Decisions

- **Module.** `@taskelith/integrations` is the architecture's integrations module. Its skeleton matches the other modules, and its `./port` entry exports only the port types and constants, like `@taskelith/sdlc/port`. Item 8 adds its own ports to the same module.
- **Three ports.** Credential issuance, change requests, and webhook verification have different clients: the launch path, the integration flow, and the HTTP receiver. Each client depends on its own port (ADR 0004 principle 2). `SourceControlProvider` combines them with the capabilities for the plugin to implement.
- **Draft version.** The port is `0.1.0`. ADR 0009 froze the SDLC port only after both frameworks ran through it; here only GitHub will run before Forgejo is added. The plugin SDK re-export and the plugin API version change belong to item 20, which first needs the port from a plugin.
- **Plain data.** Requests and results are plain strings and arrays, as in the SDLC port. The suite checks every result at run time, because plugin output is untrusted. Enumerated values (`SCM_PERMISSIONS`, `MERGE_METHODS`, `COMMIT_STATUS_STATES`, `CHANGE_REQUEST_STATES`, `WEBHOOK_EVENT_KINDS`, `REVIEW_EVIDENCE_KINDS`) are typed as `string` in results, so that an unknown value is a finding rather than a type lie.
- **Opaque identifiers.** Repositories, change requests, commits, credentials, runs, and deliveries are opaque strings that the module compares exactly and never parses. GitHub's numeric pull request numbers and Forgejo's indexes both become strings.
- **Credentials.** `issueRunCredential` takes the run, its repositories, and the SCM-neutral permissions it needs, and returns the effective repositories and permissions with an expiry. `refreshRunCredential` keeps the scope and returns a later expiry for long runs; expiries are kernel instants (UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`), so a plugin normalises its service's format; `revokeRunCredential` ends it. The secret goes only to its run and is never logged or stored. A plugin may grant a superset only when its service has no narrower permission, and it reports the effective set, so that the module can decide; the suite checks that the effective set covers the request and that a credential without `write-code` cannot write.
- **Merge blocking.** `ensureMergeProtection` sets the required statuses on the base branch and reports `bindsProvider`, which is true only when the service enforces the protection against the plugin's own identity. The suite then tries the most privileged native merge with that identity through the fixture, so the block is tested on the service, not only in the plugin. `mergeChangeRequest` names the expected head, so that only the verified and reviewed head can merge, and the project's merge method; a pending or failed required status or a moved head fails with `precondition-failed`, and an undeclared method with `unavailable`.
- **Review identity.** By D8 (a), the review result is a commit status with the project's review context, required by merge protection. `required-status` is the mandatory review evidence; `native-approval` is reserved for a separate reviewer identity (D8 (b)), which no plugin declares yet. The port has no approval operation, because the identity that opens a change cannot approve it.
- **Webhooks.** `verifyWebhookDelivery` receives the headers and the raw body bytes and fails with `forbidden` unless the signature over those bytes is valid. The suite also sends a body that was parsed and re-serialized, which a verifier of the parsed payload would accept. A redelivery yields the same `deliveryId`, by which the module will deduplicate.
- **Conformance fixture.** The suite cannot reach a service by itself, so the plugin's test supplies a fixture: the provider, a project repository and a foreign one, the base branch, the merge method, and native helpers to create and advance a head branch, to read a branch head, to attempt a write with a run credential, to attempt a bypassing merge, and to sign a delivery. The suite checks every refusal on the service as well: a refused merge leaves the change request open and the base branch unchanged, a bypassing merge succeeds on a change request whose statuses all succeed, so that a broken helper cannot pass as protection, and each required status blocks the merge on its own while it is missing, pending, failed, or in error. The plugin runs the suite through `make` with its own credential (item 20). This change runs it against a test-only in-memory fake and against defective variants that each violation must be reported for.

## SCM mapping

The GitHub column follows the GitHub qualification record. The Forgejo column is the author's understanding of Forgejo's model, written without consulting a source for this change and without a pinned version; it is an assumption, not evidence. The Forgejo plugin must confirm each row at its pinned version, with sources, before admission (ADR 0006 decision 4). The unconfirmed conditions are, per row: how a plugin creates a token for the bot user, and with which authentication; the available token scopes; whether a token can expire or only be deleted; whether branch protection can deny a merge override to the bot user; the merge API's method values and whether it can require the expected head; and the names of the signature and delivery headers.

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

## Risks / Trade-offs

- With one SCM before Forgejo, an SCM-specific shape could pass review unnoticed. The mapping table and the suite reduce the risk; Forgejo's admission may revise the draft port.
- The conformance suite mutates a live service and needs disposable repositories; item 20 owns that setup and its cleanup, as the SCM qualification requires.
- The suite requires a refreshed expiry later than the original. A service that reports expiries in whole seconds can return the same expiry for a refresh within one second of issue, so its plugin's fixture must wait or its refresh must guarantee a later expiry.
- Effective permissions wider than requested are reported but not refused by the port; the policy that accepts or refuses them belongs to the module's use cases.
