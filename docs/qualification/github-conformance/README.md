# GitHub live SCM conformance, 2026-11-03

G3 sub-change 20d (`run-github-scm-conformance`) ran the shared SCM conformance suite against GitHub.com with `make conformance-github`, the `scm-github` plugin, and the qualification App (ID 5456916, installation 174871289) on hpz600 (Ubuntu, Linux 6.8.0-147-generic, Node.js 24.22.1). The run touched only the private disposable repositories `petarnenov/taskelith-conformance-project`, `-foreign`, and `-hidden`.

Each `*.json` file here is the run's own `report.json`, unchanged. The run redacted it with `SECRET_SHAPE_RULES` and scanned it for token shapes and the run's known secrets before it saved it. It holds case counts, findings, the latency of each credential ending, the cleanup steps, and the guard's refusals; no token, key, or secret.

## Runs

| File | Mode | Time (UTC) | Result |
| --- | --- | --- | --- |
| `discovery.json` | `--discover` | 19:30 | The installation covers project and foreign (200); hidden is not visible (404). |
| `live-1.json` | run | 19:30:55–19:34:58 | 10 findings; the guard refused the plugin's unnarrowed token requests (finding 1). |
| `live-2.json` | run | 19:42:40–19:52:08 | 2 findings after the fix of finding 1: `adopted credential` and `credential isolation` (finding 2). |
| `cleanup-1.json` | cleanup only | 19:52:51–19:52:54 | No step left to do. |
| `live-3.json` | run | 20:02:57–20:12:51 | 17 cases, no finding, no guard refusal; 55 cleanup steps done. |
| `cleanup-2.json` | cleanup only | after `live-3` | No step left to do. |
| `long-1.json` | run with `LONG_RUN=1` | 20:14:09–21:26:05 | 18 cases, the hour-long refresh case included, no finding; 55 cleanup steps done. |
| `live-4.json` | run | 21:27:10–21:36:49 | After the rebase onto `dev` `d0d59478`: 17 cases, no finding, no guard refusal; 55 cleanup steps done. |
| `cleanup-3.json` | cleanup only | 21:37:16–21:37:19 | No step left to do. |

The runs from `live-3` on include the propagation window of the source control contract section 3. `live-1` to `long-1` ran on the branch before its rebase onto `dev` `d0d59478`, `live-4` and `cleanup-3` after it; the rebase changed no file of the run, the plugin, or the suite, and added only a merge queue adapter to `@taskelith/integrations`.

## Findings

1. **Unnarrowed token of the plugin's own identity.** The plugin requested installation tokens for its own operations without naming a repository, which would cover every repository of the installation, `petarnenov/taskelith` included. The guard refused them before the call. The plugin now narrows each such token to the route's repository.
2. **Revocation propagation.** Right after a revocation, GitHub's Git smart HTTP still accepted the revoked token: a probe answered 200 at 0 and 2 seconds and 401 from 5 seconds on, while the REST API refused it at once. The coordinator decided that the port states a window, `REVOCATION_PROPAGATION_SECONDS` of 30 seconds, within which every surface refuses an ended version, and that the suite waits for the refusal within it.

## Ending latencies

The latency of an ending is the time from the revocation's or adoption's return to the answer of the last of its four permission probes, which the suite sends one after another.

| Case | `live-3` (ms) | `long-1` (ms) | `live-4` (ms) |
| --- | --- | --- | --- |
| refreshed credential, after the adoption of its successor | 4459, 4627 | 4399, 4758 | 4506, 4864 |
| adopted credential, after the adoption of a later version | 4747, 10236 | 5086, 9668 | 4433, 9551 |
| revoked credential, after the revocation of its credential | 4636 | 4517 | 4517 |
| revoked credential, after its revocation | 9308 | 9197 | 9094 |
| credential isolation, after its revocation | 10200 | 11772 | 9810 |
| long-run refresh, four adoptions and the final revocation (read only) | not run | 5173, 4905, 4904, 5140, 4969 | not run |

Every ending was refused within the 30-second window; the slowest took 11.8 seconds.
