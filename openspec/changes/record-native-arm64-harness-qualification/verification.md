## Scope and source

The remaining native linux/arm64 gate of G2 work item 26, assigned in a brief from the coordinator, Niki, on 2026-10-26. The scope: run the unchanged `make qualify-harnesses` target natively for linux/arm64 on an Apple Silicon host, and record the evidence in the Claude Code and Codex qualification records and, where it names linux/arm64 as pending, the dependency register. Sources: the archived change `2026-10-26-qualify-harnesses-in-worker-image`, whose `verification.md` records the coordinator's decision of 2026-10-25 that a native run on an Apple Silicon host follows as an addendum, and its "Remaining gates".

Out of scope, per the brief: any login, subscription, or model call, and every scenario that needs one; any change to code or scripts. Both harnesses stay `candidate`.

## Revision and environment

- Base: `origin/dev` at `60341e0`. Branch `record-native-arm64-harness-qualification`. The run used the tree of `60341e0`, as its `image.txt` records; the change files were untracked then and are not in the build context.
- Host: macOS 26.6.2 (build 25G83) on Apple Silicon (Apple M3, arm64); the shell was not translated by Rosetta (`sysctl.proc_translated` is 0). Docker Desktop with engine 29.6.1 on linux/arm64 (LinuxKit kernel 6.12.76, aarch64) and Compose 5.2.0. Node.js 24.22.1 from `.nvmrc`.

## Author self-check and evidence check

- Native, not emulated: the engine reports `linux/arm64`, the build's `--platform` was `linux/arm64`, and the `platform` step printed `Linux aarch64`.
- Same inputs as the linux/amd64 run: the SHA-256 values of the Dockerfile (`2abdb24b…`), the harness manifest (`2a3472f9…`) and lockfile (`5cec02e4…`), `qualify.sh` (`9e3ccb05…`), and `scripts/harness-qualification.sh` (`c1c1a661…`) in `image.txt` equal those the records quote for the run at `c0f7bf8`.
- The installed packages are the locked ones: `npm ci --ignore-scripts` checks each tarball against the lockfile's `sha512`, and the records already state the integrity of `@anthropic-ai/claude-agent-sdk-linux-arm64@0.3.308` and `@openai/codex-linux-arm64@0.164.0-linux-arm64`.
- Every value in the records was copied from the run's output files (`image.txt`, `steps.txt`, `changes.txt`, `listing-changes.txt`, `credential-files.txt`), kept outside the worktree.
- The side effects were checked line by line: apart from the schema files and the steps' own outputs, `listing-changes.txt` adds only `claude/.claude.json` (600), `claude/backups/` (755) with one backup file (600), `codex/tmp/` (755), and `codex/tmp/arg0-linux` (700), as on linux/amd64; `/opt/harnesses` is unchanged; `credential-files.txt` is empty.
- The emulated linux/arm64 entry still says "not run"; only its "this host" was made explicit as "the x86_64 host".

## Checks

| Check | Result |
| --- | --- |
| `make qualify-harnesses OUT=<scratch>/arm64-qualify PLATFORMS=linux/arm64` at `60341e0` | passed in 32 s; finished 2026-10-26T01:34:56Z; exit status 0; `harness-qualification.sh: linux/arm64 done`. Image ID `sha256:14a88bbd15c8c1161241e733da36df68f809414ecaa6ac47f31bbe4c0df9965b` (local build, no registry digest) |
| Step results on linux/arm64 | every step matched its expected exit status and output: environment, environment names (none contains `KEY`, `TOKEN`, or `SECRET`), platform `Linux aarch64`, Ubuntu 24.04.5 LTS, Node.js v24.22.1, user `taskelith`; Claude Code binary `@anthropic-ai/claude-agent-sdk-linux-arm64/claude`, SHA-256 `fdd22e6cbb734d580f5664c48df4294eeec850218ff07f186f9af30426396ee1`, `2.1.308 (Claude Code)`, `-musl` package absent, `auth status` exit 1 with `"loggedIn": false`; Codex binary `@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/bin/codex`, SHA-256 `8813c8d8a4cea2eeba271b72ab22f49628b184b24ab18dbef06b4ce41e9a8d39`, `codex-cli 0.164.0`, `login status` exit 1 with `Not logged in`; app-server schema 320 files, digest `fc9256ad0eac370b62b095b8ea218d086d78f954a142f9e1a2e0fee58802c147` (equal to linux/amd64); both writes refused with `Permission denied`; harness tree unchanged |
| Credential search of the image as root | no `auth.json` or `.credentials.json` |
| `npm run openspec -- validate record-native-arm64-harness-qualification --strict` | valid |
| `npm run verify:comments` | passed, as part of `make verify` |
| `make verify` at `bb0574f` | passed; 1403 tests, 1403 passed, 0 failed; coverage 99.24 % lines, 91.37 % branches, 98.72 % functions; archive dry run valid; package verification passed |

## Independent review

Pending. Reviewer to be assigned by the coordinator: OpenCode, `kimi-k3.1-pro#high`. No pass has run.

## Limitations

- One native run on one host. Repeated runs stay open, as for linux/amd64.
- The Docker engine runs in Docker Desktop's LinuxKit VM, not on a bare-metal Linux host; it runs arm64 code natively.
- The image ID is a local build ID; the variant is not pushed to a registry, so it has no registry digest.
- The model-calling scenarios stay not run on both architectures.

## Remaining gates

- Independent review by OpenCode `kimi-k3.1-pro#high`, pending.
- Coordinator integration, merge into `dev`, and archive.
- The scenarios that need a login on Linux, on linux/amd64 and linux/arm64: G3 item 35 for Claude Code, and the G4 admission for Codex.
