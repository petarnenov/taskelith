#!/usr/bin/env bash
# The G2 failure scenarios (item 24a), sourced by installation.sh, which
# defines compose, the project, and its other steps.

scenario_directory="$repository/infra/installation/scenarios"
# An untimed kill lands at most this long after the task's submission.
KILL_WINDOW_MILLISECONDS=25000
# Deadlines in seconds; each covers its probes, not only the pauses. The
# restart's phase is part of the reconciliation's, counted from the restart.
START_SECONDS=60
REFUSAL_SECONDS=60
RESTART_SECONDS=60
RECONCILIATION_SECONDS=120

scenario_tool() {
  node --experimental-strip-types "$repository/scripts/installation-scenario.ts" "$@"
}

begin_scenario() {
  scenario="$1"
  seed="$(scenario_tool seed)"
  scenario_step="starting"
  echo "installation.sh: scenario $scenario, seed $seed" >&2
}

step() {
  scenario_step="$1"
  echo "installation.sh: $scenario: $1" >&2
}

record_scenario() {
  echo "installation.sh: $scenario $1: $2" >&2
  scenario_tool record "$scenario" "$seed" "$1" "$2"
}

fail_scenario() {
  echo "installation.sh: $scenario: $1" >&2
  exit 1
}

engine() {
  docker info --format '{{.OperatingSystem}} {{.ServerVersion}} {{.Architecture}}'
}

# The fresh-composition happy path is the smoke itself, in its own process,
# so that its failure can still be recorded.
fresh_composition_scenario() {
  begin_scenario fresh-composition
  if ! bash "$repository/scripts/installation.sh" smoke "$project"; then
    record_scenario failed "the installation smoke failed on $(engine)"
    exit 1
  fi
  record_scenario passed "fresh installation on $(engine): a task was submitted, assigned to the enrolled Linux worker, executed, and stored as ended, exited with code 0 and a proven start"
}

# A failed scenario records the step it failed in, after the logs.
finish_scenario() {
  local status="$1"
  trap - EXIT
  # Only an unfinished scenario gets here, since finish_passed disarms the
  # trap; bash can pass status 0 after an expansion error under set -u.
  if [ "$status" -eq 0 ]; then status=1; fi
  compose --profile worker logs --no-color control-plane worker >&2 || true
  record_scenario failed "failed while $scenario_step" || true
  remove_leftovers
  exit "$status"
}

# Removes the project, then records the pass with DETAIL; the failure trap
# stays armed until both succeeded, so a failed cleanup is recorded.
finish_passed() {
  step "cleaning up"
  remove_project || fail_scenario "the throwaway project was not fully removed"
  record_scenario passed "$2"
  trap - EXIT
  echo "installation.sh: $1"
}

# A fresh project with an enrolled worker and the scenarios' longer process.
scenario_project() {
  compose_files+=(--file "$smoke_directory/compose.yaml" --file "$scenario_directory/compose.yaml")
  fresh_project
  trap 'finish_scenario $?' EXIT
  step "building and enrolling a fresh installation"
  build
  bootstrap_operator "$scenario" 'opt-in failure scenario'
  start
  enroll
  url="$(api_url)"
}

monotonic_milliseconds() {
  node -e 'process.stdout.write(String(process.hrtime.bigint() / 1000000n))'
}

seconds_of() {
  printf '%d.%03d' "$(($1 / 1000))" "$(($1 % 1000))"
}

# Stops PROCESS first, so that it starts no child while they are killed.
kill_tree() {
  local child
  kill -STOP "$1" 2>/dev/null || return 0
  for child in $(pgrep -P "$1" || true); do kill_tree "$child"; done
  kill -KILL "$1" 2>/dev/null || true
}

# Runs a probe with its arguments for at most MILLISECONDS, then kills it
# with its children; answers the probe's status.
bounded_probe() {
  local limit="$1" probe watchdog status=0
  shift
  "$@" &
  probe=$!
  { sleep "$(seconds_of "$limit")"; kill_tree "$probe"; } &
  watchdog=$!
  wait "$probe" || status=$?
  kill_tree "$watchdog"
  wait "$watchdog" 2>/dev/null || true
  return "$status"
}

# Probes for at most SECONDS of the monotonic clock, probes included.
await_condition() {
  local seconds="$1"
  shift
  await_until "$(($(monotonic_milliseconds) + seconds * 1000))" "$@"
}

# Probes once a second until it succeeds or the monotonic clock reaches
# DEADLINE in milliseconds; fails at the deadline.
await_until() {
  local deadline="$1" remaining
  shift
  for (( ; ; )); do
    remaining="$((deadline - $(monotonic_milliseconds)))"
    if [ "$remaining" -le 0 ]; then return 1; fi
    if bounded_probe "$remaining" "$@"; then return 0; fi
    remaining="$((deadline - $(monotonic_milliseconds)))"
    if [ "$remaining" -le 0 ]; then return 1; fi
    sleep "$(seconds_of "$((remaining < 1000 ? remaining : 1000))")"
  done
}

sql() {
  compose exec -T postgres psql --username taskelith --dbname taskelith \
    --no-align --tuples-only --quiet --field-separator ' ' --command "$1"
}

# "id state certainty" per execution of TASK, as the control plane holds it.
task_executions() {
  sql "SELECT e ->> 'id', e ->> 'state', CASE WHEN e -> 'evidence' @> '[{\"kind\": \"uncertain\"}]'
    THEN 'uncertain' ELSE 'certain' END FROM tasks, jsonb_path_query(record::jsonb,
    '\$.attempts[*].executions[*]') e WHERE id = '$1' ORDER BY 1"
}

# The states of TASK's executions only, for example "started+uncertain".
execution_states() {
  task_executions "$1" | awk '{ print $2 ($3 == "uncertain" ? "+uncertain" : "") }' | paste -sd ',' -
}

task_result() {
  scenario_tool result "$url" "$1"
}

unrevoked_workers() {
  sql "SELECT worker_id FROM workers WHERE NOT revoked ORDER BY worker_id"
}

# "state reservation" of each assignment of WORKER.
worker_assignments() {
  sql "SELECT state, reservation_state FROM assignments WHERE worker_id = '$1' ORDER BY id" | paste -sd ',' -
}

has_started() {
  [ "$(execution_states "$1")" = started ]
}

worker_container() {
  compose --profile worker ps --all --quiet worker
}

# "status exit-code start-time" of the worker container.
worker_state() {
  docker inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.StartedAt}}' "$(worker_container)"
}

started_at() {
  worker_state | cut -d ' ' -f 3
}

# The worker's log lines since TIME that contain TEXT.
worker_log_lines() {
  compose --profile worker logs --no-color --no-log-prefix --since "$1" worker 2>&1 | { grep -F "$2" || true; }
}

# The worker started after START and exited with a failure.
exited_since() {
  local status code started
  read -r status code started <<< "$(worker_state)"
  [ "$status" = exited ] && [ "$code" != 0 ] && [ "$started" != "$1" ]
}

# The worker runs, started after START, and its new process logged its
# first reconciliation pass and its broker contact.
back_since() {
  local status code started
  read -r status code started <<< "$(worker_state)"
  [ "$status" = running ] && [ "$started" != "$1" ] \
    && [ -n "$(worker_log_lines "$started" '"event":"worker.reconciliation.planned"')" ] \
    && [ -n "$(worker_log_lines "$started" '"event":"worker.contact.online"')" ]
}

# The worker still runs the process that started at START.
running_since() {
  local status code started
  read -r status code started <<< "$(worker_state)"
  [ "$status" = running ] && [ "$started" = "$1" ]
}

# A one-off container of the worker image on the worker's volume.
in_worker_volume() {
  compose --profile worker run --rm --no-deps -T --entrypoint "$1" worker "${@:2}"
}

# The journal goes, its identity stays: the worker must exit on its refusal,
# so its restart policy is off for this one start.
lose_journal() {
  local container previous refused
  step "losing the journal and keeping the identity"
  in_worker_volume find /var/lib/taskelith/worker/journal -name 'journal.sqlite*' -delete
  container="$(worker_container)"
  previous="$(started_at)"
  docker update --restart no "$container" >/dev/null
  step "expecting the worker to refuse the missing journal and exit"
  compose --profile worker start worker >&2
  await_condition "$REFUSAL_SECONDS" exited_since "$previous" \
    || fail_scenario "the worker did not exit after starting without its journal"
  refused="$(worker_log_lines "$(started_at)" 'journal-loss' | tail -n 1)"
  if [ -z "$refused" ]; then fail_scenario "the worker exited without the journal-loss refusal"; fi
  echo "installation.sh: $scenario: exited ($(worker_state)) after: $refused" >&2
  docker update --restart unless-stopped "$container" >/dev/null
  in_worker_volume test -s /var/lib/taskelith/worker/identity \
    || fail_scenario "the identity is gone"
  in_worker_volume test ! -e /var/lib/taskelith/worker/journal/journal.sqlite \
    || fail_scenario "the worker created a journal on its own"
}

# Only the contents of this project's worker volume go, never the volume.
lose_data_root() {
  step "losing the worker's whole data root"
  in_worker_volume find /var/lib/taskelith -mindepth 1 -delete
  in_worker_volume test ! -e /var/lib/taskelith/worker || fail_scenario "the data root is not empty"
}

revoke_worker() {
  step "revoking the lost worker $1"
  compose run --rm --no-deps -T --env TASKELITH_OPERATOR_TOKEN admin revoke-worker "$1" >&2
}

expect_equal() {
  if [ "$2" != "$3" ]; then fail_scenario "$1: expected '$3', got '$2'"; fi
}

# Disk loss during an attempt (worker journal, "Whole data root lost").
disk_loss_scenario() {
  local lost_worker new_worker task=disk-loss-task next_task=disk-loss-next-task
  begin_scenario worker-disk-loss
  scenario_project
  lost_worker="$(unrevoked_workers)"
  step "submitting a task and awaiting its start"
  scenario_tool submit "$url" "$smoke_directory/workflows.json" "$task"
  await_condition "$START_SECONDS" has_started "$task" || fail_scenario "the execution did not start"
  step "killing the worker during the attempt"
  compose --profile worker kill worker >&2
  lose_journal
  lose_data_root
  revoke_worker "$lost_worker"
  step "enrolling a new worker"
  enroll
  new_worker="$(unrevoked_workers)"
  if [ -z "$new_worker" ] || [ "$new_worker" = "$lost_worker" ]; then
    fail_scenario "no new worker identity: '$new_worker'"
  fi
  step "checking the lost attempt"
  echo "installation.sh: $scenario: executions $(task_executions "$task" | paste -sd ',' -)" >&2
  expect_equal "the lost attempt's executions" "$(execution_states "$task")" started+uncertain
  expect_equal "the lost worker's assignments" "$(worker_assignments "$lost_worker")" "accepted held"
  expect_equal "the lost task's result" "$(task_result "$task")" pending
  step "running a task on the new worker"
  scenario_tool submit "$url" "$smoke_directory/workflows.json" "$next_task"
  scenario_tool await-exit "$url" "$next_task" >/dev/null
  expect_equal "the new worker's assignments" "$(worker_assignments "$new_worker")" "ended released"
  finish_passed "lost the worker's data root, enrolled a new worker, removed" "on $(engine): worker killed with its attempt started; with the journal gone and the identity kept it logged the journal-loss refusal and exited with a failure, and created no journal; after the data root was lost and the worker revoked, a new worker enrolled, the old execution stayed started with uncertain evidence and its reservation held, the task pending; a new task exited 0 on the new worker"
}

# "id state certainty" per execution of the stopped worker's journal, read
# from a copy, since the journal admits no shared reader.
journal_executions() {
  in_worker_volume bash -c 'mkdir /tmp/journal && cp /var/lib/taskelith/worker/journal/journal.sqlite* /tmp/journal/ \
    && node --input-type=module -' < "$scenario_directory/journal-executions.mjs"
}

# Every execution of TASK ended, or carries uncertainty, and one exists.
is_reconciled() {
  local executions
  executions="$(task_executions "$1")"
  [ -n "$executions" ] \
    && ! printf '%s\n' "$executions" | awk '$2 != "exited" && $2 != "not-started" && $3 != "uncertain"' | grep -q .
}

# The distinct worker.execution events the worker logged since TIME.
execution_events() {
  worker_log_lines "$1" '"event":"worker.execution.' \
    | { grep -o '"event":"worker\.execution\.[a-z.-]*"' || true; } | cut -d '"' -f 4 | sort -u | paste -sd ',' -
}

# A new worker process reconciles and keeps running while TASK's executions
# end or become uncertain, both by one deadline from the monotonic RESTART.
await_restarted_reconciliation() {
  local task="$1" killed_start="$2" restart="$3" total phase restarted
  total="$((restart + RECONCILIATION_SECONDS * 1000))"
  phase="$((restart + RESTART_SECONDS * 1000))"
  await_until "$((phase < total ? phase : total))" back_since "$killed_start" \
    || fail_scenario "no new worker process reached its reconciliation and the broker"
  restarted="$(started_at)"
  await_until "$total" is_reconciled "$task" \
    || fail_scenario "the task's executions did not end or become uncertain in time"
  running_since "$restarted" || fail_scenario "the restarted worker did not keep running"
}

# SIGKILL of the worker container at an untimed moment of an attempt; the
# pause is planned from the seed, the interval measured.
worker_kill_scenario() {
  local task=worker-kill-task pause container killed_start submitted measured before restart after result journal
  local restarted events
  begin_scenario worker-kill
  scenario_project
  pause="$((seed % KILL_WINDOW_MILLISECONDS))"
  container="$(worker_container)"
  killed_start="$(started_at)"
  step "submitting a task and killing the worker after a pause of $pause ms"
  scenario_tool submit "$url" "$smoke_directory/workflows.json" "$task"
  submitted="$(monotonic_milliseconds)"
  sleep "$(seconds_of "$pause")"
  docker kill --signal KILL "$container" >/dev/null
  measured="$(($(monotonic_milliseconds) - submitted))"
  before="$(execution_states "$task")"
  step "restarting the worker"
  restart="$(monotonic_milliseconds)"
  compose --profile worker start worker >&2
  step "awaiting the new worker process and the reconciliation"
  await_restarted_reconciliation "$task" "$killed_start" "$restart"
  restarted="$(started_at)"
  after="$(execution_states "$task")"
  result="$(task_result "$task")"
  step "comparing the control plane with the worker journal"
  compose --profile worker stop worker >&2
  events="$(execution_events "$restarted")"
  journal="$(journal_executions)"
  echo "installation.sh: $scenario: journal $(printf '%s' "$journal" | paste -sd ',' -)" >&2
  expect_equal "the journal's executions" "$journal" "$(task_executions "$task")"
  finish_passed "killed and restarted the worker, reconciled, removed" "on $(engine): SIGKILL after a planned pause of $pause ms, measured $measured ms from the submission's answer to the kill's return; executions just after the kill '${before:-none}'; the restarted worker reached its reconciliation and stayed up; the control plane then held executions '$after' and the result '$result', as the worker journal did; worker events: ${events:-none}"
}

# The status fields an execution and the probes must share (item 25a).
STATUS_FIELDS='^(Uid|CapEff|CapBnd|NoNewPrivs|Seccomp|Seccomp_filters):'
# clone flags CLONE_NEWUSER | SIGCHLD.
CLONE_NEWUSER_FLAGS=268435473
CLONE3_NUMBER=435
# Calls the syscall of its arguments: prints "errno N", or "created" when
# a child was cloned, which exits at once.
SYSCALL_PROBE='require POSIX; my ($n, @a) = map { $_ + 0 } @ARGV; $! = 0;
my $r = syscall($n, @a); if ($r < 0) { print "errno ", 0 + $!; exit 1 }
if ($r == 0) { POSIX::_exit(0) } waitpid($r, 0); print "created"; exit 0'

worker_exec() {
  compose --profile worker exec -T worker "$@"
}

# Runs a command through a setpriv equal to the worker's, as the execution
# account: uid and gid 10003, no capability, the worker's bounding set.
as_execution() {
  worker_exec setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all \
    --reuid=10003 --regid=10003 --clear-groups -- "$@"
}

one_line() {
  tr -s ' \t\n' ' ' | sed 's/ $//'
}

probe_status() {
  as_execution grep -E "$STATUS_FIELDS" /proc/self/status | one_line
}

# The status fields and the cgroup of the running execution, the oldest
# process of the execution account, on two lines.
execution_identity() {
  local raw
  raw="$(worker_exec bash -c 'pid="$(pgrep -o -u 10003)" && grep -E "$1" "/proc/$pid/status" \
    && echo cgroup: && cat "/proc/$pid/cgroup"' identity "$STATUS_FIELDS")" || return 1
  printf '%s\n' "$raw" | sed '/^cgroup:$/,$d' | one_line
  echo
  printf '%s\n' "$raw" | sed '1,/^cgroup:$/d'
}

# Writes the execution's identity to FILE once both of its lines are read.
capture_identity() {
  execution_identity > "$1" && [ "$(grep -c . "$1")" -eq 2 ]
}

# The command after LABEL, a matcher, and EXPECTED must fail as the
# execution account with output that the matcher accepts.
refused_probe() {
  local label="$1" matcher="$2" expected="$3" output
  shift 3
  if output="$(as_execution "$@" 2>&1)"; then fail_scenario "the execution account could $label: $output"; fi
  if ! "$matcher" "$output" "$expected"; then
    fail_scenario "the probe to $label failed otherwise than '$expected': $output"
  fi
  echo "installation.sh: $scenario: refused to $label: $output" >&2
}

contains() {
  [[ "$1" == *"$2"* ]]
}

equals() {
  [ "$1" = "$2" ]
}

expect_refused() {
  refused_probe "$1" contains "$2" "${@:3}"
}

# The syscall probe's output must be exactly "errno ERRNO".
expect_errno() {
  refused_probe "$1" equals "errno $2" "${@:3}"
}

clone_number() {
  case "$(worker_exec uname -m)" in
    aarch64) echo 220 ;;
    x86_64) echo 56 ;;
    *) fail_scenario "no clone syscall number for $(worker_exec uname -m)" ;;
  esac
}

# Every namespace call of the profile, as the execution account; without
# it, clone3 and setns answer EINVAL, which tells it from a host limit.
probe_namespaces() {
  local clone
  clone="$(clone_number)"
  expect_refused "create a user namespace" "unshare failed: Operation not permitted" unshare -U true
  expect_refused "mount a tmpfs in new user and mount namespaces" "unshare failed: Operation not permitted" \
    unshare -Urm mount -t tmpfs none /mnt
  expect_errno "call clone3, which the profile answers with ENOSYS" 38 \
    perl -e "$SYSCALL_PROBE" "$CLONE3_NUMBER" 0 0
  expect_errno "clone into a new user namespace" 1 \
    perl -e "$SYSCALL_PROBE" "$clone" "$CLONE_NEWUSER_FLAGS" 0 0 0 0
  expect_refused "enter a user namespace with setns" "failed: Operation not permitted" \
    nsenter --user=/proc/self/ns/user true
}

# The digest of the profile the worker container runs with, once it equals
# the tracked worker profile.
applied_profile() {
  node --experimental-strip-types "$repository/scripts/worker-seccomp-profile.ts" applied \
    "$(docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$(worker_container)")"
}

# The native acceptance row's platform: OS, architecture, kernel, file
# system, and versions.
platform() {
  local os kernel architecture version driver filesystem image
  IFS='|' read -r os kernel architecture version driver <<< "$(docker info --format \
    '{{.OperatingSystem}}|{{.KernelVersion}}|{{.Architecture}}|{{.ServerVersion}}|{{.Driver}}')"
  filesystem="$(worker_exec stat -f -c %T /var/lib/taskelith)"
  image="$(docker image inspect --format '{{.Id}}' "$worker_image")"
  echo "OS $os; architecture $architecture; kernel $kernel; file system $filesystem" \
    "(worker data root), storage driver $driver; Docker engine $version;" \
    "Docker Compose $(docker compose version --short); worker image $image"
}

# The execution account cannot create a namespace in the worker container,
# while the delegation and the executions still work.
namespace_confinement_scenario() {
  local task=namespace-task digest execution identity status cgroup probe row identity_file
  begin_scenario worker-namespace-confinement
  scenario_project
  step "checking the worker's containment and its seccomp profile"
  check_containment
  digest="$(applied_profile)"
  step "running a task and reading its execution"
  scenario_tool submit "$url" "$smoke_directory/workflows.json" "$task"
  identity_file="$(mktemp)"
  await_condition "$START_SECONDS" capture_identity "$identity_file" \
    || fail_scenario "the execution's status and cgroup could not be read"
  identity="$(cat "$identity_file")"
  rm -f "$identity_file"
  await_condition "$START_SECONDS" has_started "$task" || fail_scenario "the execution did not start"
  execution="$(task_executions "$task" | cut -d ' ' -f 1)"
  status="$(printf '%s\n' "$identity" | sed -n 1p)"
  cgroup="$(printf '%s\n' "$identity" | sed -n 2p)"
  expect_equal "the execution's cgroup" "$cgroup" "0::/executions/$execution"
  step "probing namespaces as the execution account"
  probe="$(probe_status)"
  expect_equal "the probe's status" "$probe" "$status"
  case "$probe" in
    "Uid: 10003 10003 10003 10003 CapEff: 0000000000000000 "*) ;;
    *) fail_scenario "the probe does not run as the execution account: $probe" ;;
  esac
  probe_namespaces
  step "checking the cgroup delegation"
  worker_exec test -d /sys/fs/cgroup/executions || fail_scenario "the containment parent is missing"
  worker_exec bash -c 'mkdir /sys/fs/cgroup/executions/probe && rmdir /sys/fs/cgroup/executions/probe' \
    || fail_scenario "the containment parent refused a cgroup write"
  step "awaiting the task's exit"
  scenario_tool await-exit "$url" "$task" >/dev/null
  row="$(platform)"
  finish_passed "refused the execution account's namespaces, ran a task, removed" "$row; applied seccomp profile sha256 $digest, equal to infra/installation/seccomp/worker.json: the execution $execution ran in '$cgroup' with status '$status' and exited 0; as the execution account with the same status, unshare -U and unshare -Urm with mount -t tmpfs were refused with EPERM, clone3 answered ENOSYS, clone with CLONE_NEWUSER and setns were refused with EPERM; the worker kept KILL, SETGID, and SETUID only; executions/ existed and took a cgroup write"
}
