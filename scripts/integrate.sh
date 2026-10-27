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

# Runs a command under the alarm; 0 seconds means no alarm.
with_alarm() {
  if [ "$timeout_seconds" -eq 0 ]; then "$@"; return; fi
  perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$timeout_seconds" "$@"
}

verify_stamp() {
  node --experimental-strip-types "$scripts/verify-stamp.ts" "$@"
}

wait_while_paused
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
worktree="$(dirname "$main")/taskelith-worktrees/itg-$branch"
log="$state/integrate-$(printf '%s' "$branch" | tr '/' '_')-verify.log"
mkdir -p "$state"

git -C "$main" fetch -q origin
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

# Integration always needs a full stamp of the merged tree (decision D5).
export TASKELITH_VERIFY_PROFILE=full
if verify_stamp check full >/dev/null; then
  echo "integrate.sh: reusing the full make verify stamp of the merged tree"
elif ! with_alarm make verify >"$log" 2>&1; then
  echo "VERIFY FAIL $branch"
  tail -30 "$log"
  exit 4
fi

git push -q origin "HEAD:$branch"
url="$(gh pr create --base dev --head "$branch" --title "$title" --body "$body")"
gh pr merge "$url" --merge

cd "$main"
git worktree remove "$worktree"
git branch -D "itg-$branch" >/dev/null
git pull -q --ff-only origin dev
npm ci --silent >/dev/null
git push -q origin --delete "$branch"
if git ls-remote --heads origin "refs/heads/$branch" | grep -q .; then
  echo "DELETE FAILED $branch"
  exit 6
fi
rm -f "$log"
echo "LANDED $branch $url $(git log --oneline -1)"
