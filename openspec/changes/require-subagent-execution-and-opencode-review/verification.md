# Verification: require-subagent-execution-and-opencode-review

## Scope and source

On 2026-10-26 the owner asked, in Bulgarian and paraphrased here, to make it a mandatory rule that an agent that receives a task carries it out in a subagent, with review by OpenCode. Under the away mode the owner had activated, the coordinator settled its reading through the away delegate (OpenCode, `opencode-go/kimi-k2.7-code`, run `20261026T011448Z-opencode-58558`), as `design.md` records. The coordinator developed this change itself, following the worker steps, in its own session; the rule takes effect when the change merges. Base revision: `c89cf6c` on `dev`.

## Environment

macOS on x86_64, Node.js 24.22.1.

## Author self-check before review

- The rule appears in the protocol, the governance review process, the skill, and `AGENTS.md`, and they agree.
- The rotation stays as the order for replacements; the one-reviewer and three-pass rules are unchanged.
- The spec requirement is 370 characters. All content is English, and no worker or host is named.

## Evidence check

The change adds no external link or external fact; its sources are the owner's instruction and the away delegate's run above.

## Checks

PENDING

## Independent review

PENDING

## Remaining gates

None after review and integration.
