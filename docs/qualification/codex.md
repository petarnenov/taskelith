# Codex harness qualification

Date: 2026-10-24. Status: macOS x86_64 evidence for the second harness (G4) selected in [ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md). Codex stays `candidate` in the [dependency register](../dependencies.md). Linux, macOS arm64, provider terms, repeated runs, and independent adoption evidence remain open. No plugin code exists yet.

Sources: a link labeled "docs" is an unversioned page retrieved on 2026-10-24. Every other external source is pinned to an exact package version or tag. Times are UTC unless marked local (UTC+03:00).

## Pinned version

| Item | Value |
| --- | --- |
| Package | `@openai/codex@0.164.0`, the npm `latest` dist-tag, published 2026-10-23 ([npm](https://www.npmjs.com/package/@openai/codex/v/0.164.0)) |
| Harness binary | The platform package `@openai/codex@0.164.0-darwin-x64`, installed under the npm alias `@openai/codex-darwin-x64`, reports `codex-cli 0.164.0`; SHA-256 `d7e19691e0c1945612475ee8ab32e59ead55472e976b5cea1682d827d34dbba1` |
| Interface | `codex app-server`: JSON-RPC over stdio, one JSON message per line. The protocol schema was generated from the pinned binary (`codex app-server generate-json-schema`) |
| Platforms in scope | Native packages for Linux x64/arm64 and macOS x64/arm64; Windows packages also exist but are out of scope |
| Maintenance | Frequent releases and alpha prereleases on npm. The vendor calls app-server experimental: "The app-server command and WebSocket transport are experimental and aren't supported for production workloads" ([docs](https://learn.chatgpt.com/docs/app-server); the earlier address `developers.openai.com/codex/app-server` redirects there) |

## Terms and provider dependency

These are the records ADR 0003 decision 2 requires before admission. License evidence follows decision 9.

| Item | Record |
| --- | --- |
| License | Apache-2.0 ([LICENSE](https://github.com/openai/codex/blob/rust-v0.164.0/LICENSE)) |
| Data-handling terms | Not yet recorded. OpenAI's terms, privacy, and data-controls pages returned HTTP 403 to an automated client on 2026-10-24, so their content was not reviewed. This is a gate before admission |
| Provider dependency | This qualification used the owner's ChatGPT subscription; inference ran over a WebSocket to `chatgpt.com/backend-api/codex/responses`. Other providers were not tested |
| Credentials used | The owner signed in once with ChatGPT using the pinned binary and a dedicated `CODEX_HOME`, configured with `cli_auth_credentials_store = "file"`. The credential is the file `auth.json` (mode 600) in that directory; no Codex Keychain entry exists. The probe passed no credential and logged none |
| Credential scope | Per [ADR 0005](../decisions/0005-harness-subscription-account-pools.md), a subscription slot is injected per run. A file-based `CODEX_HOME` per slot fits that model; whether an agent's own commands can read it was not tested |
| Security reporting | Bugcrowd ([SECURITY.md](https://github.com/openai/codex/blob/rust-v0.164.0/SECURITY.md)) |

## Method

Environment: macOS 26.6.2 (build 25G83) on x86_64, Node.js 24.22.1. The npm package was installed with lifecycle scripts disabled into a scratch directory outside the repository. Every scenario ran once, in series `c2`, through `make all`; each run's metadata records the script hashes, binary hash and version, the allowlisted environment, and timestamps. An earlier series, `c1`, is superseded: its proxy could not relay WebSocket upgrades, so the harness retried for about 113 s per run before falling back to HTTP, and its interrupt scenario stopped a turn whose model had not yet answered. None of its results are used, except the host side effect described below, which it also showed.

Isolation of each run:

- The harness received only an allowlisted environment: `PATH`, a per-run `HOME`, `USER`, a per-run `TMPDIR`, the dedicated `CODEX_HOME`, the proxy variables, and `CODEX_CA_CERTIFICATE` for the proxy's CA. The probe process itself received no proxy variables.
- `CODEX_HOME/config.toml` set `cli_auth_credentials_store = "file"` and `check_for_update_on_startup = false`.
- Threads used sandbox `workspace-write`, approval policy `never` (or `untrusted` for approval scenarios), reasoning effort `low`, and a fresh working directory per run.
- Host check: before and after the series, SHA-256 listings of files, and listings of symlinks and directories with targets and modification times, were taken of the owner's own `~/.codex` and `~/.local/bin`, together with the list of the owner's running Codex processes.

Egress measurement: a TLS-terminating proxy, trusted through `CODEX_CA_CERTIFICATE`, logged the method, host, and path (query strings removed) of every request and relayed WebSocket upgrades unchanged, logging the upgrade request. The summary script, which only reads the logs, is outside the hashed set. A sampler listed every TCP and UDP socket of the probe process tree every 250 ms. Blind spots:

- connections shorter than the sampling interval;
- DNS lookups made by the system resolver;
- processes that detach from the probe's process tree;
- loopback connections other than to the proxy, which the summary filters;
- request bodies and WebSocket frames, so traffic on the inference connection cannot be separated by purpose;
- the raw JSON-RPC stream, which was not retained (results are fields computed by the probe);
- the interactive login step, which ran outside the proxy and sampler;
- for the host check, writes made and reverted between the before and after listings, and host paths other than the two compared directories (for example `~/Library` or the Keychain), although the harness can resolve the account's home directory without `$HOME`. The per-run `HOME` and `TMPDIR` directories were empty after every run.

## Network egress

Requests per run of the same two-turn conversation:

| Configuration | Telemetry requests | Other requests | Sockets bypassing the proxy |
| --- | --- | --- | --- |
| Defaults | `POST chatgpt.com/backend-api/codex/analytics-events/events` (2) | WebSocket upgrade `GET .../codex/responses` (1); `GET .../codex/models` (2); plugin catalog `GET .../ps/plugins/list` (12), `.../ps/plugins/installed` (2), `.../ps/plugins/suggested/codex`, `.../plugins/featured`; `POST .../ps/mcp` (3); `GET .../wham/accounts/check`, `.../wham/settings/user` | none |
| `-c analytics.enabled=false` | none | the same requests, with `GET .../codex/models` (1) and `plugins/list` (11) | none |

Results:

- Analytics are on by default and `analytics.enabled=false` removes them, which meets ADR 0003 decision 4. Requests are classified by path name; bodies were not inspected. The earlier assessment inferred the default from the configuration wording; these runs observed it.
- With analytics off, model-list, plugin-catalog, MCP, and account requests to the vendor remain. They are non-telemetry vendor traffic, acceptable until G8 under decision 10. The plugin catalog is polled while a turn is active: 12 requests inside the 8 s turn of the interrupt run, plus one at startup and one after the turn. Idle behaviour was not observed, because every run stopped the app-server after its last turn. Whether the plugin and MCP traffic can be disabled by configuration was not tested.
- Every capability run used `analytics.enabled=false` and made no analytics request.

## Native capabilities

| Capability | Result | Evidence (run in series `c2`) |
| --- | --- | --- |
| Multi-turn chat | `verified` | `egress-default`, `egress-off`: two `turn/start` requests on one thread; the second answer recalled the code word from the first. |
| Prompt correlation | `verified` | The turn ID returned by `turn/start` equals the ID in the matching `turn/completed` notification, and the two turns had distinct IDs. A client-supplied `clientUserMessageId` was accepted; whether it is echoed was not checked. |
| Resume after harness restart | `verified` | `resume-create`, `resume-continue`: a new app-server process resumed the thread with `thread/resume` and recalled the code word. |
| Permission request answered by an external client | `verified` | `approval-deny`, `approval-allow`: with approval policy `untrusted`, the server sent `item/commandExecution/requestApproval` with its item and turn IDs. `decline`: the command did not run and the turn completed. `accept`: the command ran. |
| Interruption | `verified` (turn level) | `interrupt`: the command started at 5.9 s; `turn/interrupt` at 8.9 s ended the turn with status `interrupted` within 5 ms. A check at 78.9 s found that the file write after the `sleep 60` never happened, but the probe stopped the app-server right after the interrupted turn, so whether `turn/interrupt` alone cancels a running command is not isolated. |
| Exit and terminal outcome | `verified` | Turn statuses `completed`, `interrupted`, and `failed` (with an error, for a nonexistent model in `failed-turn`) were observed. |
| Input requests other than permissions | not tested | No scenario asked for non-permission user input. |

### Pending approval across a crash

In `crash-pending`, the probe recorded the pending command approval at 15:18:22.748; the orchestrator observed it at 15:18:22.867 and killed the three processes of the probe tree with SIGKILL at 15:18:24.996. In `crash-resume`, a new process resumed the thread, started a turn with "Continue.", and declined any request:

- After `thread/resume`, the original turn was reported with status `interrupted`.
- The original approval (its item ID) was not re-delivered. The new turn sent a different approval request, which only checked whether the file existed, and the probe declined it.
- The side effect of the original request never ran.

So pending native approvals are not durable across a crash, as with Claude Code. The plugin must reconcile the journaled request as unresolved and never send its stored answer to a new request ([architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals)).

## Host side effects

Each series compared the owner's `~/.codex` and `~/.local/bin`; `~/.local/bin` was unchanged both times.

Proven, from the probe's harness:

- In both series, the app-server started right after a SIGKILL (`crash-resume`) created a temporary directory under the owner's `~/.codex/tmp/arg0-macos` holding an empty `.lock` and `apply_patch` and `applypatch` symlinks to the pinned binary: `codex-arg0EXlry4` during `c1-crash-resume`, which started at 18:01:44 local (`c1` kept no modification times), and `codex-arg0HvXahB` at 18:18:26 local in `c2`. The `c2` evidence includes the symlink targets.
- In `c2` the harness's `HOME` was a per-run directory, so the fallback does not use `$HOME`; it resolves the account's home directory another way.
- A controlled run after the series, without a preceding crash (an `initialize` and an ephemeral `thread/start`), put its temporary directory under `CODEX_HOME/tmp` and left the owner's directory unchanged; its outputs and before/during/after listings are kept in the scratch directory (`ctrl/`, `arg0-*.txt`), not in a run directory. The nine non-crash `c2` runs also created nothing under `~/.codex/tmp`. The cause of the fallback after a crash was not isolated.
- In `c1`, an older entry in that directory, `codex-arg0m1vHyP`, was no longer present after the series; `c1` kept no modification times, so when it disappeared is not known.
- No process held either new directory (`lsof`); the author removed them after the comparison, the `c2` one at 15:19:48.

Attributed, not proven: `~/.codex/logs_2.sqlite-wal`, `logs_2.sqlite-shm`, and `models_cache.json` also changed. In `c2`, `models_cache.json` and the WAL file changed at 18:17:14–17 local (the SHM file's content changed while its modification time stayed at 00:38:07 local, as memory-mapped writes do), about 9 s after the probe sent SIGTERM to its app-server; the last request through the proxy from that app-server was at 15:17:05.974 (18:17:05 local), and its exit was not observed; nine of the owner's own Codex processes (app-server daemons and review sessions) were running throughout. These changes are attributed to them.

Consequence: a worker must not rely on `CODEX_HOME` or `HOME` alone to confine the harness. Each run needs its own account home, which the worker container provides, and the worker must clean up after a crashed run.

## Consequences for the agent port

The findings agree with the Claude Code qualification, so the harness-neutral port terms hold for both:

- Correlation: the port's turn ID maps to Codex's turn ID.
- Approvals: native requests carry a request or item ID and receive one response; unresolved requests are reconciled after a restart, never replayed.
- Outcomes: the port's terminal outcomes map from turn statuses `completed`, `interrupted`, and `failed`.
- Isolation: each run gets its own harness home and temporary directory, created and removed by the worker, inside a container on Linux.

## Remaining before admission

- OpenAI's data-handling terms, and whether its terms allow pooled subscriptions for automated use (ADR 0005), reviewed before admission in G3 ([ADR 0007](../decisions/0007-g0-closure.md)).
- Linux x64 and arm64 in the planned worker container image (G2, [ADR 0007](../decisions/0007-g0-closure.md)), and macOS arm64.
- Non-permission input requests, and repeated runs.
- The cause of the temporary-directory fallback after a crash.
- Whether plugin-catalog polling and MCP traffic can be disabled.
- The subscription slot mechanism, its load, limit, and reset signals (including whether Codex reports usage and reset times at all), and the credential-exposure tests required by ADR 0005.
- Independent adoption evidence for the pinned version, and the vendor's experimental status of app-server.
