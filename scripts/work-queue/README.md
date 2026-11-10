# Portable OFF outcome runner

Copy this directory into a project with Git, Node 24 or newer, the selected harness CLI,
OpenSpec CLI, the configured build tools and (for GitHub hosting) authenticated
`gh`. It imports only Node built-ins and its sibling files. No original project
package, legacy backlog, Jira identity or enterprise hostname is needed.

This is a single-host runner. Use one operating host per repository. A local
SQLite lock prevents simultaneous invocations across worktrees and state paths;
a durable owner record prevents a different invocation taking unfinished work.
It cannot fence a second machine. Multi-host allocation is not supported.

## Project and authority

Commit a version 1 queue containing `tasks`. Each task has `id`, `title`,
`change`, integer `priority`, string-array `criteria`, product `scopes` and
`dependencies`. Smaller priority values run first. Each result has one OpenSpec
change and one PR. Scopes cannot overlap queue, receipt or OpenSpec roots.

Keep the invocation JSON outside the checkout. Supply `root`, external
`stateDirectory`, stable `invocation`, optional selected `leaves` and optional
positive `maxAccepted`. Omitted mode is OFF. `authority` contains the actual
instruction `reference`, `instruction`, selected `target` and a `tasks` object
mapping IDs to canonical SHA256 hashes from the exported `hash` function.
Hashing a task is not permission: the configuration must reference an actual
covering owner instruction. Do not transfer grants between projects.

The `project` object supplies repository-relative `queue`, `changes`, `receipts`,
Git `target`, explicit PR `repository`, mandatory `planningCheck`, nonempty
`checks` and optional `setup`, `commitScope` and `commitSuffix`. Configure this
repository with scope `root-tools` and the required tracking suffix. Commands have fixed `command` and `args` fields.
Arguments may contain `{change}`, `{target}` and `{scope}` (the first authorized product scope). They run as argument arrays,
not worker-supplied shell strings. The owner must review these commands and
include every project-required gate. A check exiting successfully is evidence
only for what that check actually validates.

For this repository, the target remains `proposal`. Normal protection applies;
this tool grants no dev/main promotion. A suitable planning check is
`openspec validate {change} --strict`; result checks must include
`make pr-check BASE=origin/{target}`. Fresh package worktrees need the project's
noninteractive setup command. The portable runner does not invent missing
compliance or security decisions.

## Start and resume

```sh
node /path/to/work-queue/cli.mjs /absolute/path/to/invocation.json
```

In this repository, use `make work-queue-run CONFIG=/absolute/path/to/invocation.json`.
Claude is the default: authenticated Claude Code **2.1.321**, exact model
`claude-opus-5-5`, effort `medium`. No fallback is permitted. Select Codex with
`make work-queue-run CONFIG=/absolute/path/to/invocation.json harness=codex`,
`node cli.mjs /absolute/path/to/invocation.json --harness=codex`, or JSON
`"harness": "codex"`. Codex requires certified CLI **0.167.0**; omitted Codex
`model` and `effort` are resolved from its local configuration before allocation.
The CLI flag overrides the JSON harness only; explicit model/effort values remain.
Leave those optional fields unset for a shared template, or use values consistent
with the selected harness. Claude is selected when both CLI and JSON harness
are omitted. Explicit `harness=claude` also selects Claude.

The resolved harness, model and effort are frozen in invocation identity. A
restart with changed settings or legacy state without this identity is refused;
finish that invocation using its original runner and configuration. Do not erase
state or ownership to migrate active work. Start a new invocation only once the
previous work is reconciled and accepted or explicitly disposed under authority.
Claude uses only a loopback private MCP broker, with native tools, ambient MCP,
custom plugins, skills and hooks disabled. CLI output and bounded failure details
remain private. Bundled infrastructure plugin metadata is allowlisted and does
not grant tools. Global harness settings are never rewritten.

Restart with the same configuration and state directory. Do not delete ownership
or state files to evade unfinished work. Private worker output and reports stay
in state. A worker session ending does not stop the controller.

`maxAccepted` counts newly accepted results in the durable invocation. It does
not count prior completion, proposals, attempts or worker sessions. A reached
bound is successful with remaining task IDs reported. Too few accepted results,
blocked dependencies or protected merges return incomplete without asking a
person anything. Independent work may proceed only without overlapping held
scopes. Receipts validate outputs at their first accepted target commit; later ordinary
changes preserve historical acceptance. Removed or altered receipts do not prove
completion. A target advance requires integration revalidation and is currently
reported incomplete rather than automatically rebased.

## Acceptance limits

Git-host fixtures exercise real repository merges and receipt validation;
they do not establish hosted protection behavior. Scripted adapters test the
controller, not model execution. Real selected-harness one-task, three-task, review repair
and fresh-process recovery evidence must be recorded before rollout.

The old backlog and journal are not read or rewritten. Never enroll the same
work in both systems. Preserve a verified backup and check old reservations
before introducing a genuinely new live task.
