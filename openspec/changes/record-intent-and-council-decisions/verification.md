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

Run on the working tree at base `166a910` plus this change, before the verification record was committed:

- `npm run openspec -- validate record-intent-and-council-decisions --strict`: passed, with the expected `skip_specs` notice.
- `make verify`: passed after one fix. The first run failed `verify:package`, because `docs/architecture.md` linked to the new decisions by relative path while only `docs/architecture.md` ships in the package. The links were changed to the repository's absolute GitHub form, and the final run passed:
  - comment length rule: every comment within the rule;
  - workspace and hexagonal boundary checks: passed;
  - 1088 tests passed, 0 failed;
  - coverage over product code: 99.24% lines, 91.79% branches, 98.96% functions;
  - contract compatibility: passed;
  - dependency inventory: 731 package paths, 41 license coverage gaps reviewed;
  - strict OpenSpec validation: 58 passed, 0 failed;
  - archive dry run: every active change archives into strictly valid specs;
  - package verification: packed allowlist and installed CLI passed.

## Independent review

Pending. No reviewer has been assigned for this change yet. Per the governance review process, the assigned reviewer runs read-only with the model and effort set in the invocation, and `verification.md` records the invocation, session ID, snapshot result, findings, and their resolution.

## Limitations

- Documentation only. The campaign model, blueprint manifest, dispatcher, branch ladder, council, decision records, and communication plugin are recorded designs, not implemented behavior.
- The delivery note in ADR 0013 and the delivery-order decision in ADR 0014 mean the council cannot be constituted before three harnesses are admitted, so the earliest gate that can deliver it in full is G4.
- No runtime claim is made: `make verify` proves the repository's checks on this tree, not the future behavior of the recorded design.

## Remaining gates

- Independent review and its recorded findings.
- Coordinator integration into `dev`.
- The owner's explicit authorization before any implementation of ADR 0013 or ADR 0014 starts.
