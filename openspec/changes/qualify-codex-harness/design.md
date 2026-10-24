## Context

The Claude Code qualification established the method: a pinned binary, an allowlisted environment, a dedicated configuration home, a TLS-terminating proxy with a socket sampler, scripted crash timing, and a `make` target. Codex exposes a JSON-RPC app-server instead of an SDK, and supports a custom CA through `CODEX_CA_CERTIFICATE`.

## Goals / Non-Goals

Produce macOS x86_64 evidence comparable to Claude Code's, and check host side effects from the start. Do not write plugin or port code, admit Codex, or claim Linux support.

## Decisions

- Store the subscription credential in a file inside the dedicated `CODEX_HOME` (`cli_auth_credentials_store = "file"`) and disable the startup update check, so nothing is shared with the owner's Keychain or installation.
- Compare listings of the owner's `~/.codex` and `~/.local/bin` (file hashes, symlink targets, modification times, running processes) before and after the series, because the Claude Code qualification found writes outside its configuration directory.
- Give each run its own `HOME`, and relay WebSocket upgrades in the proxy.
- Generate the protocol schema from the pinned binary and write a minimal JSON-RPC client for the scenarios.
- Toggle analytics with `-c analytics.enabled=false`, the documented switch.

## Risks / Trade-offs

Each scenario ran once on one platform and one provider. The owner's own Codex processes were running during the series, so some changes in `~/.codex` are attributed rather than proven. The first series was invalidated by a proxy without WebSocket support; the measuring proxy must relay every transport the harness uses. After a crash, the harness falls back to the account's home directory for a temporary directory even with `HOME` and `CODEX_HOME` overridden.
