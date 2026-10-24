# Verification: enforce-comment-length

## Scope and source

On 2026-10-25 the owner approved the task `enforce-comment-length`; the coordinator (Niki) assigned it to Pepi with this scope: shorten every existing comment that breaks the comment rule of `AGENTS.md` in the tracked files within its scope, without behaviour changes; add a check to `make verify` that names the file, the line, and the reason, with unit tests for its pure parts; and update the `engineering-principles` requirements where they leave the rule unchecked. Base revision: `d113b6a` on `dev`. Prepared in a git worktree.

## Self-check

- The check, run over the tracked files at `d113b6a` before its fixture exemption existed, found 124 violations: 57 in the SpecKit fixture scaffold copy, now exempt as a copy of the capture, and 67 in 38 authored files, now 0. The design records the counting rules.
- A comment line of 93 characters appended to `scripts/setup.ts` made the check exit 1 with `scripts/setup.ts:32: comment line is 93 characters (max 80)`; the line was then removed.
- Every changed comment keeps its contract or rationale. Of the 38 files with shortened comments, 37 change only comment lines, and `Makefile` also adds the `npm run verify:comments` step.
- `docs/dependencies/licenses.json` changes only in its provenance digests of `package.json` and `scripts/dependency-inventory.ts`, regenerated with `npm run inventory:dependencies`.
- Evidence check: the change adds no external link.
- Requirements stay under 500 characters (250, 436, and 181).

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `4eb1d49` (278 tests) at `d74375c` and `0c3a8fd` (282 tests), and at `804b88a` (283 tests; 99.62% lines, 95.68% branches, 99.27% functions), each including `npm run verify:comments` and the archive dry run; `npm run openspec -- validate enforce-comment-length --strict` passed.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude-fable-5-1`, effort medium, permission mode `plan`, editing tools disallowed. Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree with the prompt kept outside it. `claude-fable-5-1` was the only model in the JSON `modelUsage`.

- **Pass 1 at `8cbf745` — session `67eb5016-6314-4baa-a04a-e8cdf0b113b0`.** SHA-256 snapshots before and after were equal (`ab9a94db…70d9`). Findings: 0 Critical, 0 High, 3 Medium, 14 Low.
  1. Medium: the baseline counts (42 and 82 in 39 files) did not reproduce; they are 57 and 67 in 38 files. Corrected in the design, proposal, and this record.
  2. Medium: the shortened comment in `scripts/check-contract-compatibility.ts` dropped "breaking". Restored.
  3. Medium: `AGENTS.md` still states that the rule applies only to comments a diff adds or edits, and does not name the fixture copy exemption, so it disagrees with the modified requirements. `AGENTS.md` holds the owner's rule text and is outside the assigned scope, so it is not changed here; referred to the coordinator for an owner decision. Worker step 3 of `docs/agent-task-protocol.md` states the same diff-based scope.
  4. Low: `native-reference.ts` claimed "any text"; now "unlike an identifier, any text".
  5. Low: `environment-checks.ts` setup comment was unclear; reworded.
  6. Low: `build-workspaces.ts` lost why an empty workspace is special; restored.
  7. Low: `gate-evidence.ts` lost the three evidence sources; restored.
  8. Low: `plain-data.ts` lost the throwing inspection case; restored.
  9. Low: `event-metadata.ts` lost digits and inner hyphens; restored.
  10. Low: `task-admission.ts` lost the stop and reconcile policy; restored.
  11. Low: a `#` after `;`, `&`, `|`, `(`, or `)` was not a comment; it now starts one, with a test.
  12. Low: heredoc bodies and YAML block scalars were not named as a risk; the design names them.
  13. Low: other file kinds (`.tsx`, `*.mk`, and others) were silently unchecked; the design states that the kinds are exactly those `AGENTS.md` names.
  14. Low: every tracked file was read, and a file deleted from the working tree crashed the check; the syntax is now chosen from the path first, an extensionless file is read only for its shebang, and deleted files are skipped; the shebang-only read has a test, the skipping does not.
  15. Low: dead exemptions (JSON lockfiles, `.agent/`) removed.
  16. Low: missing tests for a multi-line block after code, a comment with both violations, CRLF in a `#` file, and `;#`; added.
  17. Low: task 3.1 was unticked; ticked.
- **Pass 2 at `5633499` — session `f9ad03ae-8754-484b-a938-a3a9cc96d27a`.** SHA-256 snapshots before and after were equal (`b6ea49c8…039b`). The reviewer confirmed findings 1, 2, 4 to 12, and 15 to 17 as resolved, and 3, 13, and 14 as resolved but imprecisely recorded or worded. Findings: 0 Critical, 0 High, 1 Medium, 10 Low.
  1. Medium: the referral of finding 3 omitted worker step 3 of `docs/agent-task-protocol.md` and was missing from the remaining gates. Both are now recorded.
  2. Low: the script's header claimed `AGENTS.md` names the file kinds; it now points to the scope requirement.
  3. Low: the design made the same claim; corrected.
  4. Low: a tracked symbolic link to a directory or a submodule crashed the check; only regular files are read now.
  5. Low: an extensionless file was read twice; the text is now read once.
  6. Low: "Makefiles, Dockerfiles" in the scope requirement was wider than the check; it now says files named `Makefile` or `Dockerfile`, and the design names `*.mk` and `Dockerfile.dev` as unchecked.
  7. Low: the design did not name two missed cases, an apostrophe in a plain YAML scalar and quotes in a Makefile assignment; it now does.
  8. Low: this record claimed a test for skipping deleted files; corrected.
  9. Low: this record called `Makefile` comment-only; corrected.
  10. Low: `.mts`, `.cts`, and `.cjs` had no test; added.
  11. Low: the `plain-data.ts` comment put a throwing inspection among the problems; reworded.
- **Pass 3 at `05366f6` — session `62d24e54-584b-4be1-ae7f-bb878bef1bde`.** SHA-256 snapshots before and after were equal (`7b99d62d…b80d`). The reviewer confirmed all 11 pass 2 findings as resolved. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. As a Low-only pass, they were fixed without another review (unreviewed fixes):
  1. Low: this record gave 420 characters for the scope requirement; it is 436.
  2. Low: `docs/releases.md` did not list the comment length check among the `make verify` steps; added.
  3. Low: the `pnpm-lock.yaml` exemption was dead; removed from the script, its test, and the design.
  4. Low: no test protected that a shebang in a TypeScript file is no comment; added.
  5. Low: "the owner picks the first" in `event-metadata.ts` was ambiguous; now "the owning module". The first wording of that fix was 87 characters long, and `make verify` failed on it at `cd3f2cf`; `804b88a` shortened it.

## Remaining gates

- Owner decision, referred to the coordinator: align the comment rule in `AGENTS.md` and worker step 3 of `docs/agent-task-protocol.md` with the modified requirements (every comment in scope, checked by `make verify`, fixture copies of captures exempt).
- Merge into `dev` and archive by the coordinator.
