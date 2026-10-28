## Context

`scripts/installation.sh` reads two tar streams through pipes under `set -euo pipefail`: `unpack_context` (`git archive | tar -xf -`) and `saved_manifest` (`docker image save | tar -xOf - manifest.json`). A tar reader may exit once it has seen the end-of-archive marker, leaving the record padding or, for a real image, nothing more; when the writer writes after the reader exited, it gets SIGPIPE and the pipeline fails.

## Decisions

- **Drain after tar.** Each reader becomes `{ tar ... && cat >/dev/null; }`, so the pipe stays open until the writer finishes. Only a successful `tar` drains; a failing one keeps its status and the pipeline fails as before. Alternatives: `git archive --output=<file>` removes one pipe but needs a temporary file and its cleanup, and has no `docker image save` counterpart that avoids writing a whole image to disk; ignoring status 141 would also hide a writer that died for another reason.
- **Deterministic test.** Timing alone reproduced the race only under load. The fakes therefore append 1 MiB of zeros after the archive when `FAKE_TAR_TRAILER` is set; zeros after the end marker are valid tar padding, and 1 MiB exceeds a pipe buffer, so an undrained reader always makes the writer fail with SIGPIPE.

## Risks / Trade-offs

- Draining reads whatever the reader left of the `docker image save` stream, which `docker` writes in full either way; the image is still read once.
