# Verification: record-network-fabric-decision

## Scope and source

Owner request on 2026-10-25: an analysis of integrating Tailscale so that Taskelith can work with machines registered in a Tailscale network, followed by the owner's decision recorded in [ADR 0012](../../../docs/decisions/0012-network-fabric-plugins.md): network connectivity to machines is a plugin/adapter capability; a plain local network is the default without Tailscale-like capabilities; a self-hosted Headscale adapter comes next; the hosted Tailscale control plane comes last. Prepared in the git worktree `../taskelith-worktrees/record-network-fabric-decision` on branch `record-network-fabric-decision`, created from `origin/dev` at `61e81f4`.

The change is documentation only: ADR 0012, one row in the architecture's open-decisions table, an update to acceptance requirement R35 for the narrow closed-provider exception, and one paragraph in the dependency register (with the R35 update added after pass 3). The `integration-decisions` requirement "Recorded owner integration decisions" already requires this record, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- ADR 0012 follows the structure and status conventions of the existing ADRs and records the six decisions, the context, and the consequences without claiming implementation, qualification, or review.
- Cross-references were checked against their targets: ADR 0003 decision 8, ADR 0004 principle 4, ADR 0008 decision 6, architecture sections 2, 13, and 15, invariants 4 and 13, findings F01 and F02, and G2 item 13 (implemented as `packages/modules/fleet/src/application/enrollment-service.ts`).
- The closed-provider exception is stated as a narrow, explicit owner scope change for the hosted Tailscale control plane only, consistent with the "Closed-provider exception stays narrow" scenario.
- Evidence check: external references are pinned to a tag or exact version, and documentation pages are labeled as unversioned. The author evidence for the external facts is recorded below.

## External facts (author evidence, observed 2026-10-25)

Commands and results:

- `curl -s https://api.github.com/repos/juanfont/headscale/releases/latest | grep -m1 '"tag_name"'` returned `"tag_name": "v0.29.6"`.
- `curl -s https://api.github.com/repos/tailscale/tailscale/releases/latest | grep -m1 '"tag_name"'` returned `"tag_name": "v1.104.2"`.
- `curl -s https://raw.githubusercontent.com/tailscale/tailscale/main/LICENSE | head -3` returned `BSD 3-Clause License` and `Copyright (c) 2020 Tailscale Inc & contributors.` The ADR pins the repository at tag `v1.104.2`.
- `curl -s https://raw.githubusercontent.com/juanfont/headscale/main/LICENSE | head -3` returned `BSD 3-Clause License` and `Copyright (c) 2020, Juan Font`. The ADR pins the repository at tag `v0.29.6`.
- The hosted coordination server being closed and Headscale being an independent implementation are also cited to the unversioned Tailscale page `https://tailscale.com/opensource`, retrieved 2026-10-25. `tsnet` being a Go library and the OAuth client flow come from Tailscale documentation pages, unversioned and retrieved 2026-10-25; the ADR labels them as unversioned.

These are author observations, not independent verification. The no-network reviewer could not confirm them; external confirmation by a network-capable reviewer remains a gate before any network fabric plugin is admitted.

## Checks

Environment for every command below: macOS 26.6.2 on arm64, Node v24.22.1, npm 12.2.1, in the worktree.

- `npm run openspec -- validate record-network-fabric-decision --strict`: valid; the `skip_specs` notice was informational.
- `make verify`: passed, including strict validation of every OpenSpec artifact (52 passed, 0 failed), the archive dry run, the comment-length rule, and package verification.
- After the pass-1 fixes, both checks were run again and passed.
- After the pass-2 fixes, both checks were run again and passed.
- The reviewer's own `git diff --check` passed in both passes.

## Independent review

Reviewer availability: Antigravity (`agy`, model `gemini-4-argon-medium`) was attempted first because it has network access; it failed with `RESOURCE_EXHAUSTED (429): Individual quota reached`, resetting in about 140 hours. It is unavailable under the governance rule for 30 minutes and in practice until the quota resets. Claude Code (`claude-fable-5-1`) was attempted next; it returned `No messages returned from query`. The owner then instructed on 2026-10-25: on this machine use only Codex. Codex has no network access, so external-fact verification is a recorded remaining gate.

- **Pass 1 — Codex, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a17388-0696-7e13-9bbe-85f70d81bc15`.** Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree. The output header confirmed the model, the reasoning effort, and the read-only sandbox. Snapshot before the pass: `984ae1f58dd09e76ada21af460d5ef6982af619a27c75684fa0ed98bceadf653`. The after-pass snapshot was not taken before the author started the fixes; the reviewer stated that it modified no file, and the later diff shows only the author's fix edits recorded here. This is a recorded evidence limitation. Findings: 0 Critical, 0 High, 4 Medium, 1 Low. All accepted:
  1. Medium: the new ADR reused number 0011, which `0011-mantine-ui-proof-of-concept.md` already uses. Fixed: renumbered to ADR 0012 in the file name, title, proposal, tasks, architecture row, and dependency register.
  2. Medium: `verification.md` was missing before the first pass. Fixed: this record was added in response, and the reviewer's flag is kept here as the honest history.
  3. Medium: the no-network reviewer could not verify the external facts. Addressed: the author evidence with commands and results is recorded above, and external confirmation is a remaining gate.
  4. Medium: the implementation gate was contradictory because G2 item 13 enrollment already exists. Fixed: the ADR, architecture row, proposal, and design now separate the existing enrollment from the future bounded change that adopts the port.
  5. Low: "loses no functionality" contradicted capability gating. Fixed: the ADR now says the base functionality is kept and mesh capabilities stay unavailable.

- **Pass 2 — Codex, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a1738c-3906-7bf2-a600-f8557498e0cb`.** The output header confirmed the model, the reasoning effort, and the read-only sandbox. Snapshot before and after the pass: `d94044637b8f85cec0d43894686ebe9229ccfee5744b5e1f6362976dd7a838ee`, identical. The reviewer confirmed all five pass-1 resolutions and reviewed the whole change again. Findings: 0 Critical, 0 High, 1 Medium, 2 Low. All accepted:
  1. Medium: the verification record lacked the environment for the checks and the pass-1 session ID. Fixed: the environment and session IDs are recorded here.
  2. Low: the ADR status line was ambiguous about enrollment. Fixed: it now says no network fabric port, plugin, or integration of network fabric with enrollment exists yet.
  3. Low: the record claimed an unversioned citation for the closed hosted server that the ADR did not carry. Fixed: the ADR now cites `https://tailscale.com/opensource` as an unversioned page retrieved 2026-10-25.

- **Pass 3 — Codex, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a1738f-dacb-7d81-a324-1700bfc965d3`.** The output header confirmed the model, the reasoning effort, and the read-only sandbox. Snapshot before and after the pass: `e09aa2da2c88dce81e6d93f07f9e81e2ab2d119aa1948436e439f38a659c86c4`, identical. The reviewer confirmed the three pass-2 resolutions and reviewed the whole change again. Findings: 0 Critical, 0 High, 1 Medium, 2 Low. Because the permitted three passes are spent, these are recorded as unreviewed fixes after the owner chooses the resolution option:
  1. Medium: architecture R35 listed the closed-dependency exceptions without the hosted Tailscale plugin, contradicting ADR 0012 decision 4. Fixed: R35 now names the optional hosted Tailscale control plane plugin with its evidence requirement and the preserved self-hosted alternatives.
  2. Low: the task list and remaining gates still described pass 2 as pending. Fixed: both are reconciled with what was done.
  3. Low: the record attributed pass 2's snapshots to the final tree although fixes followed. Fixed: the claim is limited to the tree reviewed in pass 2, and the pass-3 snapshots are recorded separately.

- **Pass 4 — Codex, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a17398-0ab5-79d1-809c-83228e255a10`, explicitly permitted by the owner after the three-pass limit.** Snapshot before and after the pass: `2467735f91402dd052d61ba6ca7a08b1f5848a4982dd406c8522ca792d2edb5e`, identical. The reviewer confirmed the three pass-3 resolutions and reviewed the whole change again. Findings: 0 Critical, 0 High, 0 Medium, 1 Low, fixed as an unreviewed fix under the Low-only rule, without another pass:
  1. Low: the scope descriptions in `verification.md`, `proposal.md`, and `tasks.md` did not name the R35 update. Fixed: all three now record it.

## Limitations

- No network-capable independent verification of the external facts in this task; the owner directed that only Codex be used on this machine.
- The after-pass-1 snapshot was not captured before the fixes began; pass 2's before and after snapshots prove read-only review for the tree reviewed in that pass, and pass 3's identical snapshots do the same for the tree reviewed in pass 3.
- The fixes made after pass 3 were reviewed in pass 4; the pass-4 Low fix is recorded as an unreviewed fix.
- The change records a decision only; no port, plugin, or integration exists.

## Remaining gates

- Owner decision on the pass-3 findings: accept the fixes as recorded unreviewed fixes, accept them as a known risk, or defer them.
- Coordinator integration into `dev` and archive.
- External-fact confirmation by a network-capable reviewer before any network fabric plugin is admitted.
