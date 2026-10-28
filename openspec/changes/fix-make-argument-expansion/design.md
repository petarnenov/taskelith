## Context

`make integrate`, `make record`, and `make record-check` take free-form command-line variables (`BRANCH`, `TITLE`, `BODY`, `RESUME`, `CHANGE`, `LOG`). GNU make exports command-line variables by default, and exporting a recursively expanded variable expands its value, so a `$(shell ...)` in it would run. Pull request #383 therefore unexported them and handed each value to the recipe through a target-specific `export TASKELITH_... := $(value VAR)`, a simply expanded copy that make exports verbatim, read only by the shell as `"$$TASKELITH_..."`.

## Root cause

GNU Make 4.4 passes exported variables to the environment of `$(shell)` calls, which 3.81 does not. The `Makefile` runs three `$(shell)` calls while it is parsed, at lines 2, 3, and 7 of `f3a53f17` (`NODE_PIN`, `NPM_PIN`, `SERVICES_ID`), but the `unexport` line came at line 277. When make 4.4 builds the environment for those calls, the command-line variables are still exported, so make expands them, and every `$(shell ...)` in an argument runs once per such call. The coordinator's brief diagnosed that the `export X := $(value VAR)` pattern itself expands; that diagnosis was checked and is wrong: with the `unexport` first, both GNU Make 3.81 and 4.4.1 pass the value through intact.

Minimal Makefiles under GNU Make 4.4.1 (Homebrew `gmake` on macOS) show it, with `CHANGE='demo $(shell touch /tmp/x)'`:

| Makefile | `/tmp/x` |
|---|---|
| no `unexport`, no `$(shell)` (recipe environment export) | created |
| `unexport CHANGE`, then `X := $(shell true)` | not created |
| `X := $(shell true)`, then `unexport CHANGE` | created |
| two `$(shell)` calls before `unexport CHANGE`, `$(shell echo hit >> f)` | `f` has two lines |

The same repro of the full `Makefile` of `f3a53f17` in `debian:trixie-slim` with GNU Make 4.4.1 expanded the arguments in 25 of 25 runs of `make integrate` and of `make record-check`, and in none after the fix.

## Decisions

### D1: Unexport before the first `$(shell)`

The `unexport` line moves to the top of the `Makefile`, before the first `$(shell)` call. The arguments then never get exported, neither to `$(shell)` nor to recipes, and the recipes keep reading the simply expanded copies, so the interface and the "as typed" contract are unchanged. The coordinator's alternatives were weighed:

- Passing the values only through the environment (`CHANGE=x make record`) would change the documented invocation that the protocol, briefs, and archived records use.
- Refusing arguments that contain `$(` or a backtick would break the "as typed" contract, and a refusal written in make would itself have to read the value without expanding it.

### D2: Tests under every GNU make on PATH

`test/gnu-makes.ts` lists `make` and `gmake` when each runs and prints a distinct `GNU Make` version line, and the two "as typed" tests loop over that list. The iMac, whose `make` is 3.81, then also runs them under Homebrew's GNU Make 4.4 when it is installed, so this regression fails `make verify` there too; a host with only one GNU make runs them once. Each test asserts that the list is not empty, so a host without GNU make fails instead of passing vacuously.

### D3: The intermittent integrate test

Liki reported `make integrate passes its arguments to the script as typed` as intermittent. No source of nondeterminism was found: under GNU Make 4.4.1 the expansion happened in every run, on macOS with `gmake` and in the 25 Debian runs, whose environment carried a random extra variable each time to vary make's variable table. The test's inputs are fixed strings and a fresh temporary directory, and its `PATH` comes from the inherited environment, which no other test of the file mutates. The report is recorded as not reproduced; with the fix the test passes deterministically under both makes.

## Other free-form arguments

Other targets read command-line variables in ways outside this regression; they are reported, not changed:

- `make findings ARGS=...` substitutes `$(ARGS)` into the recipe, so make expands it by design under every version.
- `make installation-bootstrap ACTOR=... REASON=...`, `make installation-enrollment-token PLATFORM=... ARCHITECTURE=... WORKER_HOSTNAME=...`, and `make qualify-harnesses OUT=... PLATFORMS=...` read the exported variables in the recipe (`"$$REASON"`). Exporting expands them, so `REASON='a $(shell echo RAN) b'` reaches the script as `a RAN b` under GNU Make 3.81 and 4.4.1 alike. This predates pull request #383 and is not a 4.4 regression.

## Review checklist

The brief's checklist is saved as `checklist.json` (dev commit `f3a53f17`, size S). Ranked for this change: error-handling, contract-drift, redaction, concurrency-race, naming, docs, and evidence-mismatch for the code; evidence-mismatch, docs, spec-wording, stale-citation, contract-drift, process, and scope for the records.
