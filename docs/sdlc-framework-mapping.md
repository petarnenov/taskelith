# SDLC framework artifact mapping

As of 2026-10-24. This is G1 preparation input for the framework-neutral SDLC model in [architecture section 6](architecture.md#first-class-sdlc-with-replaceable-frameworks). It describes native artifacts and maps them to the platform's lifecycle stages. It is not a port design, an adapter, or a conformance fixture set; G1 delivered those, and [ADR 0009](decisions/0009-frozen-sdlc-framework-port.md) froze the port on 2026-10-25.

## Pinned versions and inspection method

| Framework | Pin | How it was inspected |
| --- | --- | --- |
| OpenSpec | npm `@fission-ai/openspec@1.14.3` (`package.json`), upstream tag `v1.14.3`, commit `c794978f4f8845ce59693373c9dd882ee776588c` | The installed package's `spec-driven` schema and templates, which match the upstream commit byte for byte; this repository's `openspec/` tree (15 specs and 21 archived changes at the inspected revision, `4f78d29`); and the CLI, run in this repository for `new change`, `status`, and `validate --strict`, with `archive` exercised by earlier changes in this repository. |
| SpecKit | PyPI `specify-cli==1.2.3`, upstream tag `v1.2.3`, commit `5ea8b1cf0a38699340a38e00d02770308997d8c0` (latest stable release, published 2026-10-22) | The source at that commit: `templates/`, `templates/commands/`, `scripts/bash/`, `workflows/speckit/workflow.yml`, `extensions/git/extension.yml`, and the CLI command registrations in `src/specify_cli/`. The CLI, helper scripts, and workflow engine were then run without an agent in a digest-pinned container through `make speckit-capture` (G1 item 9); the [capture record](qualification/speckit.md) holds the method, the captured tree, and the probe transcript. |

Static facts read from the pinned source (file layout, template sections, command names, workflow and hook definitions) are cited without a marker. A SpecKit claim marked **(verified)** was exercised by the capture. A claim marked **(unverified)** is about runtime behaviour that was not exercised, such as gate handling, resumption, or what a validator rejects. A claim marked **(gap)** means the framework has no native artifact or operation for the obligation.

## Platform stages

The stages come from [governance "Lifecycle and records"](governance.md#lifecycle-and-records) and the obligations in architecture section 6 (intake, specification/planning, implementation, review, verification, closure):

1. Propose and inspect
2. Specify and design
3. Implement
4. Verify
5. Review
6. Accept and integrate
7. Close

## OpenSpec 1.14.3

### Artifacts and layout

- `openspec/config.yaml`: selects the workflow schema (`schema: spec-driven` here) and project context passed to instructions.
- `openspec/specs/<capability>/spec.md`: the current specification of each capability, with `## Purpose` and `## Requirements`. Each requirement is a `### Requirement:` heading whose text uses SHALL/MUST and carries at least one `#### Scenario:` with WHEN/THEN bullets.
- `openspec/changes/<change-name>/`: one directory per change, named in kebab-case, with `.openspec.yaml` (schema and creation date). The `spec-driven` schema defines four artifacts and their dependencies:
  - `proposal.md` (no prerequisites): `## Why`, `## What Changes`, `## Capabilities` (new and modified capability paths), `## Impact`.
  - `specs/<capability>/spec.md` (requires `proposal`): delta specs with `## ADDED`, `## MODIFIED`, `## REMOVED`, or `## RENAMED Requirements`. A MODIFIED requirement repeats its full text and scenarios; REMOVED needs **Reason** and **Migration**; a new capability adds `## Purpose`. A change without capabilities sets `skip_specs: true`.
  - `design.md` (requires `proposal`): Context, Goals / Non-Goals, Decisions, Risks / Trade-offs, plus optional Migration Plan and Open Questions per the schema instruction. The schema instruction says to create it only for cross-cutting, dependency, security, or ambiguous changes, yet `tasks` lists `design` as a prerequisite, and `status` shows `tasks` as blocked by `specs` and `design` until both exist. Whether `validate` or `archive` reject a change without `design.md` is **(unverified)**; every change in this repository has one.
  - `tasks.md` (requires `specs` and `design`): numbered checkbox tasks grouped under headings. The schema's `apply` phase tracks progress in this file.
- `openspec/changes/archive/YYYY-MM-DD-<change-name>/`: closed changes.

### Command surface and validation

- Deterministic CLI (Node). The lifecycle-relevant subset: `new change`, `status`, `instructions <artifact>` (and `apply`/`archive` instructions), `list`, `show`, `validate [--all] --strict`, `archive <change> --yes`, `schemas`, `templates`, `init`, `update`. The CLI also has `version`, `view`, `change`, `spec`, `config`, `schema`, `store`, `doctor`, `context`, `workset`, `feedback`, and `completion`.
- `validate --strict` checks structure: required sections, delta operation headers, and at least one scenario per requirement. In this change it also rejected a requirement whose text exceeded 500 characters, a warning that `--strict` turns into a failure; the schema instruction also asks for a `## Purpose` of 50 or more characters in a new capability. Which other checks it applies, for example to MODIFIED deltas that name a missing requirement, is **(unverified)**. It does not judge content quality; structural validation is not semantic approval ([architecture section 6](architecture.md#first-class-sdlc-with-replaceable-frameworks)).
- `archive` moves the change to `archive/YYYY-MM-DD-<name>/` and applies its deltas to `openspec/specs/` (exercised in this repository).

## SpecKit 1.2.3

### Artifacts and layout

- `.specify/memory/constitution.md`: project principles, created once per project from `constitution-template.md` (principles, governance, version and amendment dates). The `analyze` prompt instructs the agent to treat constitution conflicts as Critical.
- `.specify/templates/`, `.specify/scripts/`: installed copies of the templates and of one helper script set (bash, PowerShell, or Python), selected at `init` with `--script sh|ps|py`.
- `.specify/feature.json`: the current feature directory (`feature_directory`), overridden by the `SPECIFY_FEATURE_DIRECTORY` environment variable; `SPECIFY_FEATURE` names the current feature or branch. Feature state is per working copy: each new feature rewrites the file, and `check-prerequisites` writes an environment override back into it, except with `--paths-only` **(verified)**.
- `specs/<NNN>-<short-name>/`: one directory per feature, numbered sequentially or by timestamp. The `git` extension can create a matching feature branch.
  - `spec.md`: header (feature branch, created date, `Status: Draft`, input), mandatory "User Scenarios & Testing" (prioritized user stories, each with an independent test and Given/When/Then acceptance scenarios, plus edge cases), mandatory "Requirements" (`FR-NNN` functional requirements with `[NEEDS CLARIFICATION: …]` markers, optional key entities), mandatory "Success Criteria" (`SC-NNN` measurable outcomes), and "Assumptions".
  - `plan.md`: summary, technical context, "Constitution Check", project structure, complexity tracking; produced together with `research.md`, `data-model.md`, `quickstart.md`, and `contracts/`.
  - `tasks.md`: phases (setup, foundational, one per user story, polish) of `- [ ] T<NNN> [P] [US<n>] description` tasks, with dependency and parallelism notes.
  - `checklists/*.md`: reviewer-owned requirements-quality checklists; `[x]` means the criterion is satisfied, not that implementation is done.
- `.specify/workflows/runs/<run-id>/`: persisted state of each workflow-engine run (`inputs.json`, `log.jsonl`, `state.json`, and a copy of `workflow.yml`), used by `resume` and `status` **(verified)**.

### Command surface and validation

- Agent commands, installed into the selected AI agent's command or skill directory and executed by that agent, not by the CLI: `constitution`, `specify`, `clarify` (up to five questions, answers written back into `spec.md`), `plan`, `tasks`, `analyze` (read-only consistency report across `spec.md`, `plan.md`, and `tasks.md`), `checklist`, `implement` (executes tasks and marks them `[X]`), `converge` (compares the code with spec, plan, and tasks and appends unbuilt work as new tasks until it reports "Converged"), and the deprecated `taskstoissues`. Their results depend on the agent; they are prompts, not deterministic tools. The behaviour stated for each command is what its prompt instructs; none was exercised **(unverified)**.
- Python CLI `specify` (Python ≥ 3.11; upstream installs it with `uv tool install specify-cli`, and the capture installs it with pip from a hash-locked requirements file): root commands `init`, `check`, `version`, and `mcp`; groups `self` (`check`, `upgrade`), `integration`, `workflow` (`add`, `run`, `resume`, `status`, `list`, `info`, `search`, `update`, `remove`, `enable`, `disable`, `resolve`, plus subgroups `step`, `overlay`, and `catalog`), `extension`, `preset`, `bundle`, `artifact`, and `event`.
- Workflow `speckit` 1.0.1 (`workflows/speckit/workflow.yml`): `specify` → gate `review-spec` → `plan` → gate `review-plan` → `tasks` → `implement`. Gates offer approve or reject; reject aborts. Without a TTY a gate pauses the run, and `workflow resume` decides it only through a gate's `verdict_input` (the resume options and the gate step's source), which the bundled gates lack, so they cannot be decided headlessly; the bundled workflow also fails at its first step without an integration that can dispatch to an agent CLI **(verified)**. The interactive gate path was not run **(unverified)**. The pinned commit also bundles `assess` and `bugfix` workflows, which this mapping does not cover.
- Validation: the bash `check-prerequisites` script (the PowerShell and Python variants were not run) fails when the feature directory is missing or `plan.md` is missing or empty, and can also require `tasks.md` (`--require-tasks`) **(verified)** and `spec.md` (`--require-spec`, read from the script, not run) **(unverified)**. `setup-tasks` does not create `tasks.md`; it returns the template for the agent **(verified)**. There is no structural validator for the content of `spec.md`, `plan.md`, or `tasks.md` comparable to `openspec validate` **(gap)**; `analyze` is an agent judgment. `bundle validate` concerns bundle packaging, not feature artifacts.

## Stage mapping

| Stage | OpenSpec 1.14.3 | SpecKit 1.2.3 |
| --- | --- | --- |
| Propose and inspect | `proposal.md` via `new change`; capabilities declared up front. | No separate proposal artifact **(gap)** as observed; in the frozen port the native `specify` stage covers intake, see the note below: `specify` turns the description into `spec.md`, whose header records the input; the constitution is a project-level prerequisite. |
| Specify and design | Delta `specs/` and `design.md`, both after `proposal`; `validate --strict` checks structure. | `spec.md` (+ `clarify` loop), `plan.md` with `research.md`, `data-model.md`, `quickstart.md`, `contracts/`; `checklists/`; gates `review-spec` and `review-plan` in the workflow. |
| Implement | `tasks.md` checkboxes, tracked by the `apply` phase (in the frozen port, writing `tasks.md` is a specification stage and only `apply` implements, see the note below). | `tasks.md` (`T<NNN>`, `[P]`, `[US<n>]`), executed and checked off by `implement`; `converge` appends missing work. |
| Verify | No native artifact **(gap)**. This repository adds `verification.md` by convention (governance policy); `validate` covers artifact structure only. | No native verification record **(gap)**. `converge` reports whether code satisfies the artifacts by agent judgment; test tasks in `tasks.md` are optional. |
| Review | No native operation **(gap)**; the platform records independent review (here in `verification.md`). | Spec and plan gates in the workflow; requirements-quality checklists; `analyze` before implementation. No native review of the implementation **(gap)**. |
| Accept and integrate | No native operation **(gap)**; integration happens through SCM. | No native operation **(gap)**; the `git` extension offers branch creation (`before_specify`) and optional auto-commit hooks (`after_specify`, `after_plan`, …), not acceptance. |
| Close | `archive`: moves the change and applies its deltas to the living specs. | No archive or closure operation **(gap)**; `spec.md` keeps `Status: Draft`, and feature specs are not merged into a living specification. |

Every **(gap)** cell that the note below does not supersede needs an explicit platform-managed gate or closure record, shown in the UI as platform-managed rather than native (architecture section 6).

Note of 2026-10-25: the table places native artifacts by lifecycle stage as observed before G1. The frozen port's stage graphs differ from it for both frameworks; the OpenSpec plugin's stage graph and the SpecKit mapping fixture, which the test-only normaliser passes today and the G4 SpecKit adapter will implement ([ADR 0010](decisions/0010-g1-closure.md)), are authoritative ([ADR 0009](decisions/0009-frozen-sdlc-framework-port.md)):

- OpenSpec: writing `tasks.md` is the `tasks` stage, with the specification obligation, so it belongs to "Specify and design"; "Implement" is only the `apply` stage, which executes `tasks.md`. `specs` and `design` are separate stages (`packages/plugins/sdlc-openspec/src/openspec-framework.ts`).
- SpecKit: the `specify` stage covers both intake and specification, so "Propose and inspect" is native rather than a gap; "Specify and design" holds `specify`, the platform-managed gates `review-spec` and `review-plan`, `plan`, and `tasks`; "Implement" is the `implement` stage; `clarify` is not a stage of the frozen graph and stays an agent command outside the workflow (`packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts`).

## Mismatches that affect the port

- **Work-item identity.** OpenSpec uses a kebab-case change name and dates the archive directory; SpecKit uses `NNN-short-name` (or a timestamp prefix), optionally equal to a branch name. The plugin must map both to stable platform identifiers.
- **Source of truth.** OpenSpec keeps living capability specs and changes them through deltas; SpecKit keeps one self-contained specification per feature with no consolidation. "Requirements affected by this run" therefore means delta requirements in OpenSpec and the feature's `FR-NNN` list in SpecKit.
- **Requirement and scenario syntax.** OpenSpec: `### Requirement:` with SHALL/MUST and `#### Scenario:` WHEN/THEN. SpecKit: `FR-NNN` bullets with MUST, separate Given/When/Then acceptance scenarios under user stories, and `SC-NNN` success criteria. Traceability from tasks to requirements is by heading in OpenSpec and by `[US<n>]` story labels in SpecKit.
- **Stage graph.** OpenSpec's artifact dependencies (`proposal` → `specs`, `design` → `tasks` → `apply`) form a graph without review gates. SpecKit's bundled `speckit` workflow is linear with two human gates, and its README adds an implement/converge loop. Neither is a single linear state enum, which is consistent with the versioned stage graph in architecture section 6.
- **Intent and campaign graph.** Neither framework has a native artifact for an intent decomposed into campaigns or for dependencies between changes. [ADR 0013](decisions/0013-intents-campaigns-and-proposal-graphs.md) makes the platform generate a normalized blueprint manifest from the parent proposal and record the generation edges; the mapping is a versioned operation of the plugin, added when that gate is implemented, not a change to the frozen port.
- **Execution model.** OpenSpec operations are a deterministic Node CLI that a worker can run. SpecKit's core steps are agent prompts executed by an AI harness; only scaffolding, the workflow engine, and helper scripts are deterministic. A SpecKit plugin needs a harness for most stages and a Python 3.11 or later worker tool dependency; uv is not needed at run time, because pip installs the hash-locked wheels (capture record).
- **Clarification.** SpecKit records open questions inline (`[NEEDS CLARIFICATION: …]`) and resolves them with `clarify`; OpenSpec has no native marker. Both must surface as a planning obligation, not as implementation admission.
- **Working-copy state.** SpecKit's current feature lives in `.specify/feature.json` or an environment variable; OpenSpec passes the change name explicitly. A worker must not rely on SpecKit's implicit current feature across parallel runs: features in one working copy share one pointer, which even a validating `check-prerequisites` rewrites **(verified)**, sequentially rather than with concurrent processes. Each run needs its own working copy and an explicit `SPECIFY_FEATURE_DIRECTORY`.

## Remaining after the port froze

Note of 2026-10-25: G1 ran the shared fixtures against both designs and froze the port ([ADR 0009](decisions/0009-frozen-sdlc-framework-port.md)); [ADR 0010](decisions/0010-g1-closure.md) moves the items below to G4 (agent steps) and G8 (qualification evidence).

- Run SpecKit's agent steps through a qualified harness to verify the remaining **(unverified)** SpecKit claims above.
- Record SpecKit's maintenance, adoption, and security-channel evidence in the dependency register as part of its qualification.

## Sources

- OpenSpec `spec-driven` schema: [schema.yaml](https://github.com/Fission-AI/OpenSpec/blob/c794978f4f8845ce59693373c9dd882ee776588c/schemas/spec-driven/schema.yaml) and [templates](https://github.com/Fission-AI/OpenSpec/tree/c794978f4f8845ce59693373c9dd882ee776588c/schemas/spec-driven/templates), tag `v1.14.3`.
- SpecKit [templates](https://github.com/github/spec-kit/tree/5ea8b1cf0a38699340a38e00d02770308997d8c0/templates), [agent commands](https://github.com/github/spec-kit/tree/5ea8b1cf0a38699340a38e00d02770308997d8c0/templates/commands), [scripts](https://github.com/github/spec-kit/tree/5ea8b1cf0a38699340a38e00d02770308997d8c0/scripts/bash), [`speckit` workflow](https://github.com/github/spec-kit/blob/5ea8b1cf0a38699340a38e00d02770308997d8c0/workflows/speckit/workflow.yml), [`git` extension](https://github.com/github/spec-kit/blob/5ea8b1cf0a38699340a38e00d02770308997d8c0/extensions/git/extension.yml), and [CLI source](https://github.com/github/spec-kit/tree/5ea8b1cf0a38699340a38e00d02770308997d8c0/src/specify_cli), tag `v1.2.3`.
- SpecKit [README](https://github.com/github/spec-kit/blob/5ea8b1cf0a38699340a38e00d02770308997d8c0/README.md) at the same commit, for installation and the minimal flow.
