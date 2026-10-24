## Context

The original architecture proposed Linux first but explicitly required owner confirmation. The owner instead selected Linux and macOS. Neither worker exists yet, and local macOS development is not native worker acceptance.

## Goals / Non-Goals

Make scope and future data locations precise and reviewable. Do not select unqualified distribution/OS versions, ship service definitions, implement G1/G2 behavior, or change the bootstrap CLI.

## Decisions

Use one shared TypeScript protocol/application layer with explicit OS adapters. Require separate Linux/macOS native recovery and resource-limit evidence. Prefer systemd and launchd service integration candidates, subject to exact-platform qualification and execution-lifecycle tests.

Use an explicit absolute data directory or a platform-specific Taskelith default. Keep control-plane and worker identity subtrees separate; do not import another installation's state. On Linux, persistent application data belongs under XDG_DATA_HOME rather than a disposable cache or runtime directory. On macOS, use Application Support. Explicit service roots override per-user defaults.

## Risks / Trade-offs

Selecting two worker families adds native acceptance work. Shared TypeScript tests cannot establish crash recovery, logout/reboot persistence, resource enforcement, or process ownership on either platform. A data-root convention does not implement security, locking, durability, enrollment, or backup. These remain runtime gates.
