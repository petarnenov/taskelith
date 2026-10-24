# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

Owner request on 2026-10-24: qualify Claude Code as the next G0 task, running it against the owner's account. The owner then chose device authentication for the subscription. Base revision: `4b225b6`. Scope: `docs/qualification/claude-code.md` (new), the "Agent harnesses" section of `docs/dependencies.md`, the Claude Code delivery line of `docs/integration-candidates.md`, the "First integrations" and "Governance integration" rows and the closing paragraph of `docs/foundation.md`, and this change's artifacts. Documentation only.

## Qualification runs

Environment: macOS 26.6.2 (25G83), x86_64, Node.js 24.22.1. `@anthropic-ai/claude-agent-sdk@0.3.308` was installed with `--ignore-scripts` into a scratch directory outside the repository. Device login: the owner ran `/login` with the pinned binary into a dedicated `CLAUDE_CONFIG_DIR`, and `claude auth status` with that directory reported `loggedIn: true`, `authMethod: claude.ai`.

Series `s2` ran through `make all` (a Makefile in the scratch directory). The final `summary` step of that run failed on a state file in the runs directory; `summarize.mjs`, which only reads logs and is not in the hashed set, was fixed and re-run. Each run directory holds `meta.json` (script hashes, SDK version, binary hash, allowlisted environment with `HOME` and `USER` masked, telemetry flags, timestamps, exit status), `out.jsonl` (probe result), `proxy.jsonl` (method, host, and path of each request), and `sockets.txt` (sampled sockets of the probe process tree). Script hashes in every `meta.json` match the final scripts: `capability-probe.mjs` `be2e5c63…`, `mitm-proxy.mjs` `c4519795…`, `orchestrate.mjs` `2eca655e…`.

| Run | Telemetry | Result |
| --- | --- | --- |
| `s2-egress-on` | defaults | 2/2 assistant messages correlated; telemetry to event-logging, eval, and Datadog endpoints |
| `s2-egress-off` | `DISABLE_TELEMETRY=1` | 2/2 correlated; no telemetry request; five configuration `GET`s remain |
| `s2-egress-minimal` | plus nonessential traffic off | 2/2 correlated; only `GET /v1/mcp_servers` remains |
| `s2-approval-deny` / `s2-approval-allow` | off | callback received the request; deny: no side effect; allow: side effect |
| `s2-resume-create` / `s2-resume-continue` | off | new process recalled the code word under the same session ID |
| `s2-interrupt` | off | result at 8,012 ms with `error_during_execution`; marker absent at 78,055 ms |
| `s2-max-turns` | off | `error_max_turns`; the SDK threw after the result |
| `s2-crash-pending` / `s2-crash-resume` | off | pending written at 12:45:13.999Z, observed at 12:45:14.226Z, SIGKILL of both PIDs at 12:45:16.278Z; original `toolUseID` not re-delivered; a new request checked the file; no side effect |

No run showed a non-loopback socket, a UDP socket, or a TLS error. In the sampled sockets, only the harness process had network sockets; the probe process had none.

Series 1 (before review pass 1) is superseded and unused. Its runner started the probe through `npm exec` inside the proxied environment, which put `registry.npmjs.org` into the log. Its scripts changed between runs, and it used the owner's own configuration directory. The ten session transcripts it wrote into the owner's `~/.claude/projects/` were deleted with the owner's approval.

## Host side effect found after series 2

Local times below are UTC+03:00. While preparing review pass 2, the author found the owner's `~/.local/bin/claude` symlink missing. Timestamps place its removal at 15:42:34 local time, during the owner's interactive `/login` with the pinned 2.1.308 binary that the author had instructed. `~/.local/share/claude/versions` was also modified at 15:43:57, during series `s2`. The author restored the symlink to the 2.1.310 installation the owner had been using (`claude --version` confirmed 2.1.310), recorded the finding in the qualification record, and recorded `DISABLE_AUTOUPDATER=1` as a requirement for later runs; the orchestrator was left unchanged so that its hash still matches the `s2` metadata. The `s2` evidence was not re-run; its proxy logs show no update download.

## Checks

Under the exact CI pins Node v24.22.1 and npm 12.2.1: `npm test` 19 passed, 0 failed; `npm run verify:dependencies` passed; strict OpenSpec validation 10 passed, 0 failed; `npm run verify:package` passed; local link and anchor check passed; the evidence check (external links pinned or labeled "docs") passed; `git diff --check` passed.

## Independent review

Assigned reviewer: Claude Code with `--model claude-fable-5-1 --effort medium --permission-mode plan`, with editing tools disallowed and read-only access to the scratch evidence directory. The JSON output confirms the model `claude-fable-5-1`; the effort level was set by flag and is not echoed in the output. SHA-256 snapshots of the repository and of the evidence directory before and after the pass showed no reviewer change. At most three passes.

- **Pass 1 — session `80589f3f-7066-460e-97d0-bc352da06cec`.** Findings: 0 Critical, 4 High, 5 Medium, 6 Low. All accepted and resolved by re-running every scenario with a corrected method (series `s2`) and rewriting the record:
  1. High: `registry.npmjs.org` came from the runner's `npm exec`. The probe now starts with a direct Node binary and no proxy variables; the destination is gone.
  2. High: a scenario ran twice and scripts changed between runs. Every scenario ran once with the final scripts through `make`, with script hashes in each run's metadata; series 1 is superseded.
  3. High: isolation was overstated and the owner's configuration was read and written. Runs now use an allowlisted environment and a dedicated device-login configuration directory. The record states the actual credential path and the conflict with per-workspace credential scoping.
  4. High: host-level logging could not separate telemetry from inference. The proxy now terminates TLS and logs method and path; the record lists telemetry and configuration requests per configuration and states that bodies were not inspected.
  5. Medium: correlation was checked for some messages only. The probe counts every assistant message; 2/2 were correlated.
  6. Medium: the late side effect was checked too early. The probe now checks at 78 s and records it.
  7. Medium: the exit-code cause was asserted. Now stated as not isolated.
  8. Medium: sampler blind spots were unrecorded. The sampler now covers every TCP and UDP socket of the process tree every 250 ms, and the record lists the remaining blind spots.
  9. Medium: the crash kill was manual. The orchestrator now waits for the pending request, records timestamps, and kills both PIDs.
  10. Low: the working directory was shared. Each run now has a fresh one.
  11. Low: the manifest egress list was presented as a consequence. Now marked as a proposal.
  12. Low: "stable" was attributed to the SDK. Corrected: the dist-tag belongs to the CLI package.
  13. Low: the credentials row described planned behavior. Now states what was used.
  14. Low: the denial of the re-issued request was omitted. Now stated, together with the observation that the re-planned action varies between runs.
  15. Low: spec scenarios named no checkable artifact. They now reference the qualification record, the run proxy log, and the boundary checks.

- **Pass 2 — session `1940b142-c3ac-4fbc-a373-b8152ca44ce5`.** A first attempt did not start because the `claude` command was missing from the PATH (the removed symlink); no review ran. The reviewer confirmed the pass-1 resolutions except two partial ones. Findings: 0 Critical, 0 High, 3 Medium, 14 Low. All accepted and resolved in the documents, without new runs:
  1. Medium: blind spots omitted detached processes and proxy-ignoring processes. Added, and the side-effect and egress claims are qualified as visible to the proxy and sampler only.
  2. Medium: a superseded-series observation supported a conclusion. It is now labeled as supporting no result, and "varies" became "may vary".
  3. Medium: credential storage and the login step's egress were unstated. The Keychain entries (directory-specific entry separate from the owner's; both logins still work) are recorded, and the `/login` egress is stated as unmeasured.
  4–17. Low: pending timestamps split into written and observed; SDK-injected variables added; platforms row retitled; UTC and local offset stated; the updater cause marked as inferred; the design's isolation and risks updated; an "input requests: not tested" row added; the upgrade scenario tied to the record's version row and the future manifest; the loopback-filter blind spot added; the foundation ledger's PR wording corrected; register limits extended with the credential decision and `DISABLE_AUTOUPDATER`; the assessment's pin wording corrected; the interrupt evidence stated as inferred; and a harness-neutral self-update rule added to the port consequences.

- **Pass 3 (final under the three-pass cap) — session `fa3cdac9-0a5e-4230-8887-fcba64b6faab`.** All pass-2 resolutions confirmed; no pass-1 regression. Findings: 0 Critical, 0 High, 2 Medium, 6 Low. Open, pending the owner's decision on their disposition:
  1. Medium: new sessions send one extra `POST /v1/messages` that disappears under `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (3 versus 2); the record does not classify it.
  2. Medium: the spec requires a named run for every section-7 capability, but non-permission input requests are `not tested`.
  3. Low: the first `make all` failed in its summary step; `summarize.mjs` was fixed afterwards and is outside the hashed set.
  4. Low: the detached-or-proxy-ignoring blind spot is imprecise.
  5. Low: "only the harness process had sockets" lacks the sampling qualifier.
  6. Low: the interrupt and max-turns runs auto-approved tools, which is not stated.
  7. Low: no raw message stream was retained.
  8. Low: the design overstates the architecture's preference for the stable dist-tag.
  The owner chose to fix all eight without another review pass. Resolved by the author: the extra request is classified as unidentified non-essential traffic and the body blind spot extended; the spec now allows an explicit `not tested` result with a reason, listed before admission; the summary failure, the blind-spot wording, the sampling qualifier, the auto-approving callbacks, the missing raw stream, and the design wording are corrected. **These fixes have not been independently reviewed.**

## Remaining gates

Integration (commit, push, merge) and archival with owner authorization. Before admission: Linux x64 and arm64 in the worker container image, macOS arm64, the owner decision on device-level versus per-workspace credentials, the interrupted-turn re-run, repeated runs, and independent adoption evidence.

## Integration and archival

The owner authorized integration and archival on 2026-10-24. Integrated into `main` at `ff01226` through pull request #6 (rebase merge). The `main` workflow run 40097199008 passed verification; semantic-release found no relevant changes, so no version was released. Archived with the pinned OpenSpec CLI afterwards.
