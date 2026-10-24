## Context

ADR 0003 chose Forgejo because closed services were admissible only for harnesses and their providers. The owner now prefers GitHub.com as the first SCM. The microkernel (ADR 0003 decision 8) and the trust model's per-project credential scoping still apply.

## Goals / Non-Goals

Record the decision and its limits and align the dependent documents. Do not qualify GitHub.com, create a GitHub App, or remove the Forgejo assessment.

## Decisions

- Admit a closed, hosted SCM on the same evidence terms as closed harnesses (terms, data handling, API version, maintenance, security).
- Use a GitHub App per installation with installation tokens limited to the project's repositories and delivered per run, as the owner approved.
- Keep Forgejo as the second SCM without a fixed gate, as the owner set; keep its assessment as the evaluation record.
- State in the candidate assessment that its SCM table predates the change and covers self-hosted open-source candidates only.

## Risks / Trade-offs

Project repositories leave the self-hosted installation boundary when the GitHub plugin is used. Until Forgejo is added, only one SCM plugin exercises the SCM port.
