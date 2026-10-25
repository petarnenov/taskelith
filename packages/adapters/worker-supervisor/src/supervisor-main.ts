import { runSupervisorProgram } from './supervisor-program.js';

// The supervisor reports through its record only, so its exit code only
// tells usage errors apart.
export async function supervisorMain(argv: readonly string[]): Promise<number> {
  const outcome = await runSupervisorProgram(argv);
  return outcome.ok ? 0 : 2;
}

if (import.meta.main) process.exitCode = await supervisorMain(process.argv.slice(2));
