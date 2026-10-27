## Why

The scheme-less user-information rule that #322 added to `packages/adapters/worker-control-plane-client/src/failure-cause.ts`, `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, is a ReDoS. On a long run of user-information characters with no `@`, every start position scans forward to the end of the run and fails, so the time grows with the square of the run: a 60,000-character cause message such as `'a'.repeat(60_000)` takes about three seconds. The message comes from a thrown error or a server's answer, and the redaction runs on the whole text before any cut, as the requirement "Control-plane failure cause" demands. Pepi found it during the integration of #322; coordinator Niki assigned the fix.

Review pass 1 found that the `[url]` rule, `/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi`, is quadratic in the same way on a run such as `a.` repeated, so the scenario's promise did not hold. Coordinator Niki decided on 2026-10-27 to widen the scope in response: every failure-cause redaction rule becomes linear-time. A measurement of every rule then found the JWT rule, `/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g`, quadratic on `eyJ` repeated.

## What Changes

- **Rule.** The rule starts a match only where a run of user-information characters starts, by a lookbehind, and keeps that run's leading colons through a group, so it redacts exactly what it redacted before and is tried once per run.
- **URL and JWT rules.** Each starts a match only where a run of its characters starts, by a lookbehind, keeps the part of the run before the first place the old rule could start through a group, and writes it back, so its output is the same and it is tried once per run.
- **Spec.** The requirement "Control-plane failure cause" gains the scenario "Pathological cause message": on a cause message of tens of thousands of characters with no end of user information, a URL, or a JWT, every failure-cause redaction rule takes linear time, and such a secret of any length is still redacted.
- **Tests.** Six pathological 60,000-character shapes for the user-information rule, and six for the URL and JWT rules, must each be described within 200 ms; user information after leading colons, of 10,001 characters, and right after another, and a URL and a JWT after a prefix of their run, are redacted as before.

No other redaction rule, no contract, and no published package changes. The logger's `redactText` in `@taskelith/observability` is out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: requirement "Control-plane failure cause".

## Impact

- `packages/adapters/worker-control-plane-client/src/failure-cause.ts` (three rules).
- `packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts` (four tests).
- Out of scope: centralizing the log redaction rules, a separate next task, and the logger's `redactText`, whose user-information URL rule is quadratic on the same runs (recorded in `verification.md`).
