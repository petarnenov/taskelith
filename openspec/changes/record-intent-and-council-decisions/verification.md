# Verification: record-intent-and-council-decisions

## Scope and source

On 2026-10-25 the owner described, in Bulgarian and paraphrased here, the intended use of Taskelith: submit an intent, run the full SDLC cycle, implement by gates, generate a blueprint of tasks with a dependency map, and dispatch tasks automatically in the order the map allows. The owner then decided the intent/campaign hierarchy, the recursive proposal generation, the dependency-preserving operator overrides, one integration branch per intent promoted into the project's integration branch, the three-consul decision council with majority voting and a precedence tie-break, the council's authority up to the integration branch, the owner-only promotion into `main`, and that implementation starts only on an explicit owner authorization. The change records those decisions; it implements nothing.

Base revision: `166a910` on `dev`. Developed in the worktree `../taskelith-worktrees/record-intent-and-council-decisions` on branch `record-intent-and-council-decisions`, following the worker steps.

## Environment

macOS on arm64, Node.js 24.22.1, npm 12.2.1.

## Author self-check before review

- Each owner decision from the conversation appears once, in the ADR that owns it, and the two ADRs do not contradict each other.
- The governance policy, trust model, architecture, and SDLC framework mapping agree with the two ADRs; policy version 4 is the only governance version bump.
- All repository content is English. Links inside packaged documents use the repository's absolute decision links, because only `docs/architecture.md` ships in the package.
- No product code, dependency, contract, schema, or runtime behavior changes. The change sets `skip_specs: true`.

## Evidence check

The change cites no new external fact or external link. It refers to decisions and artifacts already recorded in this repository: ADR 0003, ADR 0008, ADR 0005, the governance policy, the trust model, and the frozen SDLC framework port. Those references are internal and relative. The packaged-document link rule is satisfied: `docs/architecture.md` links to the two new ADRs by absolute GitHub URL.

## Checks

Run on the working tree at base `166a910` plus this change:

- `npm run openspec -- validate record-intent-and-council-decisions --strict`: passed on both runs, with the expected `skip_specs` notice.
- `make verify`: passed after one fix. The first run failed `verify:package`, because `docs/architecture.md` linked to the new decisions by relative path while only `docs/architecture.md` ships in the package. The links were changed to the repository's absolute GitHub form, and the run after commit `fd61dce` passed:
  - comment length rule: every comment within the rule;
  - workspace and hexagonal boundary checks: passed;
  - 1088 tests passed, 0 failed;
  - coverage over product code: 99.24% lines, 91.79% branches, 98.96% functions;
  - contract compatibility: passed;
  - dependency inventory: 731 package paths, 41 license coverage gaps reviewed;
  - strict OpenSpec validation: 58 passed, 0 failed;
  - archive dry run: every active change archives into strictly valid specs;
  - package verification: packed allowlist and installed CLI passed.
- `make verify` was run again after the first review pass's fixes were applied and passed with 1088 tests, 0 failed, coverage 99.24% lines, 91.80% branches, 98.96% functions, 58 strict OpenSpec items, 731 package paths, and the same archive and package results.
- `make verify` was run a third time after the second review pass's fixes and passed with 1088 tests, 0 failed, coverage 99.24% lines, 91.79% branches, 98.96% functions, 58 strict OpenSpec items, 731 package paths, and the same archive and package results.

## Independent review

Reviewer assigned by rotation: Codex CLI (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, because Claude Code had reviewed the preceding task and the Antigravity CLI is paused until about 2026-10-31. Invocation, run from the worktree with the prompt and log outside it: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the two new ADRs, and the documents this change touches, and listed the owner's decisions for fidelity checking.

- **Pass 1 — session `01a174bc-67d6-75e0-80c7-cffcb62c494f`, head `fd61dce`.** The header confirmed Codex v0.164.0, the model, effort medium, and the read-only sandbox. The snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `32c9fe833e65e052a801cd81b1352fd148559bf01a2e46df8133b42593fbb1f5` before and after the pass. Findings: 0 Critical, 5 High, 4 Medium, 0 Low. Resolutions:
  1. High — partial council substitution and degraded mode were undefined. ADR 0014 decision 2 now requires all three seats, forbids substitution, escalates to a human, and leaves a degraded mode to a separate owner decision; decision 8, the governance policy, and the design agree.
  2. High — standing approval expanded spec approval into a merge without ratification. ADR 0014 decision 6 now separates the owner's standing-approval mode from the specification inheritance of ADR 0013 decision 8, and makes each use a revision-bound record that ratifies the change's current verification and review evidence; decision 3 states that ratification happens by decision or by the standing rule and never by waiving evidence; the design and the proposal match.
  3. High — a hold could be placed on a prerequisite after a dependent was requested. ADR 0013 decision 6 now rejects such a hold and names the node it would block, and defines the scope of a hold over containment and dependency; pass 2 found the first wording incomplete, and the final rule covers both scopes, as recorded below.
  4. High — readiness was defined only by dependencies. ADR 0013 decision 5 now defines integration per node and makes graph readiness necessary but not sufficient, with admission, gates, holds, and capacity also required; the architecture and the design agree.
  5. High — owner-only promotion into `main` was not excluded from general integration authority. The governance Authority paragraph, ADR 0013 decision 7, ADR 0014 decision 9 and its prohibition, the architecture invariants and campaign subsection, and the design now state that no integrator, auto-merge setting, or council approval authorizes that merge.
  6. Medium — `integrated` had no meaning for a campaign. ADR 0013 decision 5 now defines completion and integration for a change, a campaign, and an intent.
  7. Medium — the default precedence contradicted the recorded order. ADR 0014 decision 2 and the design now name the owner-approved default Claude, Codex, OpenCode, set at appointment.
  8. Medium — G4 was presented as a sufficient delivery gate. ADR 0013, ADR 0014, the architecture, the design, the proposal, and this record now say the council needs all three admissions plus the owner's authorization and fix no delivery gate.
  9. Medium — the appointment delegation to a project-maintainer was unrecorded. ADR 0014 decision 1 now reserves appointment and rotation to the owner.
- **Pass 2 — same reviewer and session `01a174bc-67d6-75e0-80c7-cffcb62c494f`, head `4c9b318`.** Invocation: `codex exec resume 01a174bc-67d6-75e0-80c7-cffcb62c494f -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -c sandbox_mode='"read-only"' - < <prompt-file>`, with the prompt and log outside the worktree. The prompt asked the reviewer to confirm each pass 1 finding before reviewing the whole change again. The snapshot was `d6162713aa88d388493d4ea4bc40d83c9e9668f4a249038de0ac1687599e45fd` before the pass; the worktree stayed clean at the same head during it, and no edit was made. Pass 1 status: 6 resolved, 3 partially resolved (2, 3, 7). Findings: 0 Critical, 2 High, 1 Medium, 1 Low. Resolutions:
  1. High — standing merge approval was not reconciled with the owner's decisions or with ratification. ADR 0014 now records the owner's separate standing-approval decision in Context; decision 3 ratifies outcomes by decision or by the standing rule and never waives evidence; decision 6 defines the use as the mechanical application of the intent decision to current evidence, records a revision- and evidence-bound decision record, voids on stale revisions, failed or missing gates, a blueprint departure, a consul's request for a vote, or policy sampling, and explains why no consul deliberates in a use while any actual vote follows the independence rule. The design, the proposal, ADR 0013 decision 9, and the architecture subsection agree.
  2. High — the revised hold rule lost contained children and contradicted its own sibling clause. ADR 0013 decision 6 now defines one blocked set: the held node, every node it contains, and every node that transitively depends on either. A prerequisite and an unrelated sibling are never blocked; a dependent sibling waits because of its dependency; a change inside a held campaign is blocked by containment. The hold is rejected when any node in that set was already requested or queued, naming it. The architecture invariant 16, the campaign subsection, and the design carry the same rule.
  3. Medium — `integrated` excluded standalone changes and let an intent be integrated before promotion. ADR 0013 decision 5 now defines a change against its integration target, the intent branch or the project's integration branch for a standalone change, and separates promotion-ready from integrated for an intent, which is integrated only after its promotion merge completes; the architecture subsection agrees.
  4. Low — the Risks section stated the tie-break unconditionally. ADR 0014 now qualifies it with the owner-approved default order and the appointment-set ranks.
- Pass 3 is pending and will confirm these four resolutions and review the whole change once more; it is the last pass under the three-pass rule.

## Limitations

- Documentation only. The campaign model, blueprint manifest, dispatcher, branch ladder, council, decision records, and communication plugin are recorded designs, not implemented behavior.
- The delivery note in ADR 0013 and the delivery-order decision in ADR 0014 mean the council cannot be constituted before Claude Code, Codex, and OpenCode are admitted, so the full model follows those admissions and a separate owner authorization; no delivery gate is fixed.
- No runtime claim is made: `make verify` proves the repository's checks on this tree, not the future behavior of the recorded design.

## Remaining gates

- Independent review and its recorded findings.
- Coordinator integration into `dev`.
- The owner's explicit authorization before any implementation of ADR 0013 or ADR 0014 starts.
