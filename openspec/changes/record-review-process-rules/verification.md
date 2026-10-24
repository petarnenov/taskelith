# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's rules set during 2026-10-24 in the project conversation: authorized reviewers Codex Sol medium, Antigravity Argon medium, and Claude Fable 5.1 medium; one external reviewer per task with no cross review; at most three passes, with the owner deciding on findings left afterwards; Low findings fixed, and a pass with only Low findings not followed by another review; and the owner's request that these rules be recorded in the repository, not only in the agent's memory. During pass 1 the owner also approved rotation and read-only snapshots, and did not approve a rule that author proposals become owner decisions only after approval; that rule was removed. Base revision: `b237c15`. Scope: the "Independent review process" section, policy version, owner-acceptance line, and evidence-freshness exception in `docs/governance.md`; one line in `AGENTS.md`; the governance bullet and the governance-integration row in `docs/foundation.md`; dated notes in `docs/decisions/0001-bootstrap-governance.md` and, after pass 2, `docs/decisions/0002-linux-macos-worker-scope.md`; and a modified `bootstrap-governance` requirement. Documentation and policy only.

## Author self-check before review

Recorded after pass 1, when the rule requiring it was added to this change: each rule in the new section names its source (the owner, or an owner approval on 2026-10-24); every statement on renewed review and review exceptions in `docs/governance.md`, `AGENTS.md`, and `openspec/specs/bootstrap-governance/spec.md` is consistent with the unreviewed-fix exception; the evidence check found no unpinned, unlabeled external link in the changed documents.

## Checks

Under the exact CI pins Node v24.22.1 and npm 12.2.1: `npm test` 19 passed, 0 failed; `npm run verify:dependencies` passed; strict OpenSpec validation 13 passed, 0 failed; `npm run verify:package` passed; local link and anchor check passed; `git diff --check` passed.

## Independent review

Assigned reviewer: Claude Code 2.1.310 invoked as `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`. The JSON output reports the model `claude-fable-5-1`; the effort level is not echoed. SHA-256 snapshots before and after each pass were equal (snapshot files are kept in the author's scratch directory, outside the repository).

- **Pass 1 — session `e7a8b4f8-346f-4091-b61c-57bac83a0f85`.** Findings: 0 Critical, 2 High, 4 Medium, 4 Low. All accepted and resolved:
  1. High: author practices were presented as owner rules. The author asked the owner, who approved rotation and snapshots and did not approve the author-proposal rule, which was removed. Every rule now names its source; the every-instance prompt, the self-check and evidence check, external-fact routing, and the post-cap options cite the owner's earlier approval the same day.
  2. High: the proposal attributed the author-proposal rule to the owner. Corrected.
  3. Medium: the design claimed every review used snapshots. Now "since the second pass of `review-dependency-coverage-gaps`".
  4. Medium: the `bootstrap-governance` spec still required renewed review for every change. A MODIFIED delta adds the recorded unreviewed-fix exception.
  5. Medium: the new spec required review of every change despite the owner's review-exception rule. Now limited to changes without an accepted exception.
  6. Medium: the self-check was not recorded. Recorded above.
  7–10. Low: the allowance for re-review passes by the assigned reviewer was added; a scenario for Low findings with higher findings was added (the further-pass scenario was added only after pass 2); ADR 0001 has a dated note on its integration and the policy version; the confirmation rule now records the invocation when a tool does not echo the setting.

- **Pass 2 — session `c324bf1f-b684-4644-9ab5-36cd7a8798be`.** Pass-1 findings confirmed resolved except the snapshot history, which was only narrowed. Findings: 0 Critical, 0 High, 2 Medium, 6 Low. All accepted and resolved:
  1. Medium: the design's snapshot history was still inaccurate. The design now relies on the owner's approval and says earlier reviews used snapshots only in part.
  2. Medium: the two `bootstrap-governance` scenarios conflicted. The first now excludes permitted unreviewed fixes.
  3–8. Low: the ADR 0001 status line points to its dated note, and ADR 0002 gained the same kind of note; the further-pass scenario was added; the evidence-check definition is marked as the repository's definition; each reviewer's network access is stated; the review scenario now requires recording that snapshots were equal; the foundation ledger names pull requests #6 to #11.

- **Pass 3 (final) — session `09030e1c-912d-4f64-961d-cef96bea7340`.** All pass-2 findings confirmed resolved and no regression; no new scope needing the owner. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. Under the rule this change records, they were fixed without another pass; **these fixes have not been independently reviewed**:
  1. Low: the scope, proposal, and tasks omitted the ledger row and the ADR 0002 note. Added.
  2. Low: the ledger called pull requests #6 to #11 "decisions". Now "changes".
  3. Low: Claude Code's web access was unsupported. Now states that it can fetch pages when network access is allowed and has queried GitHub with `gh`.
  4. Low: the handling of Low findings on a third pass with higher findings was undefined. Now recorded as unreviewed fixes, in governance and the spec.
  5. Low: the spec's review-exception wording was wider than the policy. Now limited to exceptions accepted under the governance policy.

Remaining findings: 0.

## Remaining gates

Integration (commit, push, merge) and archival with owner authorization.
