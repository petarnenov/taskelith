## 1. Change

- [x] 1.1 Create the change `run-g2-native-acceptance-linux-host` (evidence only, `skip_specs`)

## 2. Host and baseline

- [x] 2.1 Host gate: record OS, kernel, architecture, cgroup version, Docker Engine, storage driver, Node.js, and the `/tmp` condition
- [x] 2.2 Run `make verify` on `dev` with `TMPDIR` on disk

## 3. Evidence

- [x] 3.1 Dry run of the Linux entry after `npm run build`
- [x] 3.2 Evidence run of the Linux entry into `openspec/changes/run-g2-native-acceptance-linux-host/results.jsonl`
- [x] 3.3 Run `make scenario-worker-namespace-confinement` on `x86_64` and record it
- [x] 3.4 Write `acceptance.md`, the acceptance table, labelled native-host evidence
- [x] 3.5 Record `verification.md`

## 4. Review and archive

- [ ] 4.1 Independent review (Codex CLI, `gpt-6-astra`, medium effort, read-only)
- [ ] 4.2 Archive the change
