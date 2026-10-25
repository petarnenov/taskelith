# Verification: draft-g3-plan

## Scope and source

Task assigned by the coordinator (Niki) on 2026-10-25, after the owner approved drafting the G3 plan the same day: draft `docs/g3-plan.md` in the shape of the G2 plan, marked as a draft that authorizes no implementation and is finalized when G2 closes, documentation only, with UI items marked. Base revision: `da3040c` on `dev`. Scope: `docs/g3-plan.md` (new) and this change. Prepared in the git worktree `../taskelith-worktrees/draft-g3-plan` on branch `draft-g3-plan`. Sources: the G3 row of `docs/architecture.md` section 13 and sections 6, 7, 11, 14, and 15; ADR 0003, ADR 0005, ADR 0006, ADR 0007, ADR 0008, and ADR 0010; the `product-ui` and `delivery-planning` specifications; the Claude Code and GitHub qualification records; the capacity reservation, supervisor identity, and execution wire contracts; the trust contract; and `docs/g2-plan.md`.

During the task the owner decided D1 in the project conversation on 2026-10-25: the SPA uses React, Vite, Vitest, React Router, and TanStack Query (React Query) at their latest versions; it follows the UI proof of concept's design, and a component library that fits that design may be added for one look and feel. The plan records D1 as decided and adds D17 for the choice of that library; the owner asked for a comparison of candidate libraries to decide it. After the final review pass, on 2026-10-25, the owner chose Mantine for D17, to recreate the proof of concept as closely as possible with only what Mantine offers and without customizations; the plan records D17 as decided.

The change adds no requirement: the `delivery-planning` requirement "Gate work plan" applies from G1 onward, so `.openspec.yaml` sets `skip_specs: true`, as the agent task protocol allows for documentation under an existing requirement.

## Author self-check before review

- Every element of the G3 row and exit evidence in architecture section 13, the section 15 items due before G3 acceptance (first-provider chat and approval semantics, evidence storage), ADR 0010's code-head deferral, ADR 0007's terms review and G3 acceptance rows, the G3 port contracts of ADR 0008 decision 6, ADR 0005's account pools, and the G2 hand-offs (subscription account slots, the agent harness port, the macOS process-group obligation) map to at least one item.
- The draft authorizes no implementation. Apart from the owner's D1, every option and recommendation is the author's proposal and is labelled as one; each open decision names the items it blocks. Candidate libraries appear only as options inside owner decisions. No product code, dependency, or installation is added.
- Evidence check: the added text contains no external link, only relative links to repository files, so no link needs a pin. Each relative target exists, and the anchors `architecture.md#delivery-sequence` and `agent-task-protocol.md#roles` match headings. The same holds after each round of fixes.

## Checks

In the worktree, Node v24.22.1:

- Before the first review pass: `npm run openspec -- validate draft-g3-plan --strict` passed, and `make verify` passed (strict OpenSpec validation 49 passed, 0 failed; every active change archives into strictly valid specs; package verification passed).
- After the pass-1 fixes, a script recomputed the waves from the "Depends on" column and checked that every decision in a "Blocked by" entry lists that item under "Applies to"; both matched. `make verify` passed after the fixes (strict OpenSpec validation 49 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Assigned reviewer (by the coordinator): Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree. Codex has no network access; the plan states no external fact that the review depends on.

- **Pass 1 — session `01a1729b-5295-7db1-8ee3-ca93a649af8e`, base `da3040c` with the change staged.** The header confirmed the model, reasoning effort medium, and the read-only sandbox. The worktree snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `6316dce9…1663` before and after the pass. The reviewer confirmed that the waves match the dependencies, that the longest chain is valid, that links and anchors resolve, that D1 is recorded with its date, and that `skip_specs: true` fits. Findings: 0 Critical, 1 High, 6 Medium, 0 Low. All accepted and resolved (unreviewed until pass 2):
  1. High: no item implemented project setup or the server-side board, task, and inbox views. New items 11 `implement-project-setup` and 15 `implement-board-and-inbox-views`; the UI items depend on them.
  2. Medium: the board, inbox, intake, write-back, and auto-merge port contracts of ADR 0008 decision 6 had no item. New contract item 8 `define-product-ports`, before the wire contracts, auto-merge, intake, and views.
  3. Medium: delegated spec approval existed only in the UI. New item 22 `implement-spec-approval-policy`; the new-task screen depends on it, and the settings screen shows the policy.
  4. Medium: GitHub admission could leave entries of its "Remaining before admission" list open. Items 35 and 36 close the whole list, and each entry left open is named and needs the owner's explicit decision.
  5. Medium: no SCM conformance suite. Item 7 defines a harness-neutral suite, including a refused merge while a required status is pending; item 20 runs it with the plugin's own credential.
  6. Medium: acceptance missed two R29 scenarios. Item 38 adds the duplicate response and a reused native request ID under another provider generation, and item 4 models their rejection.
  7. Medium: `verification.md` was missing before the first pass. This record is added.

  The new items renumber the plan; the waves, the longest chain, and every decision's "Applies to" entry were recomputed.

  Also before pass 2, D17's options and recommendation were updated from a web comparison of component libraries made on 2026-10-25 at the owner's request (versions, licenses, React 19 support, styling cost, accessibility, coverage, maintenance, and security routes, from npm, GitHub, and official documentation); the facts the plan states are labelled as observations that item 1 confirms.

- **Pass 2 — session `01a172a2-922b-7912-8cbf-d55f610ef5d4`, head `ede4c71`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot was `f0f8b55c…a21dc23` before and after the pass. The reviewer confirmed all seven pass-1 resolutions, the waves, the longest chain, the links, and the D1 record. New findings: 0 Critical, 0 High, 2 Medium, 1 Low. All accepted and resolved (unreviewed until pass 3):
  1. Medium: item 3's scope depended on D13 without being blocked by it. The port declares the optional capabilities whatever D13 decides, and D13 now applies only to item 18.
  2. Medium: the SCM port did not limit a per-run credential to the permissions the run needs. Item 7 adds that limit and a conformance check that a credential without write permission cannot write.
  3. Low: D17 claimed that unstyled primitives reproduce the proof of concept's look exactly. It now states this as an expectation that item 1 confirms.

- **Pass 3 — session `01a172a6-7d54-7110-a77c-25fc87770cbc`, head `fd85b3c`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot was `432a6136…f470` before and after the pass. The reviewer confirmed all three pass-2 resolutions and reviewed the whole change again. Findings: 0 Critical, 0 High, 0 Medium, 0 Low. Only this record entry was added after the pass.

- **Unreviewed after pass 3.** Recording the owner's D17 decision changed `docs/g3-plan.md` (status line, items 1 and 28, the decision table), `proposal.md`, and this record. It records an owner decision and fixes no finding; the review cap of three passes is spent, so it is unreviewed. `make verify` passed afterwards.

## Limitations

- The plan assumes the G2 items as planned; the G2 closure ADR may change the starting point and carry deferrals into G3.
- The UI proof of concept is outside the repository (ADR 0008), so the reviewer could not compare D17's options against it.

## Remaining gates

- Coordinator integration into `dev` and archive.
- Finalization of the plan when G2 closes, and the owner's decisions D2 to D16.
