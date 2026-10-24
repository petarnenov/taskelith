# Claude Code harness qualification

Date: 2026-10-24. Status: macOS x86_64 evidence for the first harness (G3) selected in [ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md). Claude Code stays `candidate` in the [dependency register](../dependencies.md). Linux, macOS arm64, provider alternatives, repeated runs, and independent adoption evidence remain open. No plugin code exists yet.

Sources: a link labeled "docs" is an unversioned page retrieved on 2026-10-24. Every other external source is pinned to an exact package version or tag.

## Pinned version

| Item | Value |
| --- | --- |
| Package | `@anthropic-ai/claude-agent-sdk@0.3.308`. The SDK has only `latest` (0.3.310) and `next` dist-tags; 0.3.308 matches the CLI package's `stable` dist-tag (2.1.308) |
| Harness binary | The SDK's bundled `@anthropic-ai/claude-agent-sdk-darwin-x64@0.3.308` reports `2.1.308 (Claude Code)`; SHA-256 `9a0bc140f5fb06e6366624d770371ef290e6731d1e84c4def5daf4df946d1b59` |
| Published | 2026-10-22. The SDK has had 147 releases on the 0.3 line since 2026-05-14, and the CLI 27 releases in the last 30 days, so the plugin must pin an exact version and re-qualify on upgrade |
| Platforms in scope | Native packages for Linux x64/arm64 (glibc and musl) and macOS x64/arm64; Windows packages also exist but are out of scope ([npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk/v/0.3.308)) |

## Terms and provider dependency

These are the records ADR 0003 decision 2 requires before a closed harness is admitted. License evidence follows decision 9.

| Item | Record |
| --- | --- |
| License | Proprietary: "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements" ([LICENSE.md](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.308/LICENSE.md)); legal agreements and data-handling terms ([docs](https://code.claude.com/docs/en/legal-and-compliance)) |
| Provider dependency | Anthropic API by default. Amazon Bedrock, Google Vertex AI, Microsoft Foundry, or a gateway through `ANTHROPIC_BASE_URL` are alternatives ([docs](https://code.claude.com/docs/en/third-party-integrations)); none was tested |
| Credentials used | The owner's claude.ai subscription through device authentication: the owner ran `/login` once with the pinned binary and a dedicated configuration directory (`CLAUDE_CONFIG_DIR`). On macOS the login is stored in the Keychain under a service name derived from that directory (`Claude Code-credentials-9b2abb1f`), separate from the owner's own entry (`Claude Code-credentials`); afterwards both logins reported `loggedIn: true`. The probe passed no credential and logged none. Whether a Bash command run by the agent can read the Keychain entry was not tested |
| Credential scope | Device authentication binds the login to a worker host's configuration directory, not to a workspace. The [trust model](../trust-model.md) requires provider credentials scoped per workspace or project, so this is an open owner decision before G3. The owner has since chosen pools of subscription accounts per harness, to be recorded in ADR 0005 |
| Security reporting | HackerOne ([SECURITY.md](https://github.com/anthropics/claude-code/blob/v2.1.308/SECURITY.md)) |
| Maintenance | Frequent releases (see above). No vendor stability statement for the SDK was found |

## Method

Environment: macOS 26.6.2 (build 25G83) on x86_64, Node.js 24.22.1. Times are UTC unless marked local (UTC+03:00). The SDK was installed with lifecycle scripts disabled into a scratch directory outside the repository. Every scenario ran once, in the series named `s2`, through `make all` from scripts whose SHA-256 hashes are written into each run's metadata. The final summary step of that `make all` failed on a state file in the runs directory; the summary script, which only reads the logs and is outside the hashed set, was fixed and re-run. An earlier series was superseded because its runner, sampler, and isolation were flawed; none of its results are used.

Isolation of each run:

- The harness received only an allowlisted environment: `PATH`, `HOME`, `USER`, a per-run `TMPDIR`, the dedicated `CLAUDE_CONFIG_DIR`, the proxy variables, the proxy's CA certificate, and the telemetry flags under test, plus the variables the SDK itself adds (`CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_AGENT_SDK_VERSION`). `DISABLE_AUTOUPDATER` was not set; see [Host side effects](#host-side-effects).
- SDK options: `settingSources: []`, `strictMcpConfig: true`, no MCP servers, only the `Bash` tool, permission mode `default`, model `claude-haiku-5-5`.
- Each run used a fresh, empty working directory.
- The probe process itself received no proxy variables, so only harness traffic passed the proxy.

Egress measurement:

- A TLS-terminating proxy, trusted by the harness through `NODE_EXTRA_CA_CERTS`, logged the method, host, and path of every request, without query strings or bodies.
- A sampler listed every TCP and UDP socket of the probe process tree every 250 ms to detect traffic that bypassed the proxy.
- Blind spots: connections shorter than the sampling interval, including those of a process that ignores the proxy; DNS lookups made by the system resolver; processes that detach from the probe's process tree; loopback connections other than to the proxy, which the summary filters (the raw socket logs show only proxy connections); request bodies, so traffic on the inference path cannot be separated by purpose; the raw harness message stream, which was not retained (correlation and session results are counters computed by the probe); and the interactive `/login` step, which ran outside the proxy and sampler.

## Network egress

Requests per run of the same two-turn conversation:

| Configuration | Telemetry requests | Other requests | Sockets bypassing the proxy (visible to the sampler) |
| --- | --- | --- | --- |
| Defaults | `POST api.anthropic.com/api/event_logging/v2/batch` (2), `POST api.anthropic.com/api/eval/sdk-…` (1), `POST http-intake.logs.us5.datadoghq.com/api/v2/logs` (1) | `GET` `/api/claude_cli/bootstrap`, `/api/claude_code_grove`, `/api/claude_code_penguin_mode`, `/api/oauth/account/settings`, `/v1/mcp_servers`; `POST /v1/messages` (3) | none |
| `DISABLE_TELEMETRY=1` | none | the same five `GET` requests; `POST /v1/messages` (3) | none |
| `DISABLE_TELEMETRY=1` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | none | `GET /v1/mcp_servers`; `POST /v1/messages` (2) | none |

Results:

- Telemetry is on by default and goes to Anthropic's event-logging endpoint, an evaluation endpoint, and Datadog. `DISABLE_TELEMETRY=1` removes all three, which meets ADR 0003 decision 4. These paths are classified by name; request bodies were not inspected.
- With telemetry off, five configuration requests to the vendor remain. They are non-telemetry vendor traffic, acceptable until G8 under decision 10. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` reduces them to the MCP server listing.
- The same flag also removes one `POST /v1/messages` per new session (3 versus 2 for the same conversation; new sessions start with two near-simultaneous requests, resumed sessions do not). That request is non-essential traffic of unidentified purpose on the inference path; path-level logging cannot separate it from inference.
- `GET /v1/mcp_servers` appears even with `strictMcpConfig`; no MCP server was loaded.
- Every capability run below used `DISABLE_TELEMETRY=1` and made no telemetry request.

## Native capabilities

| Capability | Result | Evidence (run in series `s2`) |
| --- | --- | --- |
| Multi-turn chat | `verified` | `egress-off`: two user messages in one streaming session under one `session_id`; the second answer recalled the code word from the first. |
| Prompt correlation | `verified` | `egress-off`: both assistant messages carried a `user_message_uuid` equal to the client-supplied `uuid` of a user message the probe had sent. |
| Resume after harness restart | `verified` | `resume-create`, `resume-continue`: a new process resumed the session by ID and recalled the code word under the same `session_id`. |
| Permission request answered by an external client | `verified` | `approval-deny`, `approval-allow`: the `canUseTool` callback received the `Bash` request with its `toolUseID`. Deny: the command did not run, and the turn ended with `success`. Allow: the command ran. |
| Interruption | `verified` | `interrupt`: the prompt asked for a 60 s `sleep` followed by a file write, and the probe approved every tool request without recording it. `interrupt()` at 8 s ended the turn at 8.0 s with `error_during_execution`; that the `sleep` was running at that moment is inferred, because the probe did not log the tool request. A check at 78 s found that the command after the `sleep` never ran. The harness process exited with code 1 after the interrupted result; the cause was not isolated. |
| Input requests other than permissions | not tested | No scenario asked the harness for non-permission user input. |
| Exit and terminal outcome | `verified` | `success`, `error_during_execution`, and `error_max_turns` (`max-turns`) results were observed; the `max-turns` run also approved every tool request without recording it. The SDK also throws an exception after an error result, so the plugin must map both to one terminal outcome. |

### Pending approval across a crash

In `crash-pending`, the probe wrote the pending `Bash` request at 12:45:13.999, the orchestrator observed it at 12:45:14.226, and killed both the probe and the harness with SIGKILL at 12:45:16.278. In `crash-resume`, a new process resumed the session with the prompt "Continue.", and the probe denied any new request:

- The original request (its `toolUseID`) was not re-delivered.
- The harness issued a new request with a new `toolUseID`; in this run it checked whether the file existed. (An observation from the superseded series, which supports no result here, showed the same side effect re-planned, so the re-planned action may vary.) Any new request would run if a host approved it.
- The side effect of the original request never ran.

So pending native approvals are not durable across a crash. This matches the rule in [architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals): the plugin must reconcile the journaled request as unresolved, must never send its stored answer to a new request, and must present any new request for a fresh decision. The SDK types also document an automatic re-run of an interrupted turn controlled by `CLAUDE_CODE_RESUME_INTERRUPTED_TURN`; that was not tested.

## Host side effects

Timestamps and lock files indicate that the harness's auto-updater acted on the host-wide installation even though every run used a dedicated `CLAUDE_CONFIG_DIR`. The cause is inferred, not observed:

- During the interactive `/login` with the pinned 2.1.308 binary (15:42:34 local), the owner's `~/.local/bin/claude` symlink to the newer 2.1.310 installation disappeared. The dedicated configuration directory gained an `.update.lock` at the same minute. The symlink was restored afterwards.
- During series `s2` (15:43:57 local, within `s2-interrupt`), `~/.local/share/claude/versions` was modified while the dedicated directory recorded a `.last-cleanup`. Whether an older installed version was removed could not be determined.
- The `s2` runs did not set `DISABLE_AUTOUPDATER`. No update download appeared in their proxy logs or sampled sockets, but an updater that detaches from the process tree or ignores the proxy would be invisible to both. The egress of the `/login` step was not measured.

Consequence: a worker must disable the auto-updater (`DISABLE_AUTOUPDATER=1`) and must not share a home-level installation with other harness versions. Running each harness in the worker container image keeps such writes inside the container. Later qualification runs must set `DISABLE_AUTOUPDATER=1`.

## Consequences for the agent port

These findings constrain the port contract, not the kernel. Per ADR 0003 decision 8, nothing harness-specific enters kernel or module code, types, or tests.

- Correlation: the port carries a host-generated turn ID; a plugin maps it to its native correlation field.
- Approvals: the port models native permission requests with a native request ID and a single response. After a restart, unresolved requests are reconciled, never replayed.
- Outcomes: the port defines terminal outcomes; a plugin maps native result subtypes and transport failures onto them.
- Self-update: a worker pins each harness binary, disables self-update, and checks that a harness run writes nothing outside its declared directories.
- Codex must pass the same conformance scenarios before the port is frozen (ADR 0003 consequences).

Proposal for the port design, not yet decided: each plugin manifest declares its telemetry switch and expected outbound destinations, so the egress test can be generated from the manifest.

## Remaining before admission

- Linux x64 and arm64 in the planned worker container image, and macOS arm64, with `DISABLE_AUTOUPDATER=1` and a check that nothing outside the configuration directory changes.
- Non-permission input requests, which no scenario tested.
- The credential model for subscription account pools, to be decided in ADR 0005, including whether an agent can read an injected credential.
- An alternative provider or gateway path, if the owner wants one.
- The automatic interrupted-turn re-run, and repeated runs to check stability.
- Independent adoption evidence for the pinned version.
- A versioned conformance suite in the repository, run through `make`, once the agent port exists (G1).
