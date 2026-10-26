## Context

`mode_of()` must print only the octal permission bits of a path on both macOS (BSD stat) and Linux (GNU stat). The BSD-first order breaks on Linux, because GNU stat accepts `-f` with another meaning and writes to stdout before it fails.

## Decisions

1. **GNU first.** `stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"`. BSD stat rejects `-c` as an illegal option, writes only to stderr, and exits non-zero, so the fallback runs and stdout holds only the BSD result. GNU stat succeeds at once. A GNU stat on a macOS `PATH` also gives the right answer.
2. **No new test.** The three native lifecycle tests already compare the mode with `700` exactly and fail on any extra output, which is how the defect showed on Linux.

## Risks and limitations

- The macOS path was not re-run in this change; it relies on BSD stat rejecting `-c` without stdout output.
