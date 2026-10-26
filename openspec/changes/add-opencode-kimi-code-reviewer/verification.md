# Verification: add-opencode-kimi-code-reviewer

## Scope and source

On 2026-10-26 the owner said, in Bulgarian and paraphrased here: add one more reviewer, OpenCode, with the same settings as the away delegate, kimi-k2.7-code, put it into the reviewer-selection rotation, but the two OpenCode reviewers must not be next to each other.

The same day the owner also approved two more reviewers, which the coordinator added to this change:

- Codex CLI with model `gpt-6-astra`, `model_reasoning_effort = "medium"`, and sandbox `read-only`;
- Claude Code with model `claude-opus-5-5`, effort `high`, permission mode `plan`, and editing tools disallowed.

The coordinator session briefed an implementation subagent, which made the change. Base revision: `503a0be` on `dev`. Prepared in the git worktree `../taskelith-worktrees/add-opencode-kimi-code-reviewer`.

## Requirements

- The authorized reviewers, in order: Codex CLI (gpt-6.1-sol), Antigravity CLI, OpenCode CLI (kimi-k3.1-pro), Claude Code (claude-fable-5-1), Codex CLI (gpt-6-astra), OpenCode CLI (kimi-k2.7-code), Claude Code (claude-opus-5-5). The turn returns to Codex CLI (gpt-6.1-sol) after the last; no two reviewers of the same harness are adjacent, including at the wrap.
- OpenCode CLI (kimi-k2.7-code): model `opencode-go/kimi-k2.7-code` through the OpenCode Go provider, default variant, the existing `reviewer` agent.
- Codex CLI (gpt-6-astra): model `gpt-6-astra`, `model_reasoning_effort = "medium"`, sandbox `read-only`.
- Claude Code (claude-opus-5-5): model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed.
- Reviewers of a harness with several entries are named by their models, and each entry is a separate reviewer for the one-reviewer, rotation, unavailable, and pause rules.
- The owner's non-adjacency rule is stated in the Rotation rule and in the "Rotation order" requirement, for reviewers of any harness.
- The reviewer invocations hold a row for each new reviewer that refers to the existing row of its harness for the shared notes.

## Author self-check

- Only the governance rules the owner's requests touch are changed. The one-reviewer rule, the pass cap, and the unavailability window are unchanged.
- The owner's rule is attributed to the owner; the reading that each entry is a separate reviewer is attributed to the coordinator.
- The governance policy, the protocol, the skill, and the spec agree on the names and the order.
- The governance "Owner acceptance" paragraph records the 2026-10-24 Codex authorization as history and is unchanged.
- Other documents that name OpenCode, Codex, or Claude Code (`docs/architecture.md`, `docs/foundation.md`, `docs/dependencies.md`, ADRs 0003, 0007, 0013, and 0014, and `docs/integration-candidates.md`) refer to harnesses, not reviewers, and are unchanged.
- The modified requirement has 449 characters and three scenarios.
- The change adds no external link. All content is English.
- The OpenCode CLI (kimi-k2.7-code) invocation was not run by this change, so it is not yet confirmed by a run.

## Tests of the new invocations

Both were run by the coordinator on 2026-10-26; this change's subagent ran neither.

- **Codex CLI (gpt-6-astra).** `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` ran as session `01a177ef-24bc-7741-b608-11cfcfb91b99`, and the output header showed sandbox `read-only` and reasoning effort `medium`. The model id `GPT-6-Astra` in capitals was rejected with `model_not_found`, so the documents use the lowercase id.
- **Claude Code (claude-opus-5-5).** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null` replied OK as session `6ec3c3df-4df2-4b9c-95c7-5937ea3219dd`, and its `modelUsage` contained only `claude-opus-5-5`.

## Checks

Node v24.22.1, in the worktree:

- `npm run openspec -- validate add-opencode-kimi-code-reviewer --strict`: `Change 'add-opencode-kimi-code-reviewer' is valid`.
- An archive of the change in a scratch copy of `openspec/`, then `openspec validate --all --strict`: 67 passed, 0 failed.
- `make verify`: passed on the working tree before the commit, with 1612 tests passed and 0 failed, 68 strictly valid OpenSpec items, the archive dry run, and the package check. Only this line changed after it.

## Independent review

Pending. The coordinator session runs it with a Codex CLI reviewer and records it here. No review has taken place yet.

## Remaining gates

Independent review, then integration into `dev` and the archive by the coordinator. Promotion to `main` is a separate owner decision.
