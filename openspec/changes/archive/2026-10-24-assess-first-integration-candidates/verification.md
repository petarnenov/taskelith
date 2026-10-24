# Verification

Date: 2026-10-24. Author verification and independent review are recorded separately below.

## Scope and source

Owner request: continue the remaining G0 work autonomously until an owner decision is required. Base revision: `77b1450d49669da58cac9a486469428031a3acc2`. Scope: `docs/integration-candidates.md` (new), the "First integrations" row of `docs/foundation.md`, and this change's artifacts. Documentation only; no runtime impact, dependency, lockfile, CLI, or tarball allowlist change.

## Research method

Two delegated research agents gathered candidate data from public primary sources (release pages, LICENSE files at tags, official documentation, registry metadata, and source at release tags). They did not modify the repository. The author then re-checked these claims directly:

- LICENSE files at tags: OpenCode v1.19.4 (MIT), goose v1.56.0 (Apache-2.0), Codex rust-v0.164.0 (Apache-2.0), OpenHands software-agent-sdk v1.58.1 (MIT), Forgejo v15.0.10 (GPL-3.0), Gitea v28.2.0 (MIT).
- npm registry: `opencode-ai` and `@opencode-ai/sdk` 1.19.4 (MIT), `@openai/codex` 0.164.0 (Apache-2.0), `@agentclientprotocol/sdk` 2.0.2 (Apache-2.0), `@charmland/crush` license `FSL-1.1-MIT`.
- Codex source at rust-v0.164.0: `codex-rs/model-provider-info/src/lib.rs` rejects `wire_api = "chat"` and supports only the Responses API.
- goose source at v1.56.0: `crates/goose/src/acp/server.rs` contains the ACP permission-request and session-load handling.
- Forgejo releases API: v17.0.0 (2026-10-15) with the upstream upgrade warning, v16.0.6 and v15.0.10 (2026-10-12). The release schedule lists 15.0 LTS end of life on 15 July 2027.
- GitLab FOSS tags: v19.5.1 (2026-10-20).

The remaining claims (for example telemetry defaults, footprint figures, adoption, and governance) carry the verification level stated in the document. Nothing was installed or executed.

## Checks

Under the exact CI pins Node v24.22.1 and npm 12.2.1:

- `npm test`: 19 tests passed, 0 failed. `npm run verify:dependencies`: passed (487 paths; 14 reviewed gaps). `OPENSPEC_TELEMETRY=0 npm run openspec -- validate --all --strict --no-interactive`: 9 passed, 0 failed. `npm run verify:package`: passed. These ran on macOS before the review findings below; the document will change, so they must be repeated.
- A local script checked every relative link and heading anchor in `docs/integration-candidates.md`, `docs/foundation.md`, `docs/dependency-inventory.md`, and `docs/dependencies.md`: no missing target or anchor.
- `git diff --check`: passed.

## Independent review

- **Pass 1 — Codex CLI 0.164.0, model `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`, session `01a16da4-3b6e-71e1-926f-6f877bb922bd`.** Findings: 0 Critical, 0 High, 7 Medium, 0 Low. All are accepted and open:
  1. `docs/integration-candidates.md:9`: criteria add requirements not in the architecture (account-free operation, telemetry, private security reporting, built-in CI). Separate architecture requirements from proposed preferences.
  2. `:52`: OneDev excluded for its enterprise module while Gitea and GitLab remain options. Apply one open-core rule.
  3. `:35`: Qwen Code excluded yet called a fallback; OpenHands telemetry unverified. Use consistent eligibility states.
  4. `:60`: no per-candidate matrix of the mandatory native capabilities. Add one with verified, unsupported, and unknown states.
  5. `:61`: options allow the same harness for G3 and G4. Present valid pairs.
  6. `verification.md:26`: check results not recorded. Resolved above.
  7. `:19`: no primary-source links. Add commit- or tag-pinned citations and mark unverified claims.
  Limitation: no network access.

Author re-checks for the rework, not yet applied to the document: the OpenCode server documentation lists `prompt_async`, `abort`, `permissions/:permissionID`, `fork`, and the `/event` SSE stream. The Codex app-server documentation states that "The app-server command and WebSocket transport are experimental and aren't supported for production workloads" and lists `thread/resume`, `turn/interrupt`, `turn/completed`, and `item/*/requestApproval`. OpenHands pause, interrupt, and confirmation routes were not found in a search of the v1.58.1 agent-server router sources and remain unverified.

Remaining findings after pass 1: 7 Medium (1 resolved in this record; 6 required document rework, followed by a renewed review).

## Rework after ADR 0003

The owner decided the integrations on 2026-10-24 (ADR 0003, including decision 9 on light license diligence until G8). The document was reworked to reflect those decisions and to resolve the six open findings:

1. Finding 1: requirements now come only from the architecture, ADR 0002, ADR 0003, the worker platform contract, and the trust model, each with a source. Account-free operation, an official TypeScript SDK, a private security channel, an LTS line, and built-in CI are preferences.
2. Finding 2: one open-core rule (ADR 0003 decision 5) and the same table rows apply to every SCM candidate. OneDev's closed module holds no required feature. (Pass 2 later separated requirements from proposed adapter criteria; see below.)
3. Finding 3: harnesses not selected use `ineligible`, `not ruled out`, or `not evaluated`. Qwen Code is `not ruled out` under ADR 0003 decision 4; OpenHands is `not ruled out` with its unverified items listed.
4. Finding 4: a capability matrix gives Claude Code, Codex, `agy`, and OpenCode a `verified`, `partial`, `unsupported`, or `unknown` state per mandatory capability, with sources. `agy` 1.4.7 has no external approval answering in headless mode and only process-level interruption.
5. Finding 5: the delivery sequence is G3 Claude Code and G4 Codex, which are distinct in vendor, process model, and protocol, followed by `agy` and OpenCode.
6. Finding 7: sources are pinned to a tag, commit, or exact package version. Unversioned vendor pages are marked "docs" with the retrieval date.

Research method for the rework: two delegated research agents gathered pinned sources from public release pages, tags, npm package contents, and vendor documentation without modifying the repository. The author re-checked the cited capability lines at the pinned sources: the `agy` 1.4.7 CHANGELOG lines 309, 622, 656, and 839; Agent SDK 0.3.310 `sdk.d.ts` lines 1626, 2123, 3290, 3702, and 5933; Codex rust-v0.164.0 `common.rs` lines 552, 558, 1070, 1088, 1816, and 1999 and the `wire_api = "chat"` error; and OpenCode v1.19.4 `server.mdx` lines 39, 159, 160, 167, 176, and 178. The research corrected earlier claims: Aider's latest release is 0.86.2 on PyPI (2026-02-12), Gitea tokens cannot be restricted to repositories, and the ACP schema tag is `schema-v1.26.0`. Unverified claims about Gogs (a path-traversal advisory and a single maintainer) were dropped. Nothing was installed or executed except the local `agy` and `claude` help and version output.

Checks after the rework, under Node v24.22.1 and npm 12.2.1: `npm test` 19 passed, 0 failed; `npm run verify:dependencies` passed (487 paths; 14 reviewed gaps); strict OpenSpec validation 10 passed, 0 failed; `npm run verify:package` passed; the local link and anchor check of `docs/integration-candidates.md` and `docs/foundation.md` found no missing target; `git diff --check` passed.

## Re-review

- **Pass 2 — Codex CLI, model `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`, session `01a16dbd-9a05-7122-98a9-f203aa9a1f5c`.** Pass-1 disposition: findings 3 and 5 resolved; 1, 2, 4, and 7 partially resolved. New findings: 0 Critical, 0 High, 5 Medium, 1 Low. All accepted and resolved:
  1. Medium: the telemetry rule went beyond ADR 0003 decision 4. It now covers telemetry only; other vendor traffic is recorded and left to the owner. Cline is `not ruled out`, and the egress test no longer restricts destinations to the provider and SCM.
  2. Medium: native capabilities were treated as an eligibility rule. They are now a G3 requirement plus a rule that plugins declare only native capabilities. Missing capabilities no longer make a harness ineligible (Aider is `not ruled out`).
  3. Medium: SCM mechanisms lacked architecture authority. They are now proposed adapter criteria; the requirement rows are open-source self-hosted deployment, project-scoped credentials (trust model), and G3 review and verification evidence. GitLab CE, OneDev, and Gogs are `not ruled out` with their gaps listed.
  4. Medium: the open-core rule ignored the closed-harness exception. It now applies only to components that must be open source.
  5. Medium: missing evidence. License sources were added for goose, OpenHands, Gemini CLI, Qwen Code, and Cline (re-checked by the author at the pinned commits), Aider and Roo Code have sources, unversioned pages are labeled "docs", and unsourced claims are marked unverified.
  6. Low: the remaining gates listed decisions already made. Corrected below.
  Limitation: no network access; external claims were listed as unverifiable, not reported as findings.
- **Pass 3 — same model, effort, and sandbox; session `01a16dc1-b91a-7da3-9c99-07cc4ed2904e`.** Findings: 0 Critical, 0 High, 2 Medium, 0 Low. Both accepted and resolved:
  1. Medium: Roo Code's archival was treated as an automatic exclusion. It is now `not ruled out` with a high maintenance risk.
  2. Medium: incomplete evidence labels. ACP support is sourced for goose and OpenCode and marked unverified for Qwen Code, Cline, and Gemini CLI; the Gitea/Forgejo API resemblance, Checks API, and SourceHut statements are marked unverified; Aider's license (Apache-2.0, PyPI classifier, re-checked by the author) is added.
- **Pass 4 — same model, effort, and sandbox; session `01a16dc4-fb82-7992-a23d-371b6cd5c06e`.** Findings: 0 Critical, 0 High, 1 Medium, 1 Low. Both accepted and resolved:
  1. Medium: OneDev and Gogs cells and the `agy` terms link lacked sources or labels. Pinned OneDev and Gogs sources are added, the remaining OneDev and Gogs cells are declared unverified, and the terms link is labeled "docs".
  2. Low: the Gogs gap count is corrected to six of seven.
- **Pass 5 — same model, effort, and sandbox; session `01a16dc7-8d31-7c42-9df8-f45a0ee4bce4`.** Findings: 0 Critical, 0 High, 1 Medium, 0 Low. Open:
  1. Medium: `docs/integration-candidates.md`, "Qualification before admission", SCM item: proposed adapter criteria (pull request and review APIs, commit statuses, protected-branch blocking, signed webhooks, generated TypeScript client) read as mandatory admission tests. Separate mandatory admission tests from proposed Forgejo adapter checks.
  The owner capped review loops at three passes on 2026-10-24, after this pass had started, and approved fixing this finding without another review pass. Resolved by the author: the qualification list now separates SCM admission tests (from the architecture and trust model) from proposed Forgejo adapter checks, whose failure is assessed rather than an automatic rejection. **This fix has not been independently reviewed.**

Checks after the pass-4 fixes, under Node v24.22.1 and npm 12.2.1: `npm test` 19 passed, 0 failed; `npm run verify:dependencies` passed; strict OpenSpec validation 10 passed, 0 failed; `npm run verify:package` passed; local link and anchor check passed; `git diff --check` passed.

## Remaining gates

Version-specific qualification of the selected integrations and dependency register updates, integration (commit, push, merge), and archival, which require explicit owner authorization. The owner's later decisions on `agy` approvals and non-telemetry vendor traffic (ADR 0003 decisions 10 and 11) were propagated to this document within `record-first-integration-decisions` and reviewed there by Antigravity pass 3 (conversation `35b4fc37-1137-48d5-bb29-7422c66c572a`).

## Integration

The owner authorized integration and archival on 2026-10-24. Integrated into `main` at `55866cfcf3e9e1c6c740ba63de556412354f5689` through pull request #3 (rebase merge). The `main` workflow run 40092893183 passed verification; semantic-release found no relevant changes, so no version was released. Archived with the pinned OpenSpec CLI afterwards.
