## Context

Owner decision D5 (a1) runs SpecKit in a digest-pinned container through `make`. An exploration on 2026-10-24 ran `specify-cli==1.2.3` in a scratch image on the same base digest and confirmed that scaffolding works offline; it left the workflow engine, a hash-locked install, and a committed capture open.

## Goals / Non-Goals

Goals: a reproducible, offline capture of the scaffold, the helper scripts' behaviour, and the workflow engine's gate and resume handling; exact pins for SpecKit, Python, and uv; the mapping's unverified claims settled where a run without an agent can settle them. Non-goals: running SpecKit's agent steps, mapping fixtures (item 10), a SpecKit plugin (G4), adding Docker to `make verify`, and admitting any dependency.

## Decisions

- Install with pip from a hash-locked requirements file (`--require-hashes --only-binary=:all:`). uv compiles the lock in a throwaway container (`make speckit-lock`) but is not in the image: pip suffices to install, and pip-tools 7.5.1 failed with pip 26.2.2.
- Leave git out of the image: `specify init` creates the same files without it, and the helper scripts run without it.
- Run the capture with `--network none`, as the invoking user, with the tools mounted read-only.
- Use the `generic` integration, which writes agent commands to a plain directory and needs no agent CLI.
- Probe gates with two agent-free workflows (shell, gate, shell): one gate with `verdict_input`, one without, like the bundled gates.
- Normalize dates, timestamps, and run identifiers in every output, so that repeated captures are identical and the committed tree changes only when SpecKit's behaviour does.
- Commit the capture under `docs/qualification/speckit-1.2.3/` as evidence; item 10 derives fixtures from it in the plugin packages.

## Risks / Trade-offs

Normalization edits native files (the manifests' timestamps), which the record states. The lock is compiled for `linux/amd64`; arm64 is unverified. `make speckit-capture` is not part of `make verify`, so drift appears only when someone reruns it. The base image's Debian packages are not inventoried.
