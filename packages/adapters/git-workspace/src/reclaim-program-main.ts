import { fileURLToPath } from 'node:url';
import { runReclaimProgram } from './reclaim-program.js';

// The fixed program of the worker image that a reclaim starts (contract
// section 3); it reports through its exit code only.
export const RECLAIM_PROGRAM_MAIN = fileURLToPath(import.meta.url);

if (import.meta.main) process.exitCode = await runReclaimProgram(process.argv.slice(2), process.stdin);
