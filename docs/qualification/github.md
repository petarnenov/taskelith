# GitHub.com SCM qualification

Date: 2026-10-24. Status: evidence for the first SCM selected in [ADR 0006](../decisions/0006-github-first-scm.md). GitHub.com stays `candidate` in the [dependency register](../dependencies.md). No SCM plugin code exists yet.

Sources: GitHub's documentation is pinned to commit `02c25d16369fe27f9bdb28d1201f6b452f0d21dd` of the [`github/docs`](https://github.com/github/docs/tree/02c25d16369fe27f9bdb28d1201f6b452f0d21dd) repository. Times are UTC.

## Setup

| Item | Record |
| --- | --- |
| Service | GitHub.com REST API, version header `X-GitHub-Api-Version: 2022-11-28` |
| GitHub App | `taskelith-qualification-petarnenov` (App ID 5456916), created by the owner on the owner's account, installable only on that account, with a webhook URL that intentionally cannot receive deliveries (`https://example.com/...`) and a webhook secret |
| App permissions | Repository: contents (write), pull requests (write), commit statuses (write), administration (write, only for the branch-protection test), metadata (read) |
| App events | `pull_request`, `pull_request_review`, `push`, `status` |
| Installation | On `petarnenov/taskelith` only (repository selection `selected`), installation 174871289 |
| Secrets | The App's private key, App ID, installation ID, and webhook secret are files in a private scratch directory outside the repository; the probe logs no token, key, or request body |
| Repository used | `petarnenov/taskelith` itself, at the owner's request, instead of a sandbox repository. The repository is public, so the temporary branches and pull requests were publicly visible while they existed |

## Terms

| Item | Record |
| --- | --- |
| Terms of service | [GitHub Terms of Service](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/github-terms/github-terms-of-service.md) |
| Data handling | [GitHub General Privacy Statement](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/privacy-policies/github-general-privacy-statement.md) |
| Review of terms | The documents are linked, not yet reviewed against Taskelith's use (automated agents acting through a GitHub App on project repositories). That review is a gate before admission |

## Method

A probe script (SHA-256 `69293fa83e3c…` for the recorded run `g3`) ran through `make run` from a scratch directory outside the repository. It used only GitHub App credentials: a short-lived JWT signed with the App's private key for App-level endpoints, and installation access tokens for repository calls. Every request was logged with time, method, path, status, and remaining rate limit (`runs/g3/requests.jsonl`, 40 requests).

The probe worked only on temporary branches named `qual/scm-*`, created from the head of `dev`. It never wrote to `dev` or `main` and opened its pull request against a temporary base branch. At the end it attempted every cleanup step independently: removing the temporary protection, closing the pull request, and deleting each branch it had attempted to create. Pull requests are closed or merged, not deleted, and their reviews and commit statuses stay as public records. Cleanup succeeded in every run; its behaviour after a failure in the middle of a run was not tested. No GitHub Actions workflow ran, because the workflow triggers only for `main`.

Run `g1` (16:39:53–16:41:13) stopped during webhook processing after exposing two problems, then cleaned up; it supports the two findings below. Run `g2` (16:41:44–16:42:28) fixed both; Codex review pass 1 found weaknesses in its narrowed-token test, cleanup, and webhook coverage. Run `g3` (16:48:06–16:48:53) is the recorded run.

## Results

| Check | Result | Evidence (`g3` unless noted) |
| --- | --- | --- |
| Token scope | `verified` | The installation token listed only `petarnenov/taskelith`, with the App's permissions, and an advertised expiry 60 minutes after issue; expiry enforcement was not observed ([docs](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app.md)). |
| Denial outside the installation | `verified` | Creating a commit status on another public repository of the same owner, `petarnenov/hexa-lab`, where the App is not installed, returned 403. Reading it returned 200, as for any public repository. Narrowing a token to one of several repositories in the same installation was not tested, because the App is installed on one repository. |
| Narrowed token | `verified` | A token requested with only `contents: read` was refused creating a branch at a valid commit (403, "Resource not accessible by integration") and reading the temporary branch's existing protection (403, same message). The broad token created branches (201) and read that protection (200). |
| Branch and commit | `verified` | Both temporary branches were created (201); a file commit on the head branch (201) was authored by `taskelith-qualification-petarnenov[bot]`. |
| Pull request | `verified` | Opened by the App (201, author type `Bot`): pull request #24 (#22 in `g1`, #23 in `g2`). |
| Review | `partial` | A comment review succeeded (200, state `COMMENTED`). Approving failed with 422 "Can not approve your own pull request", because the App authored the pull request. |
| Commit status | `verified` | `pending`, then `success`, for context `taskelith/verify` (201 each); the combined status read back as `success`. |
| Merge blocking | `verified` | With protection requiring `taskelith/verify` and `enforce_admins: true`, the pull request was `blocked` and a merge attempt returned 405 while the status was `pending`; after `success` it was `clean` and the merge succeeded (200). |
| Signed webhooks | `verified` | Nine deliveries matched the installation, the repository, and the run's time window, and every payload referred to a `qual/scm-*` branch. This was a snapshot taken after the merge and before the redelivery and cleanup; deliveries caused by those later steps were not inspected. For all nine, the `X-Hub-Signature-256` header equaled the HMAC-SHA256 of the payload, as returned by the delivery API and serialized as compact JSON, with the webhook secret ([docs](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/webhooks/using-webhooks/validating-webhook-deliveries.md)). Deliveries failed (502) because the URL cannot receive them, as intended. |
| Webhook redelivery | `verified` | Redelivery of the `pull_request.opened` delivery was accepted (202) and listed as a redelivery; its signature was not checked. |
| Cleanup | `verified` (success path) | Protection removed (204), pull request closed (200), both branches deleted (204 each); the narrowed token's branch, never created, returned 422. `git fetch --prune` showed no `qual/*` branch afterwards. |

### Findings

- **Administrators bypass branch protection by default.** In `g1` the protection used `enforce_admins: false`; the pull request was reported `blocked`, yet the App, which holds the administration permission, merged it while the status was `pending`. GitHub documents that protection rules do not apply to administrators unless bypassing is disallowed ([docs](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md)). With `enforce_admins: true` (`g2` and `g3`), the block held.
- **Large webhook delivery IDs.** Delivery IDs exceed 2^53; parsing them as JavaScript numbers rounded them, and the first detail request in `g1` returned 404. The plugin must treat these IDs as strings.
- **Self-approval is impossible.** A pull request authored by the App cannot be approved by the same App.

## Consequences for the SCM port

Stated in harness-neutral terms, so that a later Forgejo plugin maps onto the same port:

- Credentials: the port asks the plugin for a per-run credential limited to the project's repositories and to the permissions the run needs; the GitHub plugin maps this to an installation token with a `repositories` and `permissions` request.
- Merge blocking: the plugin must configure protected branches so that its own identity cannot bypass them (on GitHub, `enforce_admins: true`), and the conformance suite must test the block with the plugin's own credential.
- Independent review: the identity that opens a change cannot approve it, so the independent review step needs a separate reviewer identity.
- Webhooks: the plugin verifies the signature on the raw request body before trusting a payload, and handles identifiers as opaque strings.
- Expiry: installation tokens last about an hour, so long runs need a refresh path from the control plane.

## Remaining before admission

- Review of GitHub's terms of service and privacy statement against Taskelith's use.
- A real webhook receiver that verifies signatures on the raw body, in place of the API copy, covering every delivery of a run, including redeliveries and deliveries caused by cleanup.
- A reviewer identity separate from the App for approvals.
- Token refresh for runs longer than an hour, and rate-limit behaviour under load.
- Private repositories, and the minimum permission set without `administration` once protection is configured by an operator.
- Narrowing a token to one repository within an installation that has several, and cleanup after a failure in the middle of a run.
- GitHub's security-reporting process and service maintenance and support evidence, recorded with sources.
- Recovery and upgrade behaviour: API version retirement, service outages, and rate limiting during a run.
- The owner decided on 2026-10-24 to keep the qualification App's permissions, including administration, unchanged.
- Independent usage evidence recorded in the dependency register, and a re-check of the pinned API version when GitHub retires it.
