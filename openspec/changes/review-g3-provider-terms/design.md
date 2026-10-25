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

The findings, in brief: Anthropic's "Legal and compliance" page says subscription OAuth is "intended exclusively" for plan purchasers and "ordinary use", that where Claude Code runs in a product "Each end user must authenticate with their own" credentials and customers "may not pay for, resell, or intermediate Claude usage", and that developers may not store or intermediate Claude.ai credentials; Anthropic's EEA Consumer Terms add "Non-commercial use only". OpenAI's App Server page says "App-server authentication has never been permitted for commercial or hosted services" while local or open-source applications may continue to use it; its Sign in with ChatGPT terms, where they apply, require requests from a runtime the user controls and bar rotating accounts, pooling plan usage, and serving another user's requests; its Usage Policies, from November 20, 2026, require approval for a "model-access intermediary platform". Both providers' consumer terms bar making an account available to anyone else. The records separate (i) an operator using one subscription of their own through self-hosted Taskelith for their own work, which the texts leave ambiguous, from (ii) pools of different people's subscriptions and rotation across accounts, which find no supporting text and meet these clauses directly. GitHub's terms raise no blocker for ADR 0006; the separate reviewer identity, the thresholds for excessive or disruptive automation, and the D.4 AI-training license are ambiguous.

- **(a) Accept the remaining risk.** Keep ADR 0005 as decided. The quoted clauses appear to conflict with pools of subscriptions owned by different people and with rotation across accounts, and Anthropic states that it may enforce "without prior notice", so the risk includes suspension of the slot owners' accounts.
- **(b) One subscription per harness.** Each harness uses one subscription owned by the operator who runs Taskelith for their own work, with no pooling across people or rotation across accounts. This matches the "authenticate with their own" and "ordinary, individual usage" wording most closely, but it still leaves ambiguous whether unattended SDK-driven orchestration is "ordinary use", whether the control plane's storage and injection of that one token is intermediation, whether self-hosted Taskelith is a "commercial or hosted service" for OpenAI, and, for an EEA operator on an Anthropic consumer plan, whether professional work conflicts with "Non-commercial use only".
- **(c) Hold admission.** Admit no subscription-authenticated harness until a provider confirms that Taskelith's use is permitted. The routes the texts offer differ: Anthropic offers "contact sales" for questions about permitted authentication methods, and its Agent SDK restriction applies "Unless previously approved"; OpenAI offers the Sign in with ChatGPT open-source program, which needs no requested client ID, for open-source and locally hosted apps, and an interest form and partner waitlist for paid or remotely hosted apps.

**Author's proposal:** (b) for G3, limited to an operator's own single subscription per harness used for their own work, with pools of more than one subscription per harness, and any slot owned by another person, held as in (c) until a provider's confirmation covers them; for Codex, the operator may also check whether the open-source program's route fits better than app-server's own login, since that login is stated never to have been permitted for commercial or hosted services. This is a recommendation, not a decision: the new clauses narrow (b) but do not settle it, and the ambiguities listed under (b) remain the owner's risk under D15. ADR 0005's pool port stays harness-neutral, so a single-slot pool needs no change to the kernel. The texts also point to API-key authentication for the Agent SDK and for Codex automation, which ADR 0005 decision 2 excludes; that is recorded as a fact, not proposed as a change.

## Risks / Trade-offs

- Terms change after 2026-10-25 → each record carries effective and access dates, and admission rechecks them.
- Quotes taken from archived snapshots may differ from the live page served to another region → the records name the snapshot and its timestamp.
- The review is not legal advice → the records say so and separate the text from its ambiguity.
