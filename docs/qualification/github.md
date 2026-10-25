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
| Review of terms | Recorded on 2026-10-25 in [Terms review](#terms-review), against Taskelith's use (automated agents acting through a GitHub App on project repositories); the owner's decision D15 is pending |

## Terms review

On 2026-10-25, for G3 item 2 (`review-g3-provider-terms`), this section records what GitHub's terms and documentation say about Taskelith's use (automated agents acting through a self-hosted GitHub App with per-run installation tokens, and a separate reviewer identity, on the operator's repositories) and where the text is ambiguous; it is not legal advice, and the decision on the remaining risk is the owner's decision D15 in the [G3 plan](../g3-plan.md).

Every document was read on 2026-10-25 at commit `02c25d16369fe27f9bdb28d1201f6b452f0d21dd` of `github/docs`, which was still the head of `main` on that date (`PIN` below is `https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content`).

| Document | Version or effective date | URL (accessed 2026-10-25) |
| --- | --- | --- |
| GitHub Terms of Service (ToS) | "Effective date: April 27, 2026" | [PIN/site-policy/github-terms/github-terms-of-service.md](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/github-terms/github-terms-of-service.md) |
| GitHub Acceptable Use Policies (AUP) | No date stated | [PIN/site-policy/acceptable-use-policies/github-acceptable-use-policies.md](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/acceptable-use-policies/github-acceptable-use-policies.md) |
| AUP subpages: Disrupting the Experience of Other Users; Synthetic Media and AI Tools | No date stated | [Disrupting](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/acceptable-use-policies/github-disrupting-the-experience-of-other-users.md), [Synthetic Media](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/acceptable-use-policies/github-synthetic-media-and-ai-tools.md) |
| Terms for Additional Products and Features | "Version Effective Date: August 27, 2026" | [PIN/site-policy/github-terms/github-terms-for-additional-products-and-features.md](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/github-terms/github-terms-for-additional-products-and-features.md) |
| Marketplace Developer Agreement; Registered Developer Agreement | Effective May 27, 2025; no date stated | [Marketplace](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/github-terms/github-marketplace-developer-agreement.md), [Registered](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/github-terms/github-registered-developer-agreement.md) |
| GitHub General Privacy Statement | Effective April 27, 2026 | [PIN/site-policy/privacy-policies/github-general-privacy-statement.md](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/site-policy/privacy-policies/github-general-privacy-statement.md) |
| Docs (product documentation, not terms): About creating GitHub Apps; About protected branches | n/a | [Apps](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps.md), [protected branches](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md) |

### Automated use and machine accounts

ToS, B.3 "Account Requirements": Accounts registered by bots "or other automated methods are not permitted", but "A machine account is used exclusively for performing automated tasks", and "You may maintain no more than one free machine account in addition to your free Personal Account"; also "One person or legal entity may maintain no more than one free Account". ToS, H "API Terms": "Abuse or excessively frequent requests to GitHub via the API may result in the temporary or permanent suspension of your Account's access to the API", "We will make a reasonable attempt to warn you via email prior to suspension", and "You may not share API tokens to exceed GitHub's rate limitations"; its short version, which S.3 says is "not legally binding", extends the section to "use of the API through a third party product that accesses GitHub". AUP, section 4, forbids "automated excessive bulk activity and coordinated inauthentic activity". ToS, D.1: "You are responsible for Your Content and any harm resulting from it"; J.5: "You are responsible for your use of Output".

- The text says: automation is permitted in principle through machine accounts and the API, with a human owner "ultimately responsible for the machine's actions"; the prohibitions target excessive, bulk, inauthentic, or disruptive activity, and abusive or excessive API use may suspend the Account's API access, after a reasonable attempt at an email warning; the operator is responsible for the content its agents post.
- Ambiguous: "excessive" has no threshold beyond the documented rate limits, and GitHub decides abuse "in our sole discretion"; "automated inauthentic activity" is not defined.

### GitHub App use

Docs, About creating GitHub Apps: GitHub Apps "can also act independently of a user", and an app acting "on behalf of itself, rather than a user" should use "an installation access token". The Marketplace Developer Agreement covers products "accessible via Marketplace"; the Registered Developer Agreement "governs your participation in the Program".

- The text says: per-run installation tokens follow the documented server-to-server pattern; a self-hosted App that is not listed on Marketplace and not enrolled in the Program does not appear to fall under either developer agreement.
- Ambiguous: B.3 speaks of Accounts, and the ToS does not say whether an App's `[bot]` identity falls under the "bots" sentence, the machine-account rule, or neither; Section H clearly applies to its API traffic.

### Separate reviewer identity

Docs, About protected branches: required reviews mean approval "by the required number of reviewers with write permissions", optionally "by someone other than the person who pushed it". No term found addresses a second identity approving changes on the owner's repositories. AUP subpage, Disrupting the Experience of Other Users, forbids behavior that "significantly or continually disrupts the experience of other users", including "Opening empty or meaningless issues or pull requests", "Creating nonsensical or irrelevant code reviews", and "Engaging with platform features in a way that causes excessive notifications for other users".

- The text says: no term forbids a second App or machine account from approving pull requests on the operator's own repositories; meaningless pull requests, irrelevant code reviews, and excessive notifications are named as disruption; a reviewer that is a free machine account counts against the one-free-machine-account limit, and a second free personal account for the same person or entity is excluded by "no more than one free Account".
- Ambiguous: an approval by a second identity under the same operator's control may be read as "coordinated inauthentic activity" (AUP 4); and whether agent pull requests and reviews at volume, or their notifications to collaborators, reach "significantly or continually" is not defined.

### AI-specific terms

ToS, J.3 grants GitHub a license to use "your Inputs and Outputs to develop, train and improve artificial intelligence and machine learning models", tied to GitHub's own AI Features (Copilot and similar). The AUP subpage Synthetic Media and AI Tools covers only projects for the creation of specific harmful content ("Sexual material involving minors", "Violent extremist propaganda", "Sexually explicit media of people without their consent"). The Additional Products terms place Copilot under "Section J (AI Features) of the GitHub Terms of Service".

- The text says: GitHub's AI terms govern GitHub's own AI Features; no term found expressly permits or forbids third-party AI agents acting through the API, which fall under the general ToS, Section H, and the AUP.
- Ambiguous: whether third-party agent content later read by a Copilot feature on the same repositories becomes "Input" under Section J.

### Data and AI training license in D.4

ToS, D.4 "License Grant to Us": GitHub may use Your Content "including by training AI Features, and for the purpose of training, developing, and improving artificial intelligence and machine learning models and technologies of our Affiliates". J.3: the opt-out "does not apply to the license granted in Sections D.4-D.8", and the J.3 license "does not extend to Your Content stored in repositories that are not provided as Input to an AI Feature". E.3, for private repositories: "If you provide your private repository content as Input to AI Features, we may use that Input to provide, develop, train, and improve the Service, including AI Features. Your ability to opt out under Section J.3 applies to this use of private repository content. We will not otherwise use your private repository contents to develop or improve the Service."

- The text says: D.4 licenses AI training on Your Content with no limit to public repositories, and the J.3 opt-out does not reach it.
- Ambiguous: how D.4, E.3, and J.3 fit together for private repositories that agents push to: E.3 limits private-repository use to Input given to AI Features, with the J.3 opt-out, while D.4 licenses training on Your Content generally and J.3 excludes D.4 from its opt-out; in particular, whether E.3, which speaks of "the Service", limits the training of Affiliates' models under D.4.

General Privacy Statement: under "Service Usage Information", "We collect data about your interactions with the Services", which covers the orchestrator's API calls; for third-party integrations, "the privacy policies of these third parties apply to any Personal Data you provide or consent to share with them". Beyond its general retention sentence, it does not say how long webhook delivery records or App audit data are kept, or whose personal data an App's activity is.

### Consequences for D15

No term found blocks [ADR 0006](../decisions/0006-github-first-scm.md): a self-hosted GitHub App with per-run installation tokens acting on the operator's own repositories appears to be permitted automation under the ToS and Section H. The ambiguous points are the separate reviewer identity, which no term addresses and which may be read against the AUP's "coordinated inauthentic activity" or, as a machine account, the one-free-machine-account limit; the undefined thresholds for "excessive" automated activity and API use, which may suspend API access after a reasonable attempt at an email warning, and for disruption of other users through pull requests, reviews, or notifications; and the D.4 AI-training license over Your Content, including private repositories.

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

- The review of GitHub's terms against Taskelith's use is recorded on 2026-10-25 in [Terms review](#terms-review); the owner's decision D15 on the remaining risk is pending before admission in G3 ([ADR 0007](../decisions/0007-g0-closure.md)).
- A real webhook receiver that verifies signatures on the raw body, in place of the API copy, covering every delivery of a run, including redeliveries and deliveries caused by cleanup.
- A reviewer identity separate from the App for approvals.
- Token refresh for runs longer than an hour, and rate-limit behaviour under load.
- Private repositories, and the minimum permission set without `administration` once protection is configured by an operator.
- Narrowing a token to one repository within an installation that has several, and cleanup after a failure in the middle of a run.
- GitHub's security-reporting process and service maintenance and support evidence, recorded with sources.
- Recovery and upgrade behaviour: API version retirement, service outages, and rate limiting during a run.
- The owner decided on 2026-10-24 to keep the qualification App's permissions, including administration, unchanged.
- Independent usage evidence recorded in the dependency register, and a re-check of the pinned API version when GitHub retires it.
