## Context

The CLI guard decides whether the module was started directly or imported, for example by `test/check-boundaries.test.ts`. `import.meta.url` is the real path because Node resolves symlinks of the main module by default; `process.argv[1]` is the path as typed.

## Goals / Non-Goals

Make the guard symlink-independent. Do not change the checks, their messages, the exit code policy, or the npm scripts.

## Decisions

Use `realpathSync(process.argv[1])` on the invocation side instead of `resolve`. Both sides are then real paths. The guard is evaluated whenever the module loads, including when it is imported. `realpathSync` throws if `process.argv[1]` names no existing file, for example when the module is imported by `node -e` with a stray argument; the old `resolve` did not. A loud failure in that case is acceptable for a development script, and no invocation in the repository reaches it: `npm run check:boundaries` and `node --test` both pass an existing file. The regression test symlinks the script into a temporary directory that is itself reached through a directory symlink, runs it with the current Node binary in a fixture containing a Go file, and asserts a non-zero exit with the R02/R36 violation. It does not depend on the platform's temporary directory being a symlink.

## Risks / Trade-offs

Starting Node with `--preserve-symlinks-main` would make `import.meta.url` the symlink path and the guard false again; no script in the repository uses that flag.
