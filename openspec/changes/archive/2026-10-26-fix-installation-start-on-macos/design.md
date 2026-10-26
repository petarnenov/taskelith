## Context

JetStream checks a file stream's `max_bytes` against the server's free reserved file storage when the stream is created or updated, and refuses with API error 10047 (`insufficient storage resources available`) when it does not fit. Without `max_file_store`, the server takes 75% of the free disk under its store directory at start. The reservation is therefore a property of the host, and on a host with little free disk the control plane cannot start.

## Decisions

1. **Fixed file store and a smaller local stream limit** (owner, 2026-10-26). The installation's `nats-server.conf` sets `max_file_store: 8GiB`, and the composition sets `TASKELITH_STREAM_MAX_BYTES=1073741824` for the control plane: 5 streams reserve 5 GiB of the 8 GiB. The 10 GiB per-stream target stays the default when the variable is unset. The local values are provisional for G6, like the targets.
2. **A clear failure, not a new code.** `ensureStreams` maps error 10047 to an `unavailable` failure that names the bytes the streams reserve and what to change. It stays `unavailable`, like every broker failure, because freeing disk and starting again can succeed. The server's file-store limit is not visible to the client: the account is unlimited, so the message does not state the available storage; the NATS log does (`Max Storage`).
3. **No restart loop on a failed start** (owner, 2026-10-26). Docker restart policies cannot exclude an exit status, and `restart: unless-stopped` stays for restarts after a reboot. Instead `installation.sh start` stops the control plane when `compose up --wait` fails and prints its last `error` line, or its last 20 lines when there is none.
4. **Evidence on failure.** `verify-installation` prints the control-plane log in its exit trap before it removes the failed project, which otherwise deletes the containers and their logs.

## Risks

- An existing installation's streams are updated in place to the smaller limit on its next start. The installation executes no task yet (item 23b), so its streams hold far less than 1 GiB.
- 8 GiB of free disk is now a requirement of the `nats-data` volume. A fixed store does not make the disk larger: on a host with less, the streams are created, and a full disk fails writes later instead of the start.
