# Agent task protocol

Status: working protocol for agent sessions that develop Taskelith in parallel, set by the owner on 2026-10-24. It applies the [governance policy](governance.md) and the [release flow](releases.md) to several sessions working at once; where this page and those documents differ, they win.

## Roles

- **Owner.** Defines scope and makes product, architecture, dependency, promotion, publication, and deployment decisions ([governance "Authority"](governance.md#authority)).
- **Coordinator.** One session that plans the work items, assigns them to workers, and integrates finished work. On 2026-10-24 the owner authorized the coordinator to merge each completed and reviewed task into `dev`, archive it, and start or assign the next one without a separate approval.
- **Worker.** A session that develops one assigned task at a time and hands it back to the coordinator. A worker does not open pull requests, merge, or archive. UI tasks (SPA, board, inbox, intake and write-back screens, plugin and settings UI) go to the worker that holds the UI proof of concept.

The coordinator may also develop tasks itself, following the worker steps, and then integrates its own work.

## Worker steps

1. **Worktree.** Develop each task in its own worktree on its own branch, created from a fresh `origin/dev` as in [releases "Parallel work with worktrees"](releases.md#parallel-work-with-worktrees), then `nvm use` and `npm ci --ignore-scripts`. To pick up newer `dev` work, merge `origin/dev` into the branch with a merge commit. Do not rebase a pushed branch, and never force push.
2. **Change.** Bind the task to an OpenSpec change named after it: `npm run openspec -- new change <change>`, with `proposal.md`, `design.md`, a spec delta, `tasks.md`, and `verification.md`. Documentation-only work under an existing requirement may set `skip_specs: true` in `.openspec.yaml`. `npm run openspec -- validate <change> --strict` must pass.
3. **Scope and content.** Implement only the assigned scope. Write all repository content in English, and paraphrase non-English owner quotes. Use conventional commit messages with no AI attribution, `Co-Authored-By` trailer, or session link.
4. **Checks.** Run `make verify` before the first review pass and again after each round of fixes.
5. **Review.** Follow the [independent review process](governance.md#independent-review-process) with the reviewer the coordinator assigns. Use the invocations below, and compare the snapshots before and after each pass.
6. **Record.** `verification.md` records the scope and its source, the base revision, the author self-check and evidence check, the exact checks and their results, and, for each pass, the invocation, session ID, finding counts, and every finding with its resolution, followed by the remaining gates. [The SpecKit capture record](../openspec/changes/archive/2026-10-24-capture-speckit-native-artifacts/verification.md) is an example.
7. **Handoff.** Commit, push the branch (the `pre-push` hook runs `make verify`), and send the coordinator the branch, the head commit, a short summary, the `make verify` result, and the review result. Then stop.
8. **After integration.** When the coordinator reports the merge, clear the session's context (`/clear` in Claude Code) before taking the next task.

Questions that belong to the owner (new dependencies, product scope, promotion, publication, deployment) go to the coordinator with options and a recommendation. The worker does not decide them.

## Coordinator steps

1. **Assign.** When a worker is idle and an independent task exists, send it a complete brief: the task and its plan row, scope and exclusions, the tasks it depends on, the assigned reviewer, and a pointer to this protocol. Rotate reviewers between consecutive tasks.
2. **Integrate.** Fetch the reported branch, merge `origin/dev` into it if it is behind, and confirm that `make verify` passes. Push it, open a pull request into `dev`, and merge it with a merge commit.
3. **Archive.** In a new worktree from the updated `origin/dev`, run `npm run openspec -- archive <change> --yes`. Commit the result as `docs: archive the <title> change`, and merge it into `dev` through its own pull request.
4. **Clean up.** Update the main clone with `git pull --ff-only`. Remove both worktrees and local branches, and delete both remote branches from the main clone ([releases](releases.md#parallel-work-with-worktrees)).
5. **Release the worker.** Tell the worker that its task is merged, so that it clears its context, and assign the next task.

## Reviewer invocations

Run each reviewer from the task's worktree, read-only, with the model and effort set in the invocation ([governance](governance.md#independent-review-process)):

| Reviewer | Invocation | Confirmation |
| --- | --- | --- |
| Codex CLI | `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` | Session ID in the output header. Always pass `-s read-only`, because a local configuration may default to full access. No network access. |
| Antigravity CLI | `agy -p "<prompt>" --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>` | Model in the log; `conversation_id` in the JSON output. Has network access. |
| Claude Code | `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json` | `claude-fable-5-1` in the JSON `modelUsage`; `session_id` in the JSON output. Can reach the network. |

Snapshot before and after each pass, and compare the two:

```bash
git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256
```

The prompt names the criteria (`AGENTS.md`, [ADR 0004](decisions/0004-first-class-engineering-principles.md), the governance review process, and the specifications the change touches). It asks for every instance of a problem with its severity, file and line, and a fix, and for counts per severity at the end. For a later pass, it names the earlier pass's session and asks the reviewer to confirm each finding's resolution before reviewing the whole change again.
