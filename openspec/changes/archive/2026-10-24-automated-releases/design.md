## Context

Taskelith 0.1.0 was published manually. The project requires an automated release path compatible with npm's retirement of direct 2FA-bypass token publication.

## Goals / Non-Goals

Goals: automatic SemVer, release notes, npm publication, provenance, and validation gates.
Non-goals: removing account MFA, custom versioning infrastructure, product runtime changes.

## Decisions

Use semantic-release with its Conventional Commits analyzer, release notes, npm, and GitHub plugins. Only main publishes. Git tags identify published versions; package.json is updated in the release workspace and package, without a generated version commit. Anchor the existing release with v0.1.0 at its source commit before enabling automation.

Use GitHub-hosted runners and npm OIDC with contents:write and id-token:write only in the release job. Verification and pull requests have read-only repository permissions. Do not set NPM_TOKEN or NODE_AUTH_TOKEN. Disable GitHub issue/PR release comments, so no issue write permission is needed.

Use pinned Node/npm versions and action SHAs. Install dependencies with lifecycle scripts disabled. Run the explicit build and tests, strict OpenSpec validation, and verify the actual npm tarball by installing it in a temporary directory. Serialize release runs without cancellation.

## Risks / Trade-offs

Conventional Commit mistakes can omit a release or select an incorrect version. Document the rules, including breaking changes. Publishing trusts code merged to main; repository owners control access. npm trust configuration is external state and must be verified by an actual OIDC release. npm publication and GitHub release creation are not atomic: inspect registry and tags before retrying a partial failure.

## Migration Plan

Create the baseline tag, commit the workflow, configure npm trust for release.yml, and verify the first automatic release. Disable the release workflow to stop future automation; do not delete published versions or move published tags.

## Open Questions

None. Record observed verification and any external authentication gate in verification.md.
