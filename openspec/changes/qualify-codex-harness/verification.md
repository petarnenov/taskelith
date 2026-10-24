# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

Owner request on 2026-10-24: qualify Codex as the next task; the owner signed in with their ChatGPT subscription using the pinned binary and a dedicated `CODEX_HOME`. Base revision: `087132f` on `dev`. Scope: `docs/qualification/codex.md` (new), the Codex row in `docs/dependencies.md`, the G4 line in `docs/integration-candidates.md`, the "First integrations" row in `docs/foundation.md`, one added gate and the Interruption row in `docs/qualification/claude-code.md`, and this change, including an added `harness-qualification` requirement. Documentation only.

## Qualification runs

Environment: macOS 26.6.2 (25G83), x86_64, Node.js 24.22.1. `@openai/codex@0.164.0` was installed with `--ignore-scripts` into a scratch directory outside the repository. `codex login status` with the dedicated home reported `Logged in using ChatGPT`; the home holds `auth.json` (mode 600), and no Codex Keychain entry exists.

Series `c2` ran through `make all` (a Makefile in the scratch directory). Each run directory holds `meta.json` (script hashes, binary hash and version, allowlisted environment with `USER` masked, analytics arguments, timestamps, exit status), `proxy.jsonl`, `sockets.txt`, and, except for the killed `c2-crash-pending`, `out.jsonl`. Script hashes in every `meta.json` match the final scripts: `capability-probe.mjs` `a71416fe…`, `mitm-proxy.mjs` `4dd155bb…`, `orchestrate.mjs` `ca878fc9…`. Runs took 3–14 s, except the interrupt run, which waits 70 s after the turn.

| Run | Analytics | Result |
| --- | --- | --- |
| `c2-egress-default` | default | two turns completed, turn IDs match, answer `PELICAN`; two analytics posts; one WebSocket upgrade |
| `c2-egress-off` | off | the same results; no analytics request |
| `c2-approval-deny` / `c2-approval-allow` | off | one `item/commandExecution/requestApproval` each; decline: no side effect; accept: side effect |
| `c2-failed-turn` | off | status `failed` with an error |
| `c2-resume-create` / `c2-resume-continue` | off | a new process resumed the thread and answered `HERON` |
| `c2-interrupt` | off | command started at 5,866 ms; interrupt at 8,867 ms; status `interrupted` at 8,872 ms; marker absent at 78,871 ms |
| `c2-crash-pending` / `c2-crash-resume` | off | approval pending at 15:18:22.748Z, observed 15:18:22.867Z, SIGKILL of three processes at 15:18:24.996Z; after resume the original turn was `interrupted`; the original item was not re-delivered; a new existence-check request was declined; no side effect |

No run showed a non-loopback socket, a UDP socket, a TLS error, or an upgrade error.

Host check (`c2-host.diff`, `c2-host-links.diff`, `c2-host-changed.stat`, `c2-host-before.ps`, `c2-host-after.ps`): `~/.local/bin` unchanged. The probe's harness created `~/.codex/tmp/arg0-macos/codex-arg0HvXahB` (symlinks to the pinned binary) at the start of `c2-crash-resume`; `lsof` showed no holder, and the author removed it at 15:19:48Z. `models_cache.json` and `logs_2.sqlite-wal` changed at 18:17:14–17 local, when the probe's app-server had been stopped and nine of the owner's Codex processes, identical before and after, were running; these are attributed to the owner's processes. The same temporary-directory fallback occurred in the superseded series `c1` (`codex-arg0EXlry4`, removed by the author at about 18:06 local); a controlled run without a crash used `CODEX_HOME/tmp`.

Series `c1` is superseded: its proxy had no WebSocket relay. Its run directories remain in the scratch directory and are not used as evidence.

## Author self-check before review

- Every capability result names its `c2` run; untested items are stated.
- The analytics default is observed, and the record says so.
- Host changes are separated into proven and attributed.
- Evidence check on `docs/qualification/codex.md`: passed; local link and anchor check: passed.

## Checks

Node v24.22.1, npm 12.2.1: `make verify` passed (19 tests passed, dependency inventory verified, strict OpenSpec validation 15 passed, package verification passed).

## Independent review

Assigned reviewer (rotation): Claude Code 2.1.310 with `--model claude-fable-5-1 --effort medium --permission-mode plan`, editing tools disallowed, read-only access to `runs/` and `probes/` in the scratch directory; the JSON output reports `claude-fable-5-1` (and `claude-haiku-5-5`, which Claude Code uses internally). SHA-256 snapshots of the repository and of the shared evidence before and after each pass were equal.

- **Pass 1 — session `e1479ed2-0f30-478c-a943-f53e9e4da774`** (reviewed series `c1`). Findings: 0 Critical, 1 High, 5 Medium, 5 Low. All accepted and resolved:
  1. High: the proxy could not relay WebSocket upgrades, which distorted egress and invalidated the interrupt result. The proxy now relays upgrades; series `c2` re-ran every scenario; the interrupt now fires after the command starts and is `verified`.
  2. Medium: the defaults row omitted requests. The egress table is rebuilt from `c2` and lists every request type.
  3. Medium: data-handling and pooled-subscription terms were missing. Both are recorded as open gates; the OpenAI pages returned HTTP 403 to an automated client.
  4. Medium: blind spots were referenced, not listed. They are enumerated, including WebSocket frames, the unretained JSON-RPC stream, and the loopback filter.
  5. Medium: the added requirement was not testable. It now requires named directories and a proven, attributed, or unexplained mark per difference; the Claude Code record lists the check as a gate.
  6. Medium: the host record named the wrong files and unshared times. It now names the WAL and SHM files and cites `c2-host-changed.stat`.
  7–11. Low: removal times and symlink evidence are recorded; the crashed run's missing `out.jsonl` is stated; the register row points to the record's gate list; `HOME` is now per run, and the record states that the fallback ignores it; plugin-catalog polling is described as polling.

- **Pass 2 — session `2efdf21e-0b6b-48dd-8168-c9a333f9c69c`.** All pass-1 findings confirmed resolved. Findings: 0 Critical, 0 High, 2 Medium, 7 Low. All accepted and resolved:
  1. Medium: the interrupt evidence did not isolate `turn/interrupt` from the app-server shutdown. Interruption is now `verified (turn level)`, with the confound stated; the Claude Code record gets the same wording, because its probe has the same confound.
  2. Medium: ADR 0005's load, limit, and reset signals were missing from the gates. Added.
  3–9. Low: the binary's platform package name is corrected; the `featured` path is stated; polling is described as observed during turns only; the `c1` disappearance is no longer timed; query-string removal, the unhashed summary script, and name-based classification are stated; the host-check blind spot and empty per-run directories are stated; the candidate assessment's Codex telemetry cell now cites the observation.

- **Pass 3 (final) — session `70da5fb2-ef3c-4c53-b36b-4625e91b8b3b`.** Pass-2 findings confirmed, two of them imprecisely resolved; no regression. Findings: 0 Critical, 0 High, 0 Medium, 10 Low. Under the review process they were fixed without another pass; **these fixes have not been independently reviewed**:
  1. Low: the `c1` directory time read as a measurement. Now tied to the run's start time.
  2. Low: the polling count included requests outside the turn. Now 12 inside the turn; "stopped" is stated as SIGTERM sent, with the last proxied request time.
  3. Low: the binary package was named by its alias. Now `@openai/codex@0.164.0-darwin-x64`, installed under the alias.
  4. Low: Claude Code's interruption kept a plain `verified`. Both records and the assessment now say `verified` (turn level).
  5. Low: the Claude Code gate implied a temporal scope. It now says the record does not yet meet the requirement.
  6. Low: the scope omitted the Claude Code interruption edit. Added.
  7. Low: the proposal and assessment overstated coverage. Corrected.
  8. Low: the controlled run was unnamed. Its steps and retained listings are described.
  9. Low: host paths outside the two compared directories were not a stated blind spot. Added.
  10. Low: the app-server documentation link redirects. The record now links the destination and names the old address.

Remaining findings: 0.

## Remaining gates

Merge into `dev`; promotion to `main`. Before admission: see "Remaining before admission" in the qualification record.
