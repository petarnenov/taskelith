## Context

ADR 0005 pools many subscriptions per harness and project, selects the least-loaded slot, applies cooldown on limit signals, and has the control plane store slot credentials encrypted and inject them per run; ADR 0006 runs GitHub through one GitHub App per installation with per-run installation tokens. ADR 0007 requires the provider terms review before admission in G3, and D15 waits for it. The owner authorized this item to start early on 2026-10-25.

## Goals / Non-Goals

**Goals:**
- Record, in each qualification record, what the current terms say about Taskelith's use, with brief verbatim quotes, sources, effective dates, and access dates, and where the text is ambiguous.
- State the options for D15 and a recommendation labeled as the author's proposal.

**Non-Goals:**
- A legal conclusion, deciding D15, or changing ADR 0005, ADR 0006, or any implementation.
- Contacting a provider; that would be an outward-facing step for the owner.

## Decisions

- **Placement.** Each provider's review goes into its existing qualification record, next to its terms table, because admission gates already live there; the D15 options stay here, so the records hold only findings.
- **Spec delta.** The `harness-qualification` and `scm-qualification` capabilities gain a terms review requirement, because no existing requirement asks for quoted clauses, access dates, and an ambiguity statement; `skip_specs` would leave the gate unspecified.
- **Evidence.** Research passes saved raw copies of every quoted page with SHA-256 hashes outside the repository; the quotes in the records were checked against them. Pages that blocked automated clients or varied by region were taken from dated Wayback Machine snapshots, and the records say so.

## Options for D15

The findings, in brief: Anthropic's "Legal and compliance" page appears to bar third-party developers from routing requests through Free, Pro, or Max credentials on behalf of users and from storing or intermediating Claude.ai credentials, and ties plan limits to "ordinary, individual usage"; both Anthropic's and OpenAI's consumer terms bar making an account available to anyone else; OpenAI's Sign in with ChatGPT terms, where they apply, bar rotating accounts and pooling plan usage. Whether a self-hosted orchestrator run by the subscriber is a "third-party developer" product is not stated. GitHub's terms raise no blocker for ADR 0006; the separate reviewer identity and the D.4 AI-training license are ambiguous.

- **(a) Accept the remaining risk.** Keep ADR 0005 as decided. The quoted clauses appear to conflict with pools of subscriptions owned by different people and with rotation across accounts, so the risk includes account suspension.
- **(b) One subscription per harness.** Each harness uses one subscription owned by the operator who runs Taskelith for their own work, with no pooling across people or rotation across accounts. This stays closest to "ordinary, individual usage"; the storage and injection of that one token by the control plane remains ambiguous under Anthropic's text.
- **(c) Hold admission.** Admit no subscription-authenticated harness until a provider confirms in writing that Taskelith's use is permitted (Anthropic's text says "Unless previously approved"; OpenAI offers a client-ID request for Sign in with ChatGPT).

**Author's proposal:** (b) for G3, with pools of more than one subscription per harness held as in (c) until a provider's written permission covers them. ADR 0005's pool port stays harness-neutral, so a single-slot pool needs no change to the kernel. The texts also point to API-key authentication for the Agent SDK and for Codex automation, which ADR 0005 decision 2 excludes; that is recorded as a fact, not proposed as a change.

## Risks / Trade-offs

- Terms change after 2026-10-25 → each record carries effective and access dates, and admission rechecks them.
- Quotes taken from archived snapshots may differ from the live page served to another region → the records name the snapshot and its timestamp.
- The review is not legal advice → the records say so and separate the text from its ambiguity.
