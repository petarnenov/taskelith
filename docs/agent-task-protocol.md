# Agent task protocol

Status: working protocol for agent sessions that develop Taskelith in parallel, set by the owner on 2026-10-24. It applies the [governance policy](governance.md) and the [release flow](releases.md) to several sessions working at once, on one or more machines. It summarizes the operational steps and points to those documents for the full rules; where this page and they differ, they win.

## Roles

- **Owner.** Defines scope and decides product, architecture, dependency, promotion, publication, and deployment questions, review exceptions, and findings left after the third review pass ([governance "Authority"](governance.md#authority), [review process](governance.md#independent-review-process)).
- **Coordinator.** One session that plans the work items, assigns them to workers, and integrates finished work. On 2026-10-24 the owner authorized the coordinator to merge each completed and reviewed task into `dev`, archive it, and start or assign the next one without a separate approval.
- **Worker.** A session that develops one assigned task at a time and hands it back to the coordinator. A worker does not open pull requests, merge, or archive. UI tasks (SPA, board, inbox, intake and write-back screens, plugin and settings UI) go to the worker that holds the UI proof of concept.

The coordinator may also develop tasks itself, following the worker steps, and then integrates its own work.

## Worker steps

1. **Worktree.** Develop each task in its own worktree on its own branch, created from a fresh `origin/dev` as in [releases "Parallel work with worktrees"](releases.md#parallel-work-with-worktrees), then `nvm use` and `npm ci --ignore-scripts`. To pick up newer `dev` work, merge `origin/dev` into the branch with a merge commit. Do not rebase a pushed branch, and never force push. A merge that changes the task's requirements, contracts, implementation, or verification inputs invalidates the affected evidence ([evidence freshness](governance.md#evidence-freshness)): repeat the checks and the review.
2. **Change.** Bind the task to an OpenSpec change named after it: `npm run openspec -- new change <change>`, with `proposal.md`, `design.md`, a spec delta, `tasks.md`, and `verification.md`. A delta that creates a capability starts with a `## Purpose` of at least 50 characters, because `archive` otherwise writes a placeholder that fails strict validation. Documentation-only work under an existing requirement may instead set `skip_specs: true` in `.openspec.yaml` and add no `specs/` files. `npm run openspec -- validate <change> --strict` must pass.
3. **Scope and content.** Implement only the assigned scope. Write all repository content in English, and paraphrase non-English owner quotes. Keep every comment the change adds or edits to at most two lines of at most 80 characters each (`AGENTS.md`). Use conventional commit messages with no AI attribution, `Co-Authored-By` trailer, or session link. Use `feat` or `fix` only for changes to the published `taskelith` package, because they trigger a release ([releases](releases.md)); work in private workspace packages, documentation, and tooling uses `chore`, `build`, `docs`, or `test`.
4. **Checks.** Run `make verify` before the first review pass and again after each round of fixes.
5. **Review.** Follow the [independent review process](governance.md#independent-review-process) with the reviewer the coordinator assigns, using the invocations below.
6. **Record.** Write `verification.md` as the [lifecycle table](governance.md#lifecycle-and-records) and the [review process](governance.md#independent-review-process) require: scope and source, the revision, environment, the author self-check and evidence check, the exact checks and results, each review pass with its invocation, model confirmation, session ID, snapshot result, findings, and resolutions, any unreviewed fixes marked as such, limitations, and remaining gates. [The SpecKit capture record](../openspec/changes/archive/2026-10-24-capture-speckit-native-artifacts/verification.md) is an example.
7. **Handoff.** Commit and push the branch with `git push -u origin <change>`; the `pre-push` hook runs `make verify`. Send the coordinator the branch, the head commit, a short summary, the `make verify` result, and the review result. Then return to the main clone and stop.
8. **After integration.** When the coordinator reports the merge, update the main clone (`git switch dev && git pull --ff-only`). If the task's worktree or local branch still exists on the worker's machine, remove them (`git worktree remove ../taskelith-worktrees/<change>` and `git branch -D <change>`). Then clear the session's context (`/clear` in Claude Code) before taking the next task.
9. **Conflicts.** When the coordinator returns a task because its branch conflicts with `dev`, resolve the conflict in the task's worktree, run `make verify` again, have the assigned reviewer review the resolved diff, record it in `verification.md`, and hand off again. This mirrors the conflict flow of [ADR 0008](decisions/0008-product-ui-and-integration-authority.md) decision 3, including its spec-conflict and escalation rules.

Questions that belong to the owner (see Roles) go to the coordinator with options and a recommendation. The worker does not decide them.

## Coordinator steps

1. **Assign.** Assign only tasks without an open owner decision. When a worker is idle and such a task exists, send it a complete brief: the task and its plan row, scope and exclusions, the tasks it depends on, the assigned reviewer, and a pointer to this protocol. Choose and rotate reviewers as the [review process](governance.md#independent-review-process) requires, including a reviewer with network access for tasks that depend on external facts. Bring owner questions to the owner with options and a recommendation.
2. **Integrate.** Integrate one task at a time. After `git fetch origin`, check out the reported branch in a worktree (`git worktree add ../taskelith-worktrees/<change> origin/<change> -b <change>` when the coordinator has none, then `nvm use` and `npm ci --ignore-scripts`).
   - If the branch is behind `origin/dev`, merge `origin/dev` into it. If that merge conflicts, or changes the task's requirements, contracts, implementation, or verification inputs, return the task to its worker under worker step 9. Otherwise run `make verify` and push the merge.
   - Open a pull request into `dev` and merge it with a merge commit (`gh pr merge <change> --merge`).
   - If a commit type would trigger a release that the change does not warrant, recommit it with the right type on a new branch with the same author, instead of rewriting the pushed branch.
3. **Archive.** After `git fetch origin`, create a worktree for the branch `archive-<change>` from `origin/dev` with `--no-track`, then `nvm use` and `npm ci --ignore-scripts`.
   - Run `npm run openspec -- archive <change> --yes`, then `make verify`.
   - If `make verify` fails because the archived spec's Purpose is a placeholder, write the Purpose in the main spec.
   - Commit as `docs: archive the <title> change`, push with `git push -u origin archive-<change>`, open a pull request into `dev`, and merge it with a merge commit.
4. **Clean up.** Update the main clone with `git pull --ff-only`. Remove the coordinator's worktrees and local branches for both, and delete both remote branches from the main clone ([releases](releases.md#parallel-work-with-worktrees)). Remove a worker's worktree only on the worker's own machine, by the worker (worker step 8).
5. **Release the worker.** Tell the worker that its task is merged, so that it cleans up and clears its context, and assign the next task.

## Reviewer invocations

Run each reviewer from the task's worktree, read-only, with the model and effort set in the invocation ([governance](governance.md#independent-review-process)). Keep prompt files, logs, and snapshot files outside the worktree, for example in a scratch directory, so that they do not change the snapshot.

| Reviewer | Invocation | Confirmation |
| --- | --- | --- |
| Codex CLI | `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` | Model, reasoning effort, read-only sandbox, and session ID in the output header. Always pass `-s read-only`, because a local configuration may default to full access. No network access. |
| Antigravity CLI | `agy -p "<prompt>" --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>` | Model in the log; `conversation_id` in the JSON output. Has network access. |
| Claude Code | `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json` | `claude-fable-5-1` in the JSON `modelUsage`; `session_id` in the JSON output. Can reach the network. |

Snapshot before and after each pass, and compare the two. Include any external evidence directory shared with the reviewer as well.

```bash
git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256
```

The prompt names the criteria (`AGENTS.md`, [ADR 0004](decisions/0004-first-class-engineering-principles.md), the governance review process, and the specifications the change touches). It asks for every instance of a problem with its severity, file and line, and a fix, and for counts per severity at the end. For a later pass, it names the earlier pass's session and asks the reviewer to confirm each finding's resolution before reviewing the whole change again.
