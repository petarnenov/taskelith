# Bootstrap Taskelith CLI

Issue: https://github.com/petarnenov/taskelith/issues/1

## Why

Taskelith needs a public project home and an installable CLI that exposes the architecture plan while clearly identifying the product as an early bootstrap.

## What Changes

- Add MIT licensing, English repository documentation, and contributor language rules.
- Add a TypeScript CLI exposing help, version, and the bundled architecture plan.
- Package only compiled CLI output and public documentation.
- Publish version 0.1.0 after tarball verification and authenticated owner publication.

## Capabilities

### New Capabilities

- `bootstrap-cli`: discover the project, inspect its version, and read the bundled plan.

### Modified Capabilities

None. This is a new project.

## Impact

Creates a public npm package and GitHub repository. Does not implement agents, scheduling, databases, or the SPA. No runtime dependencies. TypeScript, Node type declarations, and OpenSpec are development dependencies.

## Authorization and Review

The owner explicitly requested repository creation and npm/CLI publication. This is a bounded bootstrap, not authorization to implement the architecture roadmap. Author checks are recorded in verification.md; no independent reviewer approval is claimed.

## Risks and Rollback

The package name and public version are externally visible. Inspect the packed files before publishing. For a bad published release, issue a corrected version or deprecate the affected version; do not assume publication can be undone. No user state is created by the CLI.
