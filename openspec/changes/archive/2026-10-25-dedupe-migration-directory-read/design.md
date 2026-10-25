## Context

`migrate` holds an advisory lock for its whole run, then lists the directory to refuse files other than `.sql` (dotfiles ignored), and lists it again to checksum the `.sql` files.

## Goals / Non-Goals

**Goals:**
- One directory read per run, with the same filters and results.

**Non-Goals:**
- Changing which files are refused or checksummed, or anything else in the migration run.

## Decisions

- **Listing as an argument.** `migrate` reads the listing once and passes it to both helpers; `unsupportedFiles` becomes a pure function of the listing. Both helpers keep their filters exactly, including the second's acceptance of a dotfile that ends in `.sql`.
- **No new test.** Behavior is unchanged, and the existing integration tests (`migrations.integration.test.ts`) cover the refusal of unsupported files and the checksums.

## Risks / Trade-offs

- The advisory lock does not freeze the directory, so the old two reads could differ if a file changed between them; for an unchanging directory both versions give the same result, and the new one checks and checksums one consistent listing.
