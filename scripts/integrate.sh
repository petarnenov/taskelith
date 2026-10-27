#!/usr/bin/env bash
# Integrates one archived change branch into dev with one pull request.
# usage: integrate.sh [--resume] <branch> <pull request title> <body>
set -euo pipefail

usage() {
  echo "usage: integrate.sh [--resume] <branch> <pull request title> <pull request body>" >&2
  exit 2
}

resume=false
if [ "${1:-}" = "--resume" ]; then
  resume=true
  shift
fi
if [ "$#" -ne 3 ] || [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then usage; fi
branch="$1"
title="$2"
body="$3"
if ! git check-ref-format --branch "$branch" >/dev/null 2>&1 || [ "${branch#-}" != "$branch" ]; then
  echo "integrate.sh: invalid branch name: $branch" >&2
  exit 2
fi

scripts="$(cd "$(dirname "$0")" && pwd)"
state="${XDG_STATE_HOME:-$HOME/.local/state}/taskelith"
pause_file="$state/integrate.pause"
timeout_seconds="${TASKELITH_INTEGRATE_TIMEOUT:-2400}"
poll_seconds="${TASKELITH_INTEGRATE_POLL_SECONDS:-15}"
case "$timeout_seconds$poll_seconds" in
  *[!0-9]*)
    echo "integrate.sh: TASKELITH_INTEGRATE_TIMEOUT and _POLL_SECONDS must be whole seconds" >&2
    exit 2
    ;;
esac

# The pause file holds every integration until it is removed (decision D5).
wait_while_paused() {
  if [ -f "$pause_file" ]; then echo "integrate.sh: paused by $pause_file" >&2; fi
  while [ -f "$pause_file" ]; do sleep "$poll_seconds"; done
}

# Runs a command as a new process group; on the alarm (0: none) and at its
# end it stops what is left of the group and waits until the group is gone.
GROUP_ALARM='
use strict;
my ($seconds, @command) = @ARGV;
my $pid = fork() // die "fork: $!\n";
if ($pid == 0) { setpgrp(0, 0); exec { $command[0] } @command or die "exec: $!\n"; }
setpgrp($pid, $pid);
my $alarms = 0;
$SIG{ALRM} = sub { kill($alarms++ ? "KILL" : "TERM", -$pid); alarm 10; };
alarm $seconds if $seconds > 0;
waitpid($pid, 0);
my $status = $?;
alarm 0;
for my $tick (0 .. 600) {
  last unless kill 0, -$pid;
  kill("TERM", -$pid) if $tick == 0;
  kill("KILL", -$pid) if $tick == 100;
  select undef, undef, undef, 0.1;
}
if ($alarms) { print "integrate.sh: make verify exceeded $seconds s\n"; exit 124; }
exit(($status & 127) ? 128 + ($status & 127) : $status >> 8);
'

run_verify() {
  perl -e "$GROUP_ALARM" "$timeout_seconds" make verify
}

verify_stamp() {
  node --experimental-strip-types "$scripts/verify-stamp.ts" "$@"
}

# The main clone is updated after the merge, so it must be on a clean dev
# that origin/dev fast-forwards before anything changes on the remote.
check_main_clone() {
  local reason=""
  if [ "$(git -C "$main" symbolic-ref --short -q HEAD || true)" != dev ]; then
    reason="is not on dev"
  elif [ -n "$(git -C "$main" status --porcelain)" ]; then
    reason="has uncommitted or untracked changes"
  elif ! git -C "$main" merge-base --is-ancestor dev origin/dev; then
    reason="has dev commits that origin/dev lacks"
  fi
  if [ -n "$reason" ]; then
    echo "MAIN NOT READY $main $reason"
    exit 8
  fi
}

# The pull request of an earlier attempt: an open one, or one merged at
# HEAD; prints its state and URL, or none.
existing_pull_request() {
  local prs head pr_state oid pr_url merged=""
  prs="$(gh pr list --base dev --head "$branch" --state all --json state,headRefOid,url \
    --jq '.[] | [.state, .headRefOid, .url] | @tsv')" || return 1
  head="$(git rev-parse HEAD)" || return 1
  while IFS=$'\t' read -r pr_state oid pr_url; do
    if [ "$pr_state" = OPEN ]; then
      echo "open $pr_url"
      return 0
    fi
    if [ "$pr_state" = MERGED ] && [ "$oid" = "$head" ]; then merged="merged $pr_url"; fi
  done <<<"$prs"
  echo "${merged:-none}"
}

wait_while_paused
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
worktree="$(dirname "$main")/taskelith-worktrees/itg-$branch"
log="$state/integrate-$(printf '%s' "$branch" | tr '/' '_')-verify.log"
mkdir -p "$state"

git -C "$main" fetch -q origin
check_main_clone
if [ "$resume" = true ]; then
  if [ ! -d "$worktree" ]; then
    echo "integrate.sh: no integration worktree to resume: $worktree" >&2
    exit 2
  fi
else
  git -C "$main" worktree add -q -b "itg-$branch" "$worktree" "origin/$branch"
fi
cd "$worktree"

# The branch must end with its own archived change (protocol step 7).
if [ -d "openspec/changes/$branch" ] || ! compgen -G "openspec/changes/archive/*-$branch" >/dev/null; then
  echo "NOT ARCHIVED $branch"
  exit 5
fi

# The merge stays on the local itg branch until the full verify passed.
if ! git merge -q --no-ff --no-edit origin/dev >/dev/null 2>&1; then
  git diff --name-only --diff-filter=U >&2
  git merge --abort >/dev/null 2>&1 || true
  echo "CONFLICT $branch"
  exit 3
fi
make setup >/dev/null

# Only a clean, committed tree is stamped, and only it may be pushed.
if [ -n "$(git status --porcelain)" ]; then
  git status --short >&2
  echo "NOT CLEAN $branch"
  exit 7
fi

# Integration always needs a full stamp of the merged tree (decision D5).
export TASKELITH_VERIFY_PROFILE=full
if verify_stamp check full >/dev/null; then
  echo "integrate.sh: reusing the full make verify stamp of the merged tree"
else
  if ! run_verify >"$log" 2>&1; then
    echo "VERIFY FAIL $branch"
    tail -30 "$log"
    exit 4
  fi
  if ! verify_stamp check full >/dev/null; then
    echo "VERIFY FAIL $branch"
    echo "integrate.sh: make verify passed but left no full stamp of the merged tree"
    tail -5 "$log"
    exit 4
  fi
fi

git push -q origin "HEAD:$branch"
pull_request="$(existing_pull_request)"
read -r pr_state url <<<"$pull_request"
case "$pr_state" in
  merged)
    echo "integrate.sh: the pull request $url is already merged"
    ;;
  open)
    echo "integrate.sh: continuing with the open pull request $url"
    gh pr merge "$url" --merge
    ;;
  *)
    url="$(gh pr create --base dev --head "$branch" --title "$title" --body "$body")"
    gh pr merge "$url" --merge
    ;;
esac

cd "$main"
git worktree remove "$worktree"
git branch -D "itg-$branch" >/dev/null
git pull -q --ff-only origin dev
npm ci --silent >/dev/null

# A failed delete push is fine only when origin no longer has the branch.
delete_failed=false
git push -q origin --delete "$branch" || delete_failed=true
if ! remote_ref="$(git ls-remote --heads origin "refs/heads/$branch")"; then
  echo "DELETE UNCONFIRMED $branch"
  exit 9
fi
if [ -n "$remote_ref" ]; then
  echo "DELETE FAILED $branch"
  exit 6
fi
if [ "$delete_failed" = true ]; then
  echo "integrate.sh: the delete push failed, but origin has no $branch" >&2
fi
rm -f "$log"
echo "LANDED $branch $url $(git log --oneline -1)"
