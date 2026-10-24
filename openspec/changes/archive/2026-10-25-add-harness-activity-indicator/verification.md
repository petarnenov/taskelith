# Verification: add-harness-activity-indicator

## Scope and source

On 2026-10-25 the owner asked for a small round spinner on the kanban board's cards that shows whether the card's harness is working or has stopped and is waiting. Asked where and which states, the owner chose to change both the UI proof of concept and the specification, with three states: working, waiting, and stopped. During the work the owner extended the request to every place in the UI that shows a card with a harness. The change was first created as `add-card-harness-activity-indicator` and renamed before its first push. Base revision: `d113b6a` on `dev`; `origin/dev` at `2d3b175` was merged in before handoff. Prepared in a git worktree. Scope: a `product-ui` requirement, the `product-ui` Purpose, and this change. The UI proof of concept is a private design canvas outside the repository (ADR 0008); its updates are listed below as external evidence.

## Proof of concept

The canvas went from version 22 to version 28. The board, task detail, agent session screen, "Needs you" inbox, and review queue and detail show the indicator from one state mapping repeated in each artboard. SHA-256 prefixes of the final artboards: `Main.dc.html` `ce46a48ff196`, `Session.dc.html` `137e80115f39`, `Inbox.dc.html` `9d7be3f92688`, `Reviews.dc.html` `d996113a2c6e`. The JavaScript of each changed artboard passed `node --check`. The light-theme board was opened in a browser once to check the theme toggle at the owner's request; the indicator's motion was not checked in a browser.

Outside this change's scope, the owner reported that the Plugins screen rendered badly in the light theme. Its artboard had no `themes()` method; version 27 restored it with the token set of the Workers artboard. It is recorded here because it shipped in the same series of canvas versions.

## Self-check

The requirement is 342 characters. The workers screen was checked: it lists machines, harness versions, and slot counts, but no session state, so it is excluded with that reason in `design.md`. No comment lines are added. No external link is added.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `dde3c10`, `52e2bdb`, `801bbba`, and after the merge of `origin/dev`; `npm run openspec -- validate add-harness-activity-indicator --strict` and `validate --all --strict` passed.

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort medium, plan mode with `Edit`, `Write`, and `NotebookEdit` disallowed; the model was confirmed in each JSON `modelUsage`. External evidence (the changed artboards and their diffs) was in a scratch directory outside the worktree. SHA-256 snapshots of the worktree and the evidence before and after each pass were equal.

- **Pass 1 at `dde3c10` — session `97883810-63ac-4f92-82b7-3982564b89cd`.** 0 Critical, 0 High, 3 Medium, 4 Low: the waits scenario required a label the idle state did not have; no scenario for stopped or no session; the stopped ring used the border color and was nearly invisible; the uncertain state was undecided; `design.md` contradicted itself on which states spin; dead bindings and a different indicator in the task detail; the requirement was not traceable as an owner decision. All were resolved, together with the owner's wider scope.
- **Pass 2 at `52e2bdb` — session `4303e38d-a2d5-4cbb-bf65-acc8b6de6681`.** Confirmed five resolutions and partly two; 0 Critical, 0 High, 3 Medium, 8 Low. Added the ownership-uncertain scenario and updated the `product-ui` Purpose. A Medium on a session shown differently on two screens was answered as two different sessions, which pass 3 confirmed. The Lows were resolved: the reviewer-slot state, a duplicate label, label colors, waiting notes, design wording and exclusions, the indicator in the review detail, the spinning track color, and a note on the shared component.
- **Pass 3 at `801bbba` — session `ababd1f7-9f4b-4f4b-8489-5aae61604c0c`.** Confirmed every pass 2 resolution; 0 Critical, 0 High, 1 Medium, 6 Low.

## Unreviewed fixes after pass 3

Pass 3 was the last allowed pass. The owner decided to fix its Medium without another review; the Lows are fixed under the Low-only rule. None of these fixes is reviewed.

1. Medium: after a denied approval the board card showed a spinning "Session live", and a denial from the inbox was read as an approval. The inbox and the board now store the decision, and a denied card shows "Waiting for instructions" with the still waiting look; the inbox's denial text says the harness waits for instructions.
2. Low: the session screen's approval step is unreachable. `design.md` now says that only the board shows every state.
3. Low: the session screen's last step said the session was stopping while its status said stopped. The step now says it has stopped.
4. Low: `design.md` now names the look for waiting for the next admission.
5. Low: `design.md` now says that the review queue shows the reviewer's session.
6. Low: the workers screen exclusion was not checked against evidence. It is checked here (see Self-check).
7. Low: the inbox's approval item linked to another session's screen. It now links to the board as "Open task".

## Remaining gates

Merge into `dev` and archive by the coordinator. Implementing the indicator in the SPA and defining the session state in the contracts belong to later gates.
