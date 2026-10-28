#!/usr/bin/env bash
# Integrates one archived change branch into dev with one pull request.
# usage: integrate.sh [--resume] <branch> <pull request title> <body>
set -euo pipefail

usage() {
  echo "usage: integrate.sh [--resume] <branch> <pull request title> <pull request body>" >&2
  exit 2
}

resume=false
interrupted=false
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

# Runs a command as a new process group; on the alarm (0: none), INT, TERM,
# HUP, and at its end it stops the group and waits until the group is gone.
GROUP_SUPERVISOR='
use strict;
use POSIX ();
my ($seconds, @command) = @ARGV;
my %number = (HUP => 1, INT => 2, TERM => 15);
my ($pid, $stops, $reason) = (0, 0, "");
sub stop { kill($stops++ ? "KILL" : "TERM", -$pid); alarm 10; }
sub signalled { $reason ||= $_[0]; stop() if $pid && !$stops; }
$SIG{$_} = \&signalled for keys %number;
$SIG{ALRM} = sub { $reason ||= "ALRM"; stop(); };
my $held = POSIX::SigSet->new(POSIX::SIGHUP(), POSIX::SIGINT(), POSIX::SIGTERM());
POSIX::sigprocmask(POSIX::SIG_BLOCK(), $held);
$pid = fork() // die "fork: $!\n";
if ($pid == 0) {
  $SIG{$_} = "DEFAULT" for keys %number;
  setpgrp(0, 0);
  POSIX::sigprocmask(POSIX::SIG_UNBLOCK(), $held);
  exec { $command[0] } @command or die "exec: $!\n";
}
setpgrp($pid, $pid);
alarm $seconds if $seconds > 0;
POSIX::sigprocmask(POSIX::SIG_UNBLOCK(), $held);
stop() if $reason && !$stops;
waitpid($pid, 0);
my $status = $?;
alarm 0;
for my $tick (0 .. 600) {
  last unless kill 0, -$pid;
  kill("TERM", -$pid) if $tick == 0;
  kill("KILL", -$pid) if $tick == 100;
  select undef, undef, undef, 0.1;
}
if ($reason eq "ALRM") { print "integrate.sh: make verify exceeded $seconds s\n"; exit 124; }
exit 128 + $number{$reason} if $reason;
exit(($status & 127) ? 128 + ($status & 127) : $status >> 8);
'

# Notes a signal to this script; run_verify passes it on to the supervisor.
note_signal() {
  interrupted=true
  signal="$1"
}

# The traps exist before the supervisor starts. The signal repeats until the
# supervisor ends, since it starts with INT ignored and before its handlers.
run_verify() {
  local supervisor signal="" status=0
  trap 'note_signal INT' INT
  trap 'note_signal HUP' HUP
  trap 'note_signal TERM' TERM
  perl -e "$GROUP_SUPERVISOR" "$timeout_seconds" make verify </dev/null &
  supervisor=$!
  while kill -0 "$supervisor" 2>/dev/null; do
    if [ -n "$signal" ]; then kill -s "$signal" "$supervisor" 2>/dev/null || true; fi
    sleep 1
  done
  wait "$supervisor" || status=$?
  trap - INT TERM HUP
  return "$status"
}

verify_stamp() {
  node --experimental-strip-types "$scripts/verify-stamp.ts" "$@"
}

# The time of a reused stamp, from the message of a passing stamp check.
stamp_time() {
  sed -n 's/^pre-push: tree [0-9a-f]* passed make verify (full) at \([^;]*\);.*/\1/p' <<<"$1"
}

INTEGRATION_JSON='
const [tree, verify, profile, seconds, change, branch, started] = process.argv.slice(1);
const record = { tree, verify, profile, verifySeconds: Number(seconds), change, branch, started };
console.log(JSON.stringify(record));
'

# Prints the integration line and appends it as JSON to the shared log; a
# failed append only warns, so it never fails the integration.
record_integration() {
  local tree
  tree="$(git rev-parse 'HEAD^{tree}')"
  integration_line="Integration: tree $tree; verify $verify_outcome; profile $TASKELITH_VERIFY_PROFILE"
  integration_line+="; verify seconds $verify_seconds; change $change; branch $branch; started $started"
  echo "$integration_line"
  if ! node -e "$INTEGRATION_JSON" "$tree" "$verify_outcome" "$TASKELITH_VERIFY_PROFILE" \
    "$verify_seconds" "$change" "$branch" "$started" 2>/dev/null >>"$integrations"; then
    echo "integrate.sh: warning: could not append the integration line to $integrations" >&2
  fi
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

# Removes the integration worktree, updates the main clone, deletes the
# remote branch, and reports the landing of the pull request $1.
land() {
  local url="$1" delete_failed=false remote_ref
  cd "$main"
  git worktree remove "$worktree"
  git branch -D "itg-$branch" >/dev/null
  git pull -q --ff-only origin dev
  npm ci --silent >/dev/null
  # A failed delete push is fine only when origin no longer has the branch.
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
}

wait_while_paused
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
worktree="$(dirname "$main")/taskelith-worktrees/itg-$branch"
log="$state/integrate-$(printf '%s' "$branch" | tr '/' '_')-verify.log"
integrations="$state/integrations.jsonl"
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
change="$(compgen -G "openspec/changes/archive/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-$branch" | tail -1)"
change="${change##*/}"

# An earlier attempt whose pull request merged left HEAD in origin/dev; a
# new merge commit there would open a second pull request.
if git merge-base --is-ancestor HEAD origin/dev; then
  pull_request="$(existing_pull_request)"
  read -r pr_state url <<<"$pull_request"
  if [ "$pr_state" = merged ]; then
    echo "integrate.sh: the pull request $url is already merged; only cleaning up"
  else
    url=none
    echo "integrate.sh: $branch is already in origin/dev; only cleaning up"
  fi
  land "$url"
  exit 0
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
verify_started=$SECONDS
if stamp="$(verify_stamp check full)"; then
  verify_outcome="reused stamp of $(stamp_time "$stamp")"
  echo "integrate.sh: reusing the full make verify stamp of the merged tree"
else
  verify_outcome=ran
  verify_status=0
  run_verify >"$log" 2>&1 || verify_status=$?
  if [ "$interrupted" = true ]; then
    echo "INTERRUPTED $branch"
    exit "$verify_status"
  fi
  if [ "$verify_status" -ne 0 ]; then
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
verify_seconds=$((SECONDS - verify_started))
record_integration

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
    url="$(gh pr create --base dev --head "$branch" --title "$title" --body "$body

$integration_line")"
    gh pr merge "$url" --merge
    ;;
esac

land "$url"
