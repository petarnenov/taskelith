import { fileURLToPath } from 'node:url';
import { runReclaimProgram } from './reclaim-program.js';

// The fixed program of the worker image that a reclaim starts (contract
// section 3); it reports readiness on stdout and the rest by exit code.
export const RECLAIM_PROGRAM_MAIN = fileURLToPath(import.meta.url);

// Exits at once, so an input still open after the window keeps it no longer.
if (import.meta.main) process.exit(await runReclaimProgram(process.argv.slice(2), process.stdin, process.stdout));
