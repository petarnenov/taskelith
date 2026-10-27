## Context

The Git workspace contract puts each attempt's clone at `worker/workspaces/<attemptId>/checkout/` and makes it the harness's `workingDirectory`. The checked facts of the execution boundary are:

- The Linux worker container's entrypoint starts as root and runs the worker through `setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs` (`infra/installation/worker-entrypoint.sh`, `infra/installation/compose.yaml`). The worker thus runs as uid 0 without `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, or `CAP_FOWNER`; it cannot change an entry's owner, nor read or delete what another account closes. The entrypoint hands the data root to uid and gid 0. Uid 10001 (`taskelith`) is the control plane's account.
- Executions run as `taskelith-exec`, uid and gid 10003 (`infra/installation/Dockerfile`, `docs/local-installation.md`). The supervisor spawns them through Node.js with `uid` and `gid`; libuv then clears the supplementary groups, which a check in the Linux test image confirmed (`Groups:` empty for a child of a parent with groups 2000 and 4).
- `dataRoot` is created `0700` (`infra/installation/Dockerfile`, installation contract section 2), and `worker/` and every control-record directory, `worker/workspaces/` included, are created `0700` by `createPrivateDirectory` (`packages/adapters/worker-journal/src/worker-root.ts`). An execution cannot pass through any of them. Setting the child's working directory before the user ID changes does not help: harnesses and Git resolve absolute paths that cross these directories.
- Git 2.35.2 and later refuse a repository that another account owns unless `safe.directory` names it in protected configuration (system, global, or command scope).
- On macOS, executions run as the worker's own account; no identity boundary exists there.

## Goals / Non-Goals

**Goals:** a concrete, testable way for an execution to reach exactly its checkout while no control record, workspace record, or listing of `worker/` opens to it; Git work by the worker identity only, outside every execution's containment; the contract, the specs, the worker journal adapter, and the test double aligned with it.

**Non-Goals:** the Git adapter, the reclaim program, and the wiring into the worker app and container (item 16); isolation between attempts running at the same time (open question 1); client-chosen task identifiers against safe branch names (a separate change).

## Decisions

### D1. Traverse-only path through the execution group (chosen)

`dataRoot`, `worker/`, `worker/workspaces/`, and `worker/workspaces/<attemptId>/` get the execution group (gid 10003) and mode `0710`; the checkout is `0700` while reclaimed and `2770` while handed off. Control records keep `0600` and `0700` without group bits. The worker identity holds the execution group as a supplementary group: a file's owner may give it any group the owner belongs to without `CAP_CHOWN`, and the group lets the worker read and delete what the agent wrote once a reclaim restores the group's access.

Why: it needs no new capability, no second data root or volume, and no change of an entry's owner; the worker keeps the workspace record and the control records in the same `0700` and `0600` places; the execution can pass through but cannot list or create anything on the path. Cost: the execution can stat a path it names under `worker/` (open question 2); `worker/` is no longer `0700` on Linux, which the worker journal and installation contracts now say.

### D2. Hand-off and reclaim of the checkout

The checkout's mode is the hand-off state, which only the worker (its owner) can change, so a restart needs no other record. `handOff` opens it before an execution of the attempt; Git work is then refused with `workspace-handed-off`. `reclaim` runs only after the attempt's process sets are proven empty: a fixed program of the worker image runs as the execution identity in its own containment and, without following a link, copies every regular file that has another hard link and gives the group read and write (search and set-group-ID on directories) on what the agent owns; the worker then closes the checkout. The copy defeats a hard link that the agent left outside, for example in `/tmp`, to write the checkout later. Running the program as the execution identity uses only the worker's existing `CAP_SETUID` and grants nothing the execution did not already have.

### D3. The workspace record beside the checkout

The kind, task branch, and binding move to `worker/workspaces/<attemptId>/workspace` (`0600`). The test double kept them in the checkout's `.git`, where an agent could turn a review workspace into one that pushes; a new double test failed before the change for this reason.

### D4. Git processes and the Git directory

Every Git process of the adapter runs as the worker identity in the worker's home cgroup, started by the worker process, never through a supervisor and never in an execution's containment, so a cancellation never kills it and no execution can signal or trace it. Because the worker identity can write every control record, the adapter checks `.git` for links, `commondir`, alternates, and a `gitdir:` file before each Git call and refuses with `unsafe-checkout`; it never sets `safe.directory`, so Git's ownership check also refuses a replaced `.git`. The harness's Git, running as the execution identity in a worker-owned checkout, receives `safe.directory` for exactly that checkout as command-scope configuration in its environment, never `*`.

### Alternatives considered

- **Mode `0711` on the path (traverse for every account).** Same as D1 but opens the path to every account, not only the execution group. Rejected: D1 costs nothing more.
- **A checkout root outside `dataRoot`.** A second root, for example a second volume, at `0710`, holding only checkouts, with records in `worker/workspaces/`. It keeps `worker/` at `0700`, but needs a new storage location in the storage, installation, and worker journal contracts, a second volume, and crash-safe ordering across two roots. Rejected for G3 as more change for the same boundary; it stays an option if open question 2 is not accepted.
- **Giving the checkout to the execution account (`chown`) and taking it back.** Needs `CAP_CHOWN`, and `CAP_DAC_READ_SEARCH` or `CAP_FOWNER` to walk directories the agent closed, in the worker's bounding set, which item 25a qualified without them, and it changes the execution's bounding set that the namespace confinement scenario checks. Rejected: it widens the worker's privileges.
- **POSIX ACLs.** A default ACL granting the worker identity access. The agent owns its files and can remove the entries, so a reclaim program is still needed, and ACL support depends on the data root's file system and differs on macOS. Rejected.
- **Working directory set before the user ID changes.** Rejected, see Context.
- **Git as the execution identity.** Would avoid every group rule, but runs the adapter's Git, with the run credential, where the agent can signal and trace it, and in the containment that cancellation kills. Rejected by finding M1.

## Risks / Trade-offs

- Attempts on one Linux worker share one execution account, so two handed-off checkouts are reachable from both executions (open question 1).
- An execution can learn whether a named path under `worker/` exists and its metadata, not its content (open question 2).
- Until item 16 wires `executionGroup` and the supplementary group, deployed workers keep `0700` and no harness can use a checkout; no runtime uses one yet.
- macOS keeps no boundary between the execution and the worker's records; unchanged by this change.

## Open questions

1. **Isolation between attempts running at the same time on one Linux worker.** All executions share uid 10003, so while two checkouts are handed off, each execution can reach the other's checkout, as it can already signal the other's processes. Options: (a) at most one handed-off workspace per worker in G3; (b) an execution account per execution slot, a uid pool; (c) accept the residual risk. Recommendation: (a) for G3, (b) when a worker runs attempts concurrently. Not decided here; for the owner.
2. **Names under `worker/` visible to the execution account.** The traverse-only path lets an execution stat a path it names under `worker/` (existence, size, times), never list or read it. Options: (a) accept; (b) move checkouts to a separate root (see Alternatives). Recommendation: (a). Not decided here; for the owner.

## Review checklist

Command: `make findings ARGS="checklist --capability git-workspace-port --files docs/contracts/git-workspace.md,packages/modules/workspace/**"`

```text
Review checklist (capabilities git-workspace-port; files docs/contracts/git-workspace.md, packages/modules/workspace/**): no archived findings match.

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (31): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (29): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. stale-citation (15): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (14): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
6. process (3): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
```
