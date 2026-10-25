## Context

`shellNodeNotice` prints when the shell's Node.js differs from the one the checks ran under. Since `fix-pinned-node-path-order`, the wrapper puts the pinned version's directory first in `PATH`, which `nvm use` alone does not do when another Node.js comes earlier.

## Goals / Non-Goals

Give advice that works in every shell on another Node.js. Do not change when the notice appears, the checks, or the wrapper.

## Decisions

- The notice keeps `nvm use` as the first step, because it suffices in the common case, and adds the `node -v` check that shows whether it worked.
- For the other case it prints the exact line, with the directory of `process.execPath` of the checks. That is the directory the wrapper put first, so the line reproduces what the make targets do and needs no guess about nvm's layout.
- The directory is a parameter of `shellNodeNotice`, so the function stays pure and testable; the scripts pass `dirname(process.execPath)`.

## Risks / Trade-offs

The line is longer. It applies to the current shell only, which the notice's wording "run" implies; making it permanent is the user's shell profile choice.
