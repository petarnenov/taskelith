# Design

## Context

The coordinator's brief of 2026-10-28 (Niki), from the owner's decision of
the same day: a dynamic progress bar per worker task, from the brief to
the landing, derived from records the protocol already creates.

## Decisions

### D1 Stages and their evidence

The stage is the highest one whose evidence exists; each stage keeps the
time it was reached where a commit or record gives one.

| Stage | Evidence | Time |
| --- | --- | --- |
| 1 brief | a task worktree with its change | first commit of `checklist.json`, else its file time, else the worktree's `.git` file time |
| 2 code | a non-merge commit since the base outside `openspec/changes/` | first such commit |
| 3 verify | a stamp of the clean HEAD tree and its merge base in the stamp directory of `scripts/verify-stamp.ts` | the stamp's `verifiedAt` |
| 4 route | `route.json` in the change | its first commit, else its file time |
| 5 to 7 review 1 to 3 | lines of `passes.jsonl` | the first commit holding that many lines |
| 8 fixes | a non-merge commit after the commit of the last pass line outside `openspec/changes/`, or a commit that a finding of the last pass names, also one before the pass line | the earliest such commit |
| 9 archived | the last commit touches the archived change directory | that commit |
| 10 handed off | the branch in `~/.config/taskelith/integration-queue.json` | none |
| 11 landed | HEAD in `origin/dev` with the change archived | the oldest first-parent commit of `origin/dev` that contains HEAD |

A pass whose counts hold no Critical, High, or Medium finding ends the
review (governance "Review sequence"); the view marks it "review done at a
Low-only pass" until the task is archived.

The verify stamp is matched on its tree and merge base only, not on the
toolchain fields of its key, so a refresh started under another Node.js
still finds it; `make verify` only stamps under the pinned toolchain.

### D2 Which worktrees are tasks

A worktree is a task when its branch is not `dev`, `main`, or an `itg-`
integration branch of the coordinator, and it has an active change
(preferably named after the branch) or an archived change
`<date>-<branch>`. A landed task stays in the view for 24 hours after its
landing, so old worktrees do not crowd it.

For a landed task the base is the merge base of HEAD and the first parent
of its landing commit, because HEAD itself is then the merge base with
`origin/dev`.

### D3 Hosts

This host is named `local`. Remote hosts come from
`~/.config/taskelith/progress-hosts.json`, a JSON list of
`{"name", "ssh", "repo"}`; a missing file means none, an invalid one is
reported and skipped. Every SSH call uses `-o BatchMode=yes -o
ConnectTimeout=8` and a shared connection (`ControlPersist=30`, socket in
`~/.config/taskelith/`). The first call runs the script in the remote
clone with its pinned Node.js; exit 64 means the clone lacks the script,
and the same derivation then runs through a reader whose every operation
is one `git`, `cat`, `ls`, `stat`, or `grep` over SSH. Exit 255 is
unreachable; other failures are reported as errors. Neither path prints
environment values or reads any token. The queue is the coordinator's
local file and applies to every host's tasks.

### D4 Cache and lock

`make progress-refresh` writes `progress.json` through a temporary file
and a rename, with `generatedAt` and `generatedAtEpoch`, so every reader
sees a whole report. The lock (`scripts/task-progress-lock.ts`) only
de-duplicates refreshes, best-effort (architect decision, Niki,
2026-10-28, after pass 3): it is created exclusively with the owner's
pid, a random token, and its time; a lock whose owner has exited or that
is older than 30 minutes is unlinked and created once more, otherwise the
refresh is skipped; release unlinks it only while it holds the token.
Mutual exclusion is no safety property here: a rare overlap runs two
refreshes, and the last whole write wins. `ARGS="--if-older-than 60"`
skips a cache younger than 60 seconds, so a refresh that the status line
started just after another one finished does no work.

### D5 Stacked rows

`make progress` prints one row per task, stacked one under another with
aligned columns (owner requirement, 2026-10-28): host, change, bar, stage,
elapsed time, and the time of every reached stage.

### D6 Status line

The status line script lives outside the repository and is not committed,
so the spec delta covers only `make progress-refresh`; this decision and
the protocol text describe the status line.
Inside a `taskelith` working directory it reads the cache and, below its
first line, stacks one row per task below stage 11, one under another
(owner requirement, 2026-10-28): host, change (24 characters), a bar of
11 cells, stage name, and elapsed time, in aligned columns; an
unreachable host gets its own row. The first row ends with "stale" when
the cache is older than 180 seconds. When the cache is older than 60 seconds,
missing, or unreadable and no live lock exists, it starts `nohup make -s
-C <clone> progress-refresh ARGS="--if-older-than 60"` in a new session
and never waits for it. The clone is the nearest ancestor of the working
directory with the script, else `~/taskelith`.

## Coordinator questions

1. **Local host name.** This host shows as `local`, not a worker name,
   because the hosts file names only SSH hosts. A `"name"` for this host
   could be added to the file later.
2. **Landed window.** A landed task stays in `make progress` for 24 hours
   and never in the status line. A shorter or no window is a constant
   change.
3. **Integration worktrees.** `itg-` worktrees are skipped, so a task under
   integration shows as handed off from the queue, not twice.
4. **Hosts file.** `~/.config/taskelith/progress-hosts.json` was created on
   the iMac with Zaki's entry, as the brief allows, so the real run shows
   him.
