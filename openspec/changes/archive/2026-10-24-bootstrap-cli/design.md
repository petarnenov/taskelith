# Bootstrap design

## Context

Taskelith is a greenfield TypeScript software factory. This release provides a useful entry point to its plan, not a running orchestrator.

## Goals / Non-Goals

Goals: an executable npm bin, truthful help, a stable version, and access to the packaged architecture plan from any working directory.
Non-goals: project initialization, account login, orchestration, plugins, workers, databases, and UI.

## Decisions

- Compile src/cli.ts to dist/cli.js with a Node shebang.
- Read version from the adjacent package manifest, avoiding duplicate version constants.
- Resolve bundled documentation relative to import.meta.url, never the caller's working directory.
- Use a package file allowlist; ship no credentials, source tests, or development dependencies.
- Use exit code 2 for invalid command usage. Help and version need no network.

## Verification

Run build and behavioral CLI tests. Validate OpenSpec artifacts. Pack the package, inspect its file list, and invoke the packed bin outside the checkout. Verify the published npm version and bin after authenticated publication.

## Risks / Trade-offs

A small hand-written command dispatch is sufficient for three operations; add an established CLI library only when real command complexity warrants it. The initial release intentionally does not expose unimplemented runtime commands.
