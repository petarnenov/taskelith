# Verification: enforce-comment-length

## Scope and source

On 2026-10-25 the owner approved the task `enforce-comment-length`; the coordinator (Niki) assigned it to Pepi with this scope: shorten every existing comment that breaks the comment rule of `AGENTS.md` in the tracked files within its scope, without behaviour changes; add a check to `make verify` that names the file, the line, and the reason, with unit tests for its pure parts; and update the `engineering-principles` requirements where they leave the rule unchecked. Base revision: `d113b6a` on `dev`. Prepared in a git worktree.

## Self-check

- The check, run over the tracked files at `d113b6a` before its fixture exemption existed, found 124 violations: 57 in the SpecKit fixture scaffold copy, now exempt as a copy of the capture, and 67 in 38 authored files, now 0. The design records the counting rules.
- A comment line of 93 characters appended to `scripts/setup.ts` made the check exit 1 with `scripts/setup.ts:32: comment line is 93 characters (max 80)`; the line was then removed.
- Every changed comment keeps its contract or rationale; the diff of the 38 comment-only files changes only comment lines.
- `docs/dependencies/licenses.json` changes only in its provenance digests of `package.json` and `scripts/dependency-inventory.ts`, regenerated with `npm run inventory:dependencies`.
- Evidence check: the change adds no external link.
- Requirements stay under 500 characters (250, 420, and 181).

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `4eb1d49` (278 tests) and at `d74375c` (282 tests; 99.62% lines, 95.68% branches, 99.27% functions), each including `npm run verify:comments` and the archive dry run; `npm run openspec -- validate enforce-comment-length --strict` passed.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude-fable-5-1`, effort medium, permission mode `plan`, editing tools disallowed. Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree with the prompt kept outside it. `claude-fable-5-1` was the only model in the JSON `modelUsage`.

- **Pass 1 at `8cbf745` — session `67eb5016-6314-4baa-a04a-e8cdf0b113b0`.** SHA-256 snapshots before and after were equal (`ab9a94db…70d9`). Findings: 0 Critical, 0 High, 3 Medium, 14 Low.
  1. Medium: the baseline counts (42 and 82 in 39 files) did not reproduce; they are 57 and 67 in 38 files. Corrected in the design, proposal, and this record.
  2. Medium: the shortened comment in `scripts/check-contract-compatibility.ts` dropped "breaking". Restored.
  3. Medium: `AGENTS.md` still states that the rule applies only to comments a diff adds or edits, and does not name the fixture copy exemption, so it disagrees with the modified requirements. `AGENTS.md` holds the owner's rule text and is outside the assigned scope, so it is not changed here; referred to the coordinator for an owner decision.
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
  14. Low: every tracked file was read, and a file deleted from the working tree crashed the check; the syntax is now chosen from the path first, an extensionless file is read only for its shebang, and deleted files are skipped, with a test.
  15. Low: dead exemptions (JSON lockfiles, `.agent/`) removed.
  16. Low: missing tests for a multi-line block after code, a comment with both violations, CRLF in a `#` file, and `;#`; added.
  17. Low: task 3.1 was unticked; ticked.

## Remaining gates

Independent review, then merge into `dev` and archive by the coordinator.
