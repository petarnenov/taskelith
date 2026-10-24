## Context

ADR 0006 chose a GitHub App with per-run installation tokens. The trust model requires credentials limited to the project, and the G3 exit evidence needs pull requests, independent review, and verification evidence.

## Goals / Non-Goals

Prove the qualification targets with the App's own credentials and leave no branch or protection rule behind. Do not write the SCM plugin, configure production protection, or change `dev` or `main`.

## Decisions

- Use only App credentials: a JWT for App endpoints and installation tokens for repository calls; request a narrowed token to test least privilege.
- Work on temporary `qual/scm-*` branches from `dev`, target the pull request at a temporary base branch, and attempt every cleanup step independently in a `finally` step.
- Test denial with a write to another repository, because reading a public repository succeeds for anyone.
- Test merge blocking with the App's own credential, which exposed the administrator bypass; record `enforce_admins: true` as a plugin requirement.
- Verify the signature of every delivery attributed to the run (by installation, repository, and time) in one inspection snapshot from the delivery API, because the qualification has no public receiver; deliveries after the snapshot, such as redeliveries and cleanup events, are recorded as outside it.

## Risks / Trade-offs

The repository is public, so the temporary branches and pull requests were visible while they existed. The App holds the administration permission until the owner removes it. The signature check uses the API's copy of the payload, not the raw body a receiver sees.
