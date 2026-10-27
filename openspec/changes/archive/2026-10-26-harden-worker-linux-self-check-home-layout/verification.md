# Verification

Date: 2026-10-26. Author verification is recorded below. Review passes are recorded below as they occur.

## Scope and source

The worker's home cgroup layout check, left open by the archived [`implement-unrecorded-process-scan`](/openspec/changes/archive/2026-10-26-implement-unrecorded-process-scan/design.md) design ("Risks / Trade-offs", the worker's own cgroup is not excluded). The owner's delegate chose option A in away run `20261026T130340Z-opencode-33653`, relayed by the coordinator. The scope is as design.md "Owner decision" states.

- Base revision: `311c40d` on `dev`.
- Implementation revision: `eb6cce2`.
- Out of scope: wiring the self-check into worker admission (design D3), excluding the home in the scan, any `apps/worker` change, 20e2 (admission pressure, disk, backlog), and 23b.

## Environment

- Linux x86_64 (kernel 6.8), Node v24.22.0 through `nvm use` and the pinned-node wrapper of `make verify`, Docker 27.3.1 with the Compose services of `make verify`.
- Dependencies: none added.

## Author self-check

- **Contract:** one sentence added to section 13 of `docs/contracts/supervisor-identity.md`, next to the self-check case without delegation; no other contract change.
- **Spec:** the `worker-supervisor` delta modifies "Linux readers and containment" with its existing text and scenario copied verbatim, one added requirement sentence, and one added scenario.
- **Refusal:** a home equal to the parent, the parent with a trailing slash, a direct child, and a deeper descendant each fail with exactly `the home cgroup <home> is at or under the containment parent <parent>`, and no probe cgroup is created (`worker-supervisor/test/linux.test.ts`).
- **Sibling layout and segments:** `init/` beside `executions/`, `executions-home/` (a string prefix of the parent's name), and the cgroup root raise no layout problem (`linux.test.ts`); the existing self-check test with the sibling layout is unchanged.
- **Privileged test:** `linux-cgroup.privileged.ts` adds the refusal for `executions` and `executions/init`; the sibling layout test (`init` beside `executions`) is unchanged.
- **Admission wiring:** no production code calls `checkLinuxContainment`; it is exported at `packages/adapters/worker-supervisor/src/index.ts:28` and called only by tests, and `apps/worker/src/main.ts:95-113` (`supervisionHost`) runs no self-check. The refusal reaches admission once G3 item 27 (`implement-worker-self-check-admission`, `docs/g3-plan.md:51`) calls the existing self-check; recorded as a remaining gate.
- **Clean Code and architecture:** the check is a small pure function in the adapter; no port, kernel, or app change.
- **Comment rule:** `npm run verify:comments` passes.
- **Evidence check:** N/A for external sources: the change cites no external link; every internal claim names a repository file or test.

## Checks and results

- `npm run openspec -- validate harden-worker-linux-self-check-home-layout --strict`: `Change 'harden-worker-linux-self-check-home-layout' is valid`.
- `node --experimental-strip-types --test packages/adapters/worker-supervisor/test/linux.test.ts`: 8 tests, 8 passed.
- Author, at `eb6cce2`: `make verify` exit 0; 1705 tests in 36 suites, 1689 passed, 0 failed, 0 cancelled, 16 skipped; coverage 99.18% lines, 91.78% branches, 98.81% functions; `Every comment is within the comment length rule.`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`
- Session, after merging `origin/dev` at `9d4646a` (brings only the reviewed `harden-nats-broker-stop` change): `make verify` exit 0; 1706 tests, 1690 passed, 0 failed, 16 skipped; coverage 99.19% lines, 91.78% branches, 98.81% functions.
- `make verify-linux-cgroup`: not run in this environment (see "Remaining gates").

## Review passes

- Pass 1: OpenCode CLI, assigned by the coordinator, Niki. Model
  `opencode-go/kimi-k2.7-code`, default variant, agent `reviewer`. Invocation,
  run from the worktree: `opencode run --standalone --agent reviewer -m
  'opencode-go/kimi-k2.7-code' --format json --title
  harden-worker-linux-self-check-home-layout "$(cat <prompt-file>)" < /dev/null
  > <log>`, with the prompt and log outside the worktree.
  - Session `ses_e878e8c0cfferh0K6dSEITrMTv`, 2026-10-26 15:41:02 to 15:51:11
    local time, on `9d4646a` (task diff `311c40d..4555753`, merge checked).
  - Model confirmation: the model was set by `-m`. The JSON events carry the
    session ID but not the model, and the `--standalone` session's stored
    messages were not found on this machine, so they were not inspected.
  - Snapshot before and after:
    `fc3e19b933622a44dccb188a41bd7260e67874e7a6840f84ef6a72a3016863f7`
    (unchanged).
  - The reviewer inspected the code, tests, spec delta, contract, and records
    statically; its shell could not run `make verify`.
  - Findings: none. Counts: Critical 0, High 0, Medium 0, Low 0.

## Limitations

- The privileged cgroup test was not run here; its new case is checked only by type checking and by the unit tests of the same path logic.
- The check compares the paths it is given; it does not follow symbolic links or compare cgroup inodes (design "Risks / Trade-offs").

## Remaining gates

- `make verify-linux-cgroup`, run by the coordinator on the x86_64 iMac at integration.
- Admission wiring: the refusal takes effect at runtime only when worker admission calls the self-check (G3 item 27); not built here.
- Integration and archive by the coordinator.
