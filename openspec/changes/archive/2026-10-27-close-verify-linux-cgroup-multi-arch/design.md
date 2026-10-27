## Context

The 24a record `2026-10-26-run-g2-failure-scenarios-composition` named multi-arch tooling for `make verify-linux-cgroup` as a follow-up (its `design.md:31` and `verification.md:83`), because the target then refused arm64. ADR 0015 decision 5 carried it as a non-blocking follow-up owned by the coordinator. 25b's commit `73c0b2f7` changed `make linux-test-image` (Makefile, target `linux-test-image`) to choose the Node.js tarball by `docker info` Architecture: `x86_64`, `amd64`, or `x86-64` take the linux-x64 tarball, `aarch64` or `arm64` take the linux-arm64 tarball, both verified with their pinned SHA-256 (`NODE_LINUX_X64_SHA256` and `NODE_LINUX_ARM64_SHA256`), and any other architecture fails. The base `ubuntu:24.04` is pinned by its multi-arch OCI index digest with both platform manifests listed (`docs/dependencies.md:127`).

## Goals / Non-Goals

**Goals:** close the follow-up honestly, with the commit that resolved it, the native evidence on both architectures, and a fresh run on this host.

**Non-Goals:** any code, Makefile, or image change; cross-architecture runs on one host through QEMU emulation; any other line of ADR 0015 or `docs/foundation.md`; the hosted-runner Linux x86_64 check, which shares the ledger row and stays open.

## Decisions

1. **Close, not reimplement.** The behavior the follow-up asked for exists since `73c0b2f7`, which is an ancestor of the 25b evidence revision `4b3d693` and of the 25c evidence revision `b82ad2f`. Both runs passed `make verify-linux-cgroup` 14 of 14 on their architecture, so no code change is needed.
2. **Native only.** Each architecture runs on a host of that architecture. Running the arm64 image on an x86_64 host, or the reverse, through QEMU emulation is not claimed and not planned, since nothing needs it now (coordinator Niki's decision, 2026-10-27).
3. **Edit only the follow-up's lines.** The ADR bullet keeps its sentence and appends the resolution, as the earlier resolution notes of decision 5 do. The foundation ledger row also names the hosted-runner check, so only a clause about the multi-architecture part is appended and the hosted-runner text stays.
4. **Fresh evidence on Linux.** 25b and 25c ran under Docker Desktop on macOS; this change adds a run on a Linux x86_64 host with Docker Engine, recorded in `verification.md`.

## Risks / Trade-offs

- Line citations such as `docs/dependencies.md:127` and `openspec/specs/native-worker-acceptance/spec.md:87` can go stale when those files change; they are correct on the base `af558eb0`.

## Review checklist

Printed by `make findings ARGS="checklist --capability native-worker-acceptance,foundation-closure --files Makefile,scripts/**,tools/linux-cgroup/**,docs/decisions/**"`:

```text
Review checklist (capabilities native-worker-acceptance, foundation-closure; files Makefile, scripts/**, tools/linux-cgroup/**, docs/decisions/**), most frequent finding categories first:
1. contract-drift (9): Code, a contract document, and its specification disagree. Example: "Reviewer statistics silently left out archived changes with no review record, so the incomplete-history warning understated the gap"
2. docs (4): Documentation is missing, wrong, or out of date with the change. Example: "The Makefile comment of the findings target did not list the reviewers command"
3. error-handling (4): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The Linux crash windows script mounted the services secrets without checking that their variable is set"
4. redaction (4): A secret or private value can leak into output, logs, or records. Example: "The NATS seed pattern misses server, cluster, and curve seeds"
5. process (3): A protocol, governance, or review rule was not followed. Example: "The findings operations have no Makefile entry"
6. missing-fail-before-test (2): A fix has no test that fails before it and passes after it. Example: "No test covered a failed proof together with a not-applicable one in the run's last line"
7. naming (2): A name hides intent or uses two terms for one concept. Example: "Pass summaries were parsed from a type named for findings, and the valid-output helper called its changes files"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (27): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
2. evidence-mismatch (26): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
3. stale-citation (15): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (12): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. contract-drift (5): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
6. process (3): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
```
