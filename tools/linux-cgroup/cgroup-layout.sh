# Sourced: moves every process into the leaf init/, so the root cgroup can
# hold the delegated containment parent executions/ beside it.
cgroup=/sys/fs/cgroup
mkdir -p "$cgroup/init" "$cgroup/executions"
while read -r pid; do
  echo "$pid" > "$cgroup/init/cgroup.procs" 2>/dev/null || true
done < "$cgroup/cgroup.procs"
