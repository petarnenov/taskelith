# Codex harness qualification

Date: 2026-10-24. Status: macOS x86_64 evidence for the second harness (G4) selected in [ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md). Codex stays `candidate` in the [dependency register](../dependencies.md). Linux x86_64 evidence without credentials in the worker image was added on 2026-10-25 ([Linux worker image](#linux-worker-image)); Linux capability scenarios, Linux arm64, macOS arm64, provider terms, repeated runs, and independent adoption evidence remain open. No plugin code exists yet.

Sources: outside the [Provider terms review](#provider-terms-review), a link labeled "docs" is an unversioned page retrieved on 2026-10-24, and every other external source is pinned to an exact package version or tag. The terms review cites dated Wayback Machine snapshots and unversioned pages accessed on 2026-10-25; its source table gives each snapshot and each stated effective or updated date. Times are UTC unless marked local (UTC+03:00).

## Pinned version

| Item | Value |
| --- | --- |
| Package | `@openai/codex@0.164.0`, the npm `latest` dist-tag, published 2026-10-23 ([npm](https://www.npmjs.com/package/@openai/codex/v/0.164.0)) |
| Harness binary | The platform package `@openai/codex@0.164.0-darwin-x64`, installed under the npm alias `@openai/codex-darwin-x64`, reports `codex-cli 0.164.0`; SHA-256 `d7e19691e0c1945612475ee8ab32e59ead55472e976b5cea1682d827d34dbba1` |
| Linux binary | `@openai/codex@0.164.0-linux-x64`, under the alias `@openai/codex-linux-x64`, reports `codex-cli 0.164.0`; SHA-256 `b93f6811d3f653f0fb83be4050d857fb9abbb111dfa2ce160563327daff7f306` ([Linux worker image](#linux-worker-image)) |
| Lockfile integrity | Worker image variant, `infra/installation/harnesses/package-lock.json`, as name, locked version, and integrity: `@openai/codex@0.164.0` `sha512-TWj7UGyPRe3Pj/A3ddNAxs1te3a/W/xAd+J0LHrrFTmsSfahGMOLF/vn88D3QCIgAT3B1rm1y/Z3NYE0rx6cZQ==`; `@openai/codex-linux-x64@0.164.0-linux-x64` `sha512-XLAoaWsGOT2khzl+P4FYDPTkzAr9W0VFXFaVkqlFdkM0soa1gH/4S0wSD57Ek3HHwkirAEGz2/Mwehseh+l5Mg==`; `@openai/codex-linux-arm64@0.164.0-linux-arm64` `sha512-LL5iTQjyDL4YRX44EWqhIfEQ5uGnmgxkQBJSxjZSeJ8L1Og83pdlzUJW/PRJ76oaVwOVgh6HXwuPEiBNEHU4lg==`; `@openai/codex-darwin-x64@0.164.0-darwin-x64` `sha512-lIe+udnguPGzBezkgbkj2Eaz0YqOhNXT7jja136Fj0sXfI+UKNS2icmaK14GcoRAgeVEpDTtC1ftamWBPmD1zg==`. The darwin-x64 entry ties the lock to the macOS binary above |
| Interface | `codex app-server`: JSON-RPC over stdio, one JSON message per line. The protocol schema was generated from the pinned binary (`codex app-server generate-json-schema`) |
| Platforms in scope | Native packages for Linux x64/arm64 and macOS x64/arm64; Windows packages also exist but are out of scope |
| Maintenance | Frequent releases and alpha prereleases on npm. The vendor calls app-server experimental: "The app-server command and WebSocket transport are experimental and aren't supported for production workloads" ([docs](https://learn.chatgpt.com/docs/app-server); the earlier address `developers.openai.com/codex/app-server` redirects there) |

## Terms and provider dependency

These are the records ADR 0003 decision 2 requires before admission. License evidence follows decision 9.

| Item | Record |
| --- | --- |
| License | Apache-2.0 ([LICENSE](https://github.com/openai/codex/blob/rust-v0.164.0/LICENSE)) |
| Data-handling terms | Recorded on 2026-10-25 in [Provider terms review](#provider-terms-review); the owner decided D15 on 2026-10-25: (a), accept the remaining risk ([G3 plan](../g3-plan.md#owner-decisions)). OpenAI's terms, privacy, and help pages returned HTTP 403 to an automated client on 2026-10-24 and again on 2026-10-25, so the review used Wayback Machine snapshots of them |
| Provider dependency | This qualification used the owner's ChatGPT subscription; inference ran over a WebSocket to `chatgpt.com/backend-api/codex/responses`. Other providers were not tested |
| Credentials used | The owner signed in once with ChatGPT using the pinned binary and a dedicated `CODEX_HOME`, configured with `cli_auth_credentials_store = "file"`. The credential is the file `auth.json` (mode 600) in that directory; no Codex Keychain entry exists. The probe passed no credential and logged none |
| Credential scope | Per [ADR 0005](../decisions/0005-harness-subscription-account-pools.md), a subscription slot is injected per run. A file-based `CODEX_HOME` per slot fits that model; whether an agent's own commands can read it was not tested |
| Security reporting | Bugcrowd ([SECURITY.md](https://github.com/openai/codex/blob/rust-v0.164.0/SECURITY.md)) |

## Provider terms review

On 2026-10-25, for G3 item 2 (`review-g3-provider-terms`), this section records what OpenAI's terms and documentation say about Taskelith's use and where the text is ambiguous; it is not legal advice, and the decision on the remaining risk is the owner's decision D15 in the [G3 plan](../g3-plan.md).

The use under review is the [ADR 0005](../decisions/0005-harness-subscription-account-pools.md) pool: unattended workers run the pinned `codex app-server`, signed in only with ChatGPT subscriptions (`auth.json` per `CODEX_HOME`) held as slots that may belong to different people, selected least-loaded with cooldown, serving several projects, with credentials stored by the control plane and injected per run.

The live `openai.com` and `help.openai.com` pages returned HTTP 403 again on 2026-10-25, so they were read from the Wayback Machine snapshots linked below; a change after a snapshot's date would not be visible. The latest snapshot of the Terms of Use (20261023195311) was itself a stored 403, so the latest 200 snapshot was used. The Codex and SIWC developer pages were fetched live.

| Document | Version or effective date | URL (accessed 2026-10-25) |
| --- | --- | --- |
| Terms of Use | "Effective: January 1, 2026" | [Wayback 20261023001957](https://web.archive.org/web/20261023001957/https://openai.com/policies/terms-of-use/) |
| Europe Terms of Use (EEA, Switzerland, UK) | "Updated: January 16, 2026" | [Wayback 20261012125824](https://web.archive.org/web/20261012125824/https://openai.com/policies/eu-terms-of-use/) |
| Service Terms | "Updated: October 16, 2026" | [Wayback 20261021154355](https://web.archive.org/web/20261021154355/https://openai.com/policies/service-terms/) |
| Services Agreement (business) | "Effective: January 1, 2026" | [Wayback 20261023110309](https://web.archive.org/web/20261023110309/https://openai.com/policies/services-agreement/) |
| Sign in with ChatGPT (SIWC) Terms | September 29, 2026 | [Wayback 20261007132710](https://web.archive.org/web/20261007132710/https://openai.com/policies/sign-in-with-chatgpt-terms/) |
| Usage Policies | "Effective: November 20, 2026", later than the access date; the page's changelog says that version adds "approval requirements for ... model-access intermediaries" | [Wayback 20261022075611](https://web.archive.org/web/20261022075611/https://openai.com/policies/usage-policies/) |
| Usage Policies, previous version | "Effective: October 29, 2025" | [Wayback 20260920174943](https://web.archive.org/web/20260920174943/https://openai.com/policies/usage-policies/) |
| Help: Using Codex with your ChatGPT plan; How your data is used to improve model performance | About 2026-10-19 (relative dates on the snapshots) | [Wayback 20261020143905](https://web.archive.org/web/20261020143905/https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan), [Wayback 20261019170943](https://web.archive.org/web/20261019170943/https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance) |
| Codex docs: [Authentication](https://developers.openai.com/codex/auth), [CI/CD auth](https://developers.openai.com/codex/auth/ci-cd-auth), [Access tokens](https://developers.openai.com/codex/enterprise/access-tokens), [App Server](https://learn.chatgpt.com/docs/app-server); SIWC developer docs ([overview](https://developers.openai.com/siwc), [Request a client ID](https://developers.openai.com/siwc/request-client-id)) | No date on the pages; the Codex pages redirect to `learn.chatgpt.com/docs` | as linked |
| SIWC developer docs, section "ChatGPT plan usage", for open-source apps: [Overview](https://developers.openai.com/siwc/token-sharing-open-source), [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) | No date on the pages | as linked |

### Automated use with a subscription

Terms of Use, "What you cannot do": "Automatically or programmatically extract data or Output" (Europe Terms: "Automatically or programmatically extracting data or Output"). Codex docs, CI/CD auth: "The right way to authenticate automation is with an API key", and "Do not use this workflow for public or open-source repositories". SIWC Terms, "2. ChatGPT plan usage": "Requests must be for the authenticated user and arise from their activity or expressly authorized automations or background processes. Obtain express consent before background use."

- The text says: the consumer Terms forbid automatic extraction of data or Output, not automated use as such; the Codex docs describe running Codex under a ChatGPT account on "trusted private automation", one `auth.json` per machine or serialized job stream, while naming API keys as the default for automation; where the SIWC Terms apply, background use needs the user's express consent.
- Ambiguous: whether receiving Codex output inside OpenAI's own client, when a program drives that client, counts as programmatic extraction of "Output"; whether the docs' guidance binds as terms; Taskelith and its target projects may be public repositories.

### Account sharing and pooled subscriptions (ADR 0005)

Terms of Use, "Registration": "You may not share your account credentials or make your account available to anyone else" (same wording in the Europe Terms); "What you cannot do" forbids to "Interfere with or disrupt our Services, including circumvent any rate limits or restrictions". SIWC Terms, "2. ChatGPT plan usage": "Another user's activity must not trigger requests to the authenticated user's account", and "Connected application only. Use the user's plan only for the application they connected. Do not provide general-purpose API access for other tools or unrelated requests." SIWC Terms, "4. Prohibited activities": "You must not enable or encourage:" "Creating multiple accounts, splitting usage, rotating accounts, or otherwise bypassing usage limits", "Pooling, transferring, reselling, gifting, or sharing ChatGPT plan usage or Authentication Tokens, except for token handling expressly permitted by these Terms", and "Using one user's subscription to fulfill another user's requests". Services Agreement, 3.1: "Customer will not share Account access credentials or individual login credentials between multiple users". SIWC open-source docs, "Accounts and sessions": "Your app needs to manage multiple account registrations so users can choose an existing ChatGPT account or add another"; for Plus users, "the five-hour usage limit is shared across all apps where they use their ChatGPT plan".

- The text says: every instrument forbids sharing credentials or making an account available to others; the rate-limit clause is an example of interfering with or disrupting the Services; the SIWC Terms bar the party that integrates SIWC in its application from enabling or encouraging rotating accounts, pooling plan usage, or serving another user's requests, and forbid requests triggered by another user's activity, which is the closest text to the slot pool; the open-source docs expect a user to choose among several of their own accounts.
- Ambiguous: the SIWC Terms govern SIWC in "an application you develop or maintain", and whether Taskelith, which runs OpenAI's own binary with its own login and registers no client, is such an application is not stated; outside SIWC, whether one person rotating their own subscriptions on a rate limit is circumvention of "any rate limits or restrictions" is not stated; and whether a user's choice among their own accounts, as the open-source docs describe it, extends to automatic least-loaded rotation is not stated.

### Credential storage and intermediation by a third-party product

Codex docs, App Server, "Auth endpoints": "If you've built a local or open-source application using Codex app-server authentication, you can continue using it, though we recommend migrating to Sign in with ChatGPT so users have greater control over and visibility into their usage", and "App-server authentication has never been permitted for commercial or hosted services. We launched Sign in with ChatGPT to support these use cases". SIWC Terms, "1. Application identity and security": "Any persistent storage of Authentication Tokens must be local and under the user's control, not in a remote or managed environment"; "2. ChatGPT plan usage": "Requests must originate from the user's local runtime or a remote runtime only that user controls." Codex docs, Authentication: "treat ~/.codex/auth.json like a password"; CI/CD auth: "Do not share the same file across concurrent jobs or multiple machines".

SIWC open-source docs, Overview: "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're interested in offering it in a paid or remotely hosted app, complete the interest form"; in that "dynamic-registration flow, each issued client_id is bound to the authenticated user", so an open-source app requests no client ID in advance. Accounts and sessions, "Credential security": "Keep access, refresh, and retained ID tokens in protected local or self-hosted runtime storage." Codex app-server: configure app-server to use "an OAuth access token authorized for the user's ChatGPT plan". Request a client ID: "Sign in with ChatGPT is currently offered to a select group of commercial partners. To join the waitlist, complete the Sign in with ChatGPT interest form."

- The text says: app-server's own ChatGPT login, which this qualification and Taskelith's design use, may continue in local or open-source applications but "has never been permitted for commercial or hosted services"; OpenAI launched SIWC for commercial or hosted uses and recommends that local or open-source applications also migrate to it; SIWC offers two routes: the open-source program for open-source and locally hosted apps, with dynamic registration, tokens in local or self-hosted storage, and a documented app-server configuration; and the interest form and partner waitlist for paid or remotely hosted apps. Codex credentials are to be kept like passwords and used by one machine or job stream at a time; where the SIWC Terms apply, stored tokens must stay local and under the user's control.
- Ambiguous: whether self-hosted Taskelith, open source and run by its operator, is a "local or open-source application" or a "commercial or hosted service", in particular when the operator's work is commercial; whether a self-hosted control plane that the subscriber operates is "under the user's control", "self-hosted runtime storage", or a "remote or managed environment", given that the SIWC Terms and the open-source docs word the storage rule differently; and whether the storage rule matters when the SIWC Terms do not apply.

### Which terms govern

Terms of Use: residents of the EEA, Switzerland, or the UK are under the Europe Terms; Business Terms "govern use of ChatGPT Enterprise, our APIs, and our other services for businesses and developers"; users must follow "any other documentation, guidelines, or policies we make available to you". Service Terms, section 15: "If you use SIWC in your services, the Sign in with ChatGPT Terms apply." Europe Terms scope: "personal, non-commercial use of our Services by consumers", with a "Business use of the Services addendum". Usage Policies (November 20, 2026 version), "Providing access to our models": "If you operate a model-access intermediary platform or other service that enables third parties to directly access OpenAI models, you must obtain our prior review and approval", which "does not apply solely because an application integrates OpenAI models to power its features or functionality".

- The text says: a Plus or Pro subscriber resident in Bulgaria is under the Europe Terms, the Service Terms, and the Usage Policies; Business and Enterprise seats are under the Services Agreement; from November 20, 2026, a service that lets third parties directly access OpenAI models needs OpenAI's prior approval; the October 29, 2025 version, the latest effective before the access date, has no clause on intermediaries, rate limits, multiple accounts, or providing access, and forbids "circumventing our safeguards".
- Ambiguous: whether the "documentation, guidelines, or policies" clause makes the Codex docs' automation guidance binding; whether the SIWC Terms reach Taskelith; and whether a Taskelith instance whose slots serve other people's projects "enables third parties to directly access OpenAI models" or only integrates them.

### Data use for training

Help, "Does OpenAI train on my Codex usage?", Pro and Plus: "Conversations may be used to improve models unless you turn off training in ChatGPT data controls." The same article, "Data controls": "Your ChatGPT training data controls apply to content processed through Codex". Help, "How your data is used to improve model performance": "Codex has a separate Include environments setting in Codex settings for allowing training on full environments." Services Agreement, 4.2: "OpenAI will not use Customer Content to develop or improve the Services, unless Customer explicitly agrees to such use."

- The text says: code sent through a Plus or Pro slot may be used for training unless that account's owner opts out, and Codex has a separate "Include environments" setting; Business and Enterprise content is not used by default.
- Ambiguous: whether "Include environments" applies to local app-server runs; in a pool mixing slots, the treatment of a project's code depends on the selected slot owner's settings, and no text addresses this.

### Consequences for D15

The most direct statement is on the App Server page: "App-server authentication has never been permitted for commercial or hosted services", while local or open-source applications "can continue using it", though OpenAI recommends that they migrate to SIWC, which it launched for commercial or hosted uses. The SIWC Terms require requests to "originate from the user's local runtime or a remote runtime only that user controls" and bar the party that integrates SIWC from enabling or encouraging "rotating accounts", "Pooling ... ChatGPT plan usage", and "Using one user's subscription to fulfill another user's requests". Against the ADR 0005 pool model: slots owned by different people appear to conflict with "make your account available to anyone else" and with these SIWC clauses; least-loaded rotation with cooldown across accounts closely matches the SIWC prohibition of "rotating accounts", and outside SIWC may be read as circumventing rate limits; a Taskelith instance whose slots serve other people's projects may be read as a "model-access intermediary platform", which needs OpenAI's prior approval from November 20, 2026; the control plane storing and injecting `auth.json` appears to conflict with the SIWC storage rule if those Terms apply, and with the CI/CD guidance against sharing one file across concurrent jobs if a slot serves concurrent sessions. ADR 0005 decision 5, as amended on 2026-10-25, keeps a session on the harness and slot that started it until its work is finished and the session and its agent are closed, so cooldown or load never moves a running session to another account; new sessions are still spread across slots by least-loaded selection. After a limit, ADR 0005 decision 4, as amended on 2026-10-25, continues the work in a new session on a different harness, or waits for the slot's cooldown, and never moves it to another account of the same harness.

The text treats two cases differently, and both stay ambiguous. (i) An operator who self-hosts the open-source Taskelith and uses one subscription of their own for their own work may be read as a "local or open-source application", or, through the open-source program, as an open-source or locally hosted app with tokens in "self-hosted runtime storage"; not stated is whether that instance is a "commercial or hosted service" when the operator's work is commercial or the workers run on a remote host, and whether a control plane is "local and under the user's control". (ii) Pools of subscriptions of different people, or rotation across accounts, find no supporting text and meet the SIWC prohibitions and the account-sharing clause directly; several subscriptions of one person are not addressed by the consumer Terms. OpenAI was not contacted; the texts offer two routes, the open-source program, which needs no client ID, for open-source and locally hosted apps, and the interest form and partner waitlist for paid or remotely hosted apps.

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

## Linux worker image

Run: `make qualify-harnesses OUT=<dir>` at revision `15f16a9`, finished at 2026-10-25T22:39:26Z on macOS 26.6.2 (x86_64) with Docker Desktop (engine 29.5.2). The script builds the `worker-harnesses` target of `infra/installation/Dockerfile` from a `git archive` of the tracked files on `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac` with Node.js 24.22.1. The linux/amd64 image ID was `sha256:a1ace3a1a355a3f478af8661c6bfaa9cab6adc6501670c20e76a0b6d70781b98`. The run's `image.txt` records the SHA-256 of the Dockerfile (`2abdb24b…`), the harness manifest (`2a3472f9…`) and lockfile (`5cec02e4…`), `qualify.sh` (`a4c5898d…`), and `scripts/harness-qualification.sh` (`65c937c7…`), and the steps record the environment. `npm ci --ignore-scripts` installed the harnesses from `infra/installation/harnesses/package-lock.json`, checking every tarball against its `sha512` integrity. The steps in `infra/installation/harnesses/qualify.sh` ran once, as the `taskelith` user, with `--network none`. They ran with `DISABLE_AUTOUPDATER=1` and `DISABLE_TELEMETRY=1`, and a home under the data root with dedicated `CLAUDE_CONFIG_DIR` and `CODEX_HOME` directories; the `CODEX_HOME` holds a `config.toml` with `check_for_update_on_startup = false`. Each step has an expected exit status, and the login and write steps also an expected output; every step matched.

Host side-effect check: the compared directories are the qualification home, which holds both configuration directories, and `/opt/harnesses`, the installed harness binaries. Before and after the steps, `qualify.sh` listed their entries with type, mode, and link target, plus the SHA-256 of every file. `docker diff` also listed every changed path in the container, except the generated schema files, which are hashed in the steps. Only the steps run in the container, so every difference is proven to come from them; which step wrote each file was not isolated where the table says so, and none is unexplained.

Scope: on 2026-10-25 the owner decided that only steps needing no credentials run, because no subscription login is authorized for this item ([G2 plan](../g2-plan.md) item 26). The lockfile's tarballs are the qualified ones: its darwin-x64 tarballs, which match their lockfile integrity, contain binaries with the SHA-256 values that the macOS series qualified ([Pinned version](#pinned-version)), and the image installs the linux-x64 tarballs from the same lockfile. `npm audit --package-lock-only` on the harness lockfile reported no vulnerability on 2026-10-25.

| Architecture | Result |
| --- | --- |
| linux/amd64 | Native on the x86_64 host; the results are below |
| linux/arm64, emulated | Not run. The build failed in the `node-arm64` stage, which the default images share. Under Docker Desktop's QEMU on this host, GNU tar 1.35 in the pinned base failed on every entry of the Node.js tarball with "Cannot mkdir: Invalid argument" or "Cannot open: Invalid argument", while a plain `mkdir` in the same emulated container worked |
| linux/arm64, native | Not run. No local arm64 Linux host was available; D11 names the GitHub-hosted runner `ubuntu-24.04-arm`, and by the coordinator's decision this item adds no workflow |

Results on linux/amd64:

| Step | Result |
| --- | --- |
| Platform | `Linux x86_64`, Ubuntu 24.04.5 LTS, Node.js v24.22.1, user `taskelith` |
| Binary | `@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`, SHA-256 `b93f6811d3f653f0fb83be4050d857fb9abbb111dfa2ce160563327daff7f306`, reports `codex-cli 0.164.0`. The Linux binary is linked against musl and starts on the glibc base |
| Credentials | A search of the whole image as root found no `auth.json` or `.credentials.json`. `codex login status` exited 1 with `Not logged in` for the qualification home |
| App-server schema | `codex app-server generate-json-schema` wrote 320 files; the SHA-256 over their sorted hashes is `fc9256ad0eac370b62b095b8ea218d086d78f954a142f9e1a2e0fee58802c147` |
| Self-update | Writing to the binary was refused for the `taskelith` user, and the listing of `/opt/harnesses` was identical before and after the steps. Codex has no environment switch for its update check; `check_for_update_on_startup` is read from `CODEX_HOME`, so a worker must write it into each run's `CODEX_HOME` |
| Side effects | Only in `CODEX_HOME`: the directory `tmp/arg0-linux` (mode 700), created at startup by a Codex step; which one was not isolated. Apart from the steps' own outputs (the listings under `/tmp`, the schema directory, the `config.toml`, and the mount point of `qualify.sh`), nothing changed in `/opt/harnesses` or elsewhere in the container |

Not run, because they need a login: multi-turn chat, correlation, resume, approvals, interruption, outcomes, the pending approval across a crash, and egress with analytics on and off. They stay open for the Codex admission in G4.

## Remaining before admission

- The review of OpenAI's data-handling terms, and of whether its terms allow pooled subscriptions for automated use (ADR 0005), is recorded on 2026-10-25 in [Provider terms review](#provider-terms-review), from Wayback Machine snapshots because the live pages returned HTTP 403; the owner decided D15 on 2026-10-25: (a), accept the remaining risk ([G3 plan](../g3-plan.md#owner-decisions)); admission remains subject to the other qualification gates in G4 ([ADR 0007](../decisions/0007-g0-closure.md)).
- Linux in the worker image ([Linux worker image](#linux-worker-image)): the scenarios that need a login on linux/amd64, which the owner did not authorize for G2 item 26; linux/arm64, natively, for example on D11's runner `ubuntu-24.04-arm` or an Apple Silicon host. Also macOS arm64.
- Disabling the update check per run: `check_for_update_on_startup = false` in each run's `CODEX_HOME`, because Codex has no environment switch for it.
- Non-permission input requests, and repeated runs.
- The cause of the temporary-directory fallback after a crash.
- Whether plugin-catalog polling and MCP traffic can be disabled.
- The subscription slot mechanism, its load, limit, and reset signals (including whether Codex reports usage and reset times at all), and the credential-exposure tests required by ADR 0005.
- Independent adoption evidence for the pinned version, and the vendor's experimental status of app-server.
