## Context

Architecture section 6 requires a framework-neutral, versioned stage graph with native artifacts left to framework plugins, and governance "Lifecycle and records" names the platform's stages. No record yet compares what OpenSpec and SpecKit provide natively.

## Goals / Non-Goals

Goals: describe both frameworks at exact versions from their real artifacts, map them to the stages, and mark every gap and unverified claim. Non-goals: a port interface, an adapter, mapping fixtures, SpecKit qualification in the dependency register, and any change to how Taskelith itself uses OpenSpec.

## Decisions

- Pin OpenSpec to the repository's npm pin, 1.14.3, and confirm that the installed `spec-driven` schema matches the upstream commit for tag `v1.14.3`.
- Pin SpecKit to its latest stable release, `v1.2.3` (commit `5ea8b1cf0a38699340a38e00d02770308997d8c0`, PyPI `specify-cli==1.2.3`), and read its source from a tarball in a scratch directory outside the repository; do not install or run it.
- Use this repository's `openspec/` tree and CLI runs as the OpenSpec evidence.
- Use seven stages from governance (propose and inspect, specify and design, implement, verify, review, accept and integrate, close), leave native cells unmarked, and mark gaps and unverified claims.
- Keep the requirement about the record, not about either framework's behaviour, so the record can change when pins change.

## Risks / Trade-offs

SpecKit releases often (four releases in the ten days before the pin), so the mapping can age quickly; the pin and the remaining checks make that visible. Reading SpecKit without running it leaves the workflow engine's gates and run state unverified.
