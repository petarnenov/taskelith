## Why

G3 item 33 (`build-workers-and-pools-screens`, `docs/g3-plan.md`, row 33) builds the SPA's workers and account pools screen. The coordinator Niki split it on 2026-11-04 (`brief-33-plan.md`): change 1, `serve-workers-and-enrollment-tokens` (landed in `dev` `d0acd304`, #445), serves `listWorkers` and the enrollment token operations; this change, 33a `build-workers-screen`, builds the workers screen with the admission and self-check results that the product UI "Automatic worker admission" requirement asks for ("the failed checks are shown on the workers screen"); 33b adds the enrollment tokens and 33c the account slots. The server side is in `dev`: `listWorkers` (`control-plane.openapi.json` 0.5.0, `GET /workers`), which requires `installation-owner`, redacts every self-check detail again, and answers the whole view or no partial data.

## What Changes

- A `WorkersGateway` port of its own in `apps/web/src/workers/` (decision Q8 (b): installation administration is not the board), with `listWorkers()` answering a `ReadResult<WorkersView>`; its adapter over the shared typed fetch checks and rebuilds the view from the documented fields alone (`asOf`, each worker's identifier, host, enrolment, admission state, optional report time, and up to 8 self-check results of the three `outcome` variants), reads a 404, which `listWorkers` does not document, as unavailable, and sends no CSRF token, the read being a GET. The read failures (`ReadFailed`, `failureOf`, `reachable`) and the session-expiry wrapper (`expiringCall`) move to shared modules that the board and the workers gateways both use, with the board's behaviour and tests unchanged; `App` takes the workers gateway as a prop, and `main.tsx` creates it.
- The workers screen at `/app/workers`, replacing the planned page, with the title "Workers and account pools" kept (decision Q1 (a)): the view's `asOf` and a Refresh that reads again and keeps the shown list until the answer arrives (Q5 (a)); each worker in the wire's identifier order (Q6 (a)) as a card with its hostname, identifier, platform and architecture, enrolment time, admission state in words ("Admitted", "Awaiting self-check", "Not admitted: self-check failed"), last report time or "No report yet", and every self-check in words, the failed ones first with their problems as nested text and a skipped one with its reason (Q3 (a)); a dimmed "No worker is enrolled" line without a link for an empty view (Q4 (a)); hostnames, identifiers, and problems breakable at phone width.
- The installation-owner gate (Q2 (a)): the navigation entry stays for every operator; without `installation-owner` in the session's roles the page shows its heading and a notice "Needs installation-owner" and calls no `listWorkers`; the control plane's 403 still shows the denied state with the role it names, for a role that changed after the sign-in.
- Honest states: a loading line without a spinning loader under reduced motion, `LoadError` with a retry for an unreachable control plane (503, 5xx, an undocumented status, a body without the view, or no answer), the denied state with the role, and the sign-in page after a 401 `unauthenticated` through the shared expiry routing; a failed refresh replaces the list, so no stale list is shown as current.
- Contrast test: a failed self-check's text, the theme's error color, on a worker card in both schemes.
- Redaction test (Q9 (a) and (b)): the real session, board, and workers gateways over a scripted control plane whose view carries texts redacted as the server sends them and a field outside the contract with a raw enrollment-token shape; the page shows the redacted texts as received, and no secret shape or session token reaches the page's HTML, a storage, or the console, with both storages left empty.
- Records: `screens.ts` names this change; the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA workers screen", "Web SPA workers screen access", and "Web SPA workers screen redaction".

## Impact

`apps/web`, a private workspace, its tests, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: `listWorkers`, `WorkersView`, `WorkerAdmissionEntry`, and `SelfCheckResult` are in `control-plane.openapi.json` 0.5.0. Out of scope: enrollment tokens (33b), account slots (33c), per-worker reachability, capacity, and last contact, which the plan row names but the wire does not carry (a recorded departure with a follow-up for the contract change, see the design), live updates of the view (no worker event exists; a follow-up), and revoked workers, which `WorkersView` never lists.
