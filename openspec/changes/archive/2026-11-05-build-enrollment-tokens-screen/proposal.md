## Why

G3 item 33 (`build-workers-and-pools-screens`, `docs/g3-plan.md`, row 33), third change of the coordinator's split (`brief-33-plan.md`, Niki, 2026-11-04): change 1, `serve-workers-and-enrollment-tokens` (#445), serves the four enrollment token operations of `control-plane.openapi.json` 0.5.0; 33a `build-workers-screen` (#447, `dev` `3191c262`) built the workers screen with a `WorkersGateway` port of its own and left the enrollment tokens and the link of its empty state to this change. An installation-owner can so far issue, revoke, and rotate tokens only through the CLI; the SPA's workers screen names the token and links nowhere.

## What Changes

- The `WorkersGateway` port gains `listEnrollmentTokens`, `issueEnrollmentToken`, `revokeEnrollmentToken`, and `rotateEnrollmentToken`, with command results that name each documented refusal (`csrf-rejected`, `invalid`, `token-used`, `token-rotated` with its replacement, `token-not-pending`, and the read failures); the adapter reads every page of the pending tokens through `readPages`, lifted from the board adapter to `api/read-pages.ts` as a pure move with a variant that reports a list cut short by the page limit, checks and rebuilds every body from the documented fields alone (a secret only of the `EnrollmentTokenSecret` shape), and sends the session's CSRF token with the three commands through a `csrfToken` option that `main.tsx` wires as the board's.
- An "Enrollment tokens" section under the workers on `/app/workers`, gated by the same installation-owner rule: the pending tokens of every page as cards with identifier, times, and constraints, a Refresh that keeps the shown list, "No pending token.", and an honest note when the page limit cut the list short (decisions Q9 (a), Q10 (a)); an inline "Enroll a worker" form with the three optional constraints that sends `{}` when empty and refuses a hostname outside `DisplayText` before it is sent (Q1 (a)); Revoke (red) and Rotate behind a confirmation dialog that names the token and the irreversibility and returns the focus (Q6 (a)); one command in flight per section, every button saying so (Q11 (a)); the list read again after every answer that changed it (Q8 (a)).
- The one-time reveal (Q2 (a), Q3 (a), Q4 (b), Q5 (a)): the 201 of an issue or a rotation shows a dialog with the token, its validity taken from its own instants, the constraints, the secret in a read-only field with Copy and "Copied" announced, text naming `TASKELITH_ENROLLMENT_TOKEN` and that the CA fingerprint comes from the CLI bundle, no command line, and an in-dialog "Close without copying?" step skipped after a copy; the secret lives in the section's component state alone and is dropped on every close, on a rotation, on leaving the screen, on the session's end, and on a sign-out, each with its own test.
- The answers in one status region (Q7 (a), Q12 (a)): redeemed, replaced with the replacement linked to its row when listed, not pending, not found, invalid, the role of a 403, and after no usable answer that an issue or rotation may have taken effect without its secret, with a Refresh and no Retry, while a revoke gets a Retry; the single CSRF resend of 31b under the same `signedInGeneration`, with a second refusal, a session read without an answer, or a changed sign-in shown as final.
- The workers' empty state links "enrollment token" to the section (the "No worker" scenario is modified); `useWorkers` and the tokens list share `useSnapshot`; the theme's `red.9` is darkened so a red light-variant button keeps 4.5:1 when hovered in the light scheme, with the pair in the contrast matrix.
- Records: the README's SPA status; `screens.ts` keeps `build-workers-screen` as the change that built the page (Q13 (a)).

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA enrollment tokens", "Web SPA enrollment token secret", and "Web SPA enrollment token answers"; modifies the "No worker" scenario of "Web SPA workers screen".

## Impact

`apps/web`, a private workspace, its tests, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: the four operations, `EnrollmentToken`, `EnrollmentTokenPage`, `HostConstraints`, `IssuedEnrollmentToken`, and `EnrollmentTokenSecret` are in `control-plane.openapi.json` 0.5.0. Out of scope: account pools (33c), the 12d B backend, the installation CA fingerprint in the browser document and idempotency keys on issue and rotate (both OpenAPI changes, recorded as follow-ups), a countdown or relative expiry, a "Load more" pager, and any automatic retry of issue or rotate beyond the single CSRF resend.
