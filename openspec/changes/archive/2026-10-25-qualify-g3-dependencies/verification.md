## Scope and source

G3 plan item 1, `qualify-g3-dependencies` (`docs/g3-plan.md`, row 1), for the owner's decisions D1, D2, D3, D5, D17, and D18 of 2026-10-25. On 2026-10-25 the owner authorized this one documentation-only item to start ahead of the G3 start, while G2 finishes; every other G3 item stays not started. The coordinator assigned it on 2026-10-25 with Claude Code (`claude-fable-5-1`, medium effort) as the reviewer. Scope: `docs/g3-dependencies.md`, the "G3 dependencies" section and two sentences of `docs/dependencies.md`, and this change with the `g3-dependency-evaluation` capability. Excluded: any change to `package.json` or the lockfile, code, and any status beyond `candidate`.

## Revision and environment

Branch `qualify-g3-dependencies` from `origin/dev` at `b4b3885`; reviewed head `3e7a9ae`. macOS 26.6.2 x86_64, Node.js 24.22.1 through nvm, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- Three research passes collected registry, repository, advisory, and package-archive facts on 2026-10-25; tarballs were packed in a scratch directory outside the repository without lifecycle scripts, and runtime probes ran there and in disposable `ubuntu:24.04` containers.
- The author rechecked the latest version and license of each proposed npm package, `claudeCodeVersion` 2.1.310 of the SDK's latest version, the `prebuilds/` directories of `node-pty@1.1.0` (darwin and win32 only), `crypto.argon2Sync` with argon2id under Node 24.22.1 (OpenSSL 3.5.9), the osv.dev result for `node-pty@1.1.0`, and `GET /versions` of the GitHub API (`2026-03-10`, `2022-11-28`).
- No decided option was found unsuitable; the findings for later items are listed in section 8 of the evaluation and were reported to the coordinator.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate qualify-g3-dependencies --strict` | Passed before review and after the fixes |
| `make verify` | Passed before review (head `3e7a9ae`) and after the fixes |

## Review

Pass 1 (Claude Code):
- Invocation: `claude -p "$(cat <prompt-file>)" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, run from the worktree; the prompt and output were kept outside it. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the dependency policy, the `dependency-register` and `infrastructure-tooling` specifications, and the delta, and asked the reviewer to check the external facts against their sources across every section.
- Model confirmation: `claude-fable-5-1` is the only model in the JSON `modelUsage`. Session ID `eddc4753-b234-440e-b3a1-be11da2a6bbb`.
- Snapshot: `84b4b0b15d74bb6502c6f87018273b0252e1f580a2ebf5ee73fed490a8c2be0f` before and after; unchanged.
- Facts checked by the reviewer: registry metadata of all 21 packages in the tables and of the alternatives, osv.dev for every evaluated version, PVR state of 16 repositories, every cited advisory ID with its ranges, tag-to-commit mappings, provenance, and all 34 cited URLs. Not checked by the reviewer: the author's runtime probes, the platform-package count and release gap of `@node-rs/argon2`, and the `octokit` tree size.
- Findings: 0 Critical, 0 High, 0 Medium, 4 Low.
  1. Low: the jshttp policy was cited at `HEAD`, and the Express policy holding the e-mail route was not cited. Both are now pinned to commits.
  2. Low: the Homebrew formula API and the Vite and Vitest release pages were not named as unversioned services. Added to the evidence rules.
  3. Low: the claim that Octokit sets no `X-GitHub-Api-Version` cited a README example. It now cites the defaults of `@octokit/endpoint@11.0.5`.
  4. Low: Node 24's maintenance LTS start on 2026-10-20 was missing. Added.

By the [review process](../../../docs/governance.md#independent-review-process), a pass with only Low findings is fixed without another review; these fixes are **unreviewed**.

## Limitations

Upstream facts are observations of 2026-10-25. No package was installed into the repository; native packages were not built, and `node-pty`'s Node 24 support and the jsdom preference are unverified. The reviewer did not repeat the runtime probes.

## Remaining gates

Integration by the coordinator (pull request into `dev`, merge) and archival; installation, pinning, and qualification of each component by items 10, 16, 19, 28, 39, and 40; admission by the owner.
