# SpecKit native-artifact capture

Date: 2026-10-24. Status: evidence for G1 item 9 ([G1 plan](../g1-plan.md)), run as owner decision D5 (a1) requires: the pinned SpecKit CLI in a digest-pinned container through a `make` target. SpecKit stays `candidate` in the [dependency register](../dependencies.md). This record settles the runtime claims of the [SDLC framework mapping](../sdlc-framework-mapping.md) that a run without an agent can settle. It is not a qualification of SpecKit's agent steps, which need a harness.

## Setup

| Item | Record |
| --- | --- |
| SpecKit | PyPI `specify-cli==1.2.3`, upstream tag `v1.2.3`, commit `5ea8b1cf0a38699340a38e00d02770308997d8c0`; MIT (`LICENSE` in the installed wheel, "Copyright GitHub, Inc."); `Requires-Python: >=3.11` |
| Base image | `python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962`, the `python:3.13-slim` index digest as pulled on 2026-10-24: Python 3.13.17 on Debian GNU/Linux 13 (trixie) |
| Python dependencies | [`tools/speckit/requirements.txt`](../../tools/speckit/requirements.txt), 41 exact pins with SHA-256 hashes, compiled from [`requirements.in`](../../tools/speckit/requirements.in) by `make speckit-lock` with uv 0.13.5. The image installs it with `pip install --require-hashes --only-binary=:all:`, so no source build and no unhashed download can occur |
| uv | 0.13.5, used only by `make speckit-lock` to compile the lock file, in a throwaway container on the same base digest. It is not in the image and not needed at run time: pip installs the locked wheels. pip-tools 7.5.1 was tried first and failed with pip 26.2.2 (`AttributeError: 'InstallRequirement' object has no attribute 'use_pep517'`) |
| git | Not installed. `specify init` produced a byte-identical file list with and without git in the image, and the helper scripts ran without it |
| Image | [`tools/speckit/Dockerfile`](../../tools/speckit/Dockerfile), built by `make speckit-image` as the local tag `taskelith-speckit:1.2.3`; on the author's machine image ID `sha256:d8010317c3ec9bba97259ab12b5c7ec9a533eadc4c03fd54b563d6f5124b4374`, `linux/amd64`, Docker Desktop server 29.5.2 |
| Host | macOS x86_64 (Docker Desktop). An arm64 build is **(unverified)**; the lock lists the hashes of every published wheel of each pinned version, but it was compiled for `x86_64-unknown-linux-gnu` |

The transitive dependencies declare MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, PSF-2.0, MIT-0, and dual Apache-2.0 or BSD licenses in their installed metadata; `markdown-it-py`, `mdurl`, and `pathspec` declare theirs only through classifiers, which were not read. This is the light license diligence of ADR 0003 decision 9, not a license-text audit.

## Method

`make speckit-capture` builds the image and runs [`tools/speckit/capture.sh`](../../tools/speckit/capture.sh) with `docker run --rm --network none`, as the invoking user, with `tools/speckit` mounted read-only. The script:

1. scaffolds a project with `specify init demo --integration generic --integration-options="--commands-dir .agent/commands/" --script sh --non-interactive --ignore-agent-tools`; the `generic` integration writes the agent commands to a plain directory and needs no agent CLI;
2. runs the bash helper scripts through the feature lifecycle they support without an agent;
3. runs the workflow engine on the bundled `speckit` workflow and on two agent-free probe workflows, [`gate-probe.yml`](../../tools/speckit/gate-probe.yml) (a gate with `verdict_input`) and [`gate-probe-interactive.yml`](../../tools/speckit/gate-probe-interactive.yml) (a gate without it, like the bundled gates);
4. writes the outputs to [`speckit-1.2.3/`](speckit-1.2.3/), replacing what was there.

Dates, timestamps, and eight-hex-digit run identifiers are normalized in the outputs, so that a repeated capture is identical. The author ran the capture twice, at different times, and `diff -r` found no difference.

## Captured tree

- [`scaffold/`](speckit-1.2.3/scaffold/): the 30 files that `specify init` creates: the ten agent commands under `.agent/commands/`, and under `.specify/` the constitution, the five templates, the six bash helper scripts, the bundled `speckit` workflow and its registry, the integration manifests, and `.gitignore`. The manifests' `installed_at` and `updated_at` values are normalized to `<timestamp>`.
- [`features/`](speckit-1.2.3/features/): the two feature directories that the helper scripts create, `001-user-auth` and `002-audit-log`, each with `spec.md` and `plan.md`. They are the unfilled templates: filling them is the agent's work in the `specify` and `plan` commands. `002-audit-log/plan.md` is empty on purpose, for the empty-plan probe.
- [`probes.md`](speckit-1.2.3/probes.md): every probe command with its output and exit code.

OpenSpec trees need no capture: this repository's `openspec/changes/archive/` holds them (G1 plan item 9).

## Results

| Claim | Result | Evidence in `probes.md` |
| --- | --- | --- |
| Scaffolding needs no network | `verified` | `specify init` exits 0 under `--network none`; the scaffold is built from assets bundled in the wheel. It creates no `.git`, and `init` has no `--no-git` option. |
| `check-prerequisites` rejects a missing feature, a missing plan, an empty plan, and missing tasks | `verified` | "Prerequisites without a feature", "without a plan", "Empty plan", and "requiring tasks" each exit 1 with a named error; with a plan present it exits 0. |
| `setup-tasks` creates `tasks.md` | `refuted` | It exits 0 and returns the tasks template in its JSON output (`TASKS_TEMPLATE_CONTENT`) for the agent; the feature directory still has only `plan.md` and `spec.md`. |
| The current feature is per working copy | `verified` | Each `create-new-feature` rewrites `.specify/feature.json`. `SPECIFY_FEATURE_DIRECTORY` overrides it, and `check-prerequisites` then writes the override back into `feature.json`, so even a check changes the shared pointer. Two features in one working copy therefore interfere; this was shown sequentially, not with concurrent processes. |
| The bundled workflow runs without an agent | `refuted` | `workflow run speckit` fails at its first step: the `generic` integration has no CLI dispatch. The workflow's `requires.integrations.any` lists `alquimia`, `claude`, `copilot`, `gemini`, and `opencode`. |
| A gate pauses without a TTY and resumes | `verified` | Without a TTY a gate returns `paused` with exit 0, with the gate's message and options in the JSON. `resume` with an approving `verdict_input` completes the run; a rejecting one aborts it with exit 1 under `on_reject: abort`; a value outside the options fails the run; resuming a completed run is refused. |
| The bundled gates can be decided without a TTY | `refuted` | A gate without `verdict_input`, as in the bundled workflow, stays `paused` when resumed with a verdict input. Deciding the bundled gates headlessly needs a workflow that adds `verdict_input`, or a TTY. The interactive path was not run. |
| Runs persist under `.specify/workflows/runs/` | `verified` | Each run keeps `inputs.json`, `log.jsonl`, `state.json`, and a copy of `workflow.yml` in `.specify/workflows/runs/<run-id>/`; `workflow status --json` lists runs with status and update time. |
| Agent commands behave as their prompts say | **(unverified)** | Not run: they need an agent harness (G3 and later). |

## Remaining before admission

- Run the agent steps through a qualified harness, and with it the interactive gate path.
- Build and run the image on Linux arm64 and record the result.
- SpecKit's maintenance, adoption, and security-channel evidence (G8, [ADR 0007](../decisions/0007-g0-closure.md)), and a review of the transitive dependencies' license texts.
