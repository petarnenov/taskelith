## Context

The owner decided D1, D2, D3, D5, D17, and D18 of the G3 plan on 2026-10-25 and authorized item 1 to start ahead of the G3 start. Item 1 records the evidence the dependency policy requires before items 10, 16, 19, 28, 39, and 40 install or call these libraries and tools. G2 item 1 (`qualify-g2-infrastructure`) set the pattern: an evaluation document with cited sources and an "unverified" marker, and a register section that lists each proposed component as `candidate`.

## Goals / Non-Goals

**Goals:**
- Exact versions, licenses, security routes, advisories, and maintenance evidence, with access dates, for every library and tool the decisions name or leave open.
- A labeled proposal wherever a decision leaves a choice: the hashing primitive and cookie parser under D2, the git build per platform under D3, the GitHub client packages, the xterm.js addons and node-pty build under D18, and the Vite React plugin and DOM test environment under D1.

**Non-Goals:**
- Adding any package to `package.json` or the lockfile, or writing code.
- Admitting any component beyond `candidate`, reopening a decision, or moving the Claude Agent SDK pin (item 19).

## Decisions

- **New document and capability.** `docs/g3-dependencies.md` holds the evaluation, and the new `g3-dependency-evaluation` capability states its requirements, as `infrastructure-tooling` does for G2 item 1. A spec delta, not `skip_specs`, because no existing requirement covers G3 dependency evidence.
- **Proposals (the author's).** Node's built-in `crypto.argon2` over the hashing libraries, because it adds no native add-on and works under `npm ci --ignore-scripts`, with `@node-rs/argon2` as the fallback and `argon2` excluded for its missing darwin-x64 binary; `cookie` instead of a session library, because the HTTP layer is plain `node:http`; Ubuntu's security-maintained git and Apple's git, called by explicit path; the modular Octokit packages without retry and throttling plugins; `node-pty@1.1.0` compiled on Linux instead of a prerelease or a third-party fork.
- **Evidence gathering.** Three research passes collected registry, repository, and advisory facts. The author rechecked the latest version and license of each proposed npm package, the bundled CLI version of the latest SDK, the prebuilt directories in the `node-pty@1.1.0` tarball, `crypto.argon2` under Node 24.22.1, and the GitHub API versions.

## Risks / Trade-offs

- Upstream facts change after 2026-10-25 → every fact carries its access date, and each installing item rechecks versions and advisories before pinning.
- `node-pty` needs a native build on Linux → item 39 builds it in the worker image's build stage and states how it runs the build under `--ignore-scripts`.
- A Taskelith-owned PHC encoder for `crypto.argon2` is extra code → item 10 tests it fully and its review checks it against the rule against custom cryptography; `@node-rs/argon2` stays the fallback.
- `@tanstack/react-query` has no documented private security route → recorded; advisories are followed through public databases.
