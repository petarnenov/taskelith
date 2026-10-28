# Design

## Context

`scripts/integrate.sh` requires a full `make verify` stamp of the merged tree
and runs `make verify` only when there is none. The owner decided on
2026-10-28 that each integration records which happened, so that the time
the stamp saves can be measured.

## Goals and non-goals

- Goals: one line per integration run that passes its verify step, in the
  script's output, in the pull request it opens, and in a shared log outside
  the repository.
- Non-goals: changing when a stamp is reused, the `pre-push` hook, and a
  report command over the log.

## Decisions

### D1. The line

`Integration: tree <tree>; verify <outcome>; profile <profile>; verify
seconds <seconds>; change <change>; branch <branch>; started <time>`, on one
line. The outcome is `ran` or `reused stamp of <time>`, where the time is
the stamp's `verifiedAt` as `verify-stamp.ts check full` prints it. The
profile is the one integration exports, always `full`. The seconds are
whole seconds from bash's `SECONDS` around the stamp check and any
`make verify`, so a reuse records about 0. The change is the archived change
directory, `<date>-<branch>`, which also dates the archive. The start time
is UTC to the second, taken when the run starts after any pause.

### D2. Where it goes

The script prints the line once its verify step passed, before the push. It
adds the line after `BODY`, separated by a blank line, to the body of a pull
request it creates; a resume that continues an open pull request does not
edit that pull request's body. It appends the same fields as one JSON object,
`{"tree", "verify", "profile", "verifySeconds", "change", "branch",
"started"}` with `verifySeconds` a number, to
`${XDG_STATE_HOME:-~/.local/state}/taskelith/integrations.jsonl`, the
directory of the integration's verify logs and pause file, which the script
already creates. Node.js builds the JSON, so a branch name with a quote stays
valid JSON.

### D3. One line per run that passes the verify step

A run that fails or is interrupted in its verify step records nothing. A
resume after a failed merge passes the verify step again, usually by reusing
the stamp, and records a second line; each line is one attempt, and a report
over the log can group lines by change. A run that finds the branch already
in `origin/dev` skips the verify step and records nothing.

### D4. Reading the stamp time

The script reads the stamp time from the message of the passing stamp check,
`pre-push: tree <tree> passed make verify (full) at <time>; ...`, instead of
adding a command to `scripts/verify-stamp.ts`. The test of the reused path
compares the recorded time with the stamp file's `verifiedAt`, so a change of
that message fails the test.

## Risks

- **A failed log write never fails the integration.** When the log cannot be
  appended, for example on a full disk or a missing permission, the script
  warns on standard error and continues; the integration then lands with no
  line in `integrations.jsonl`. The line is still in the script's output and
  in the pull request body, so the measurement loses that run unless someone
  copies the line from there.
- Concurrent integrations on one host could interleave appends; the
  coordinator integrates one task at a time, and each append is one short
  write of one line.

## Review checklist

The brief's checklist is saved as [checklist.json](checklist.json). Its top
categories here: contract-drift (the spec delta, the protocol sentence, and
the script name the same fields in the same order), error-handling (the log
write warns and never fails, recorded above), missing-fail-before-test (each
new test fails against the script of the base revision), and redaction (the
line holds only hashes, names, times, and seconds).
