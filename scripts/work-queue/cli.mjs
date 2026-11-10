import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runQueue } from './runner.mjs';

export async function main(path, runner = runQueue, output = line => process.stdout.write(line), args = []) {
  try {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    if (args.length > 1 || args.some(arg => !/^--harness=(codex|claude)$/u.test(arg))) {
      throw new Error('Expected --harness=codex or --harness=claude');
    }
    if (args.length) config.harness = args[0].slice('--harness='.length);
    const result = await runner(config, { report: event => output(JSON.stringify(event) + '\n') });
    output(JSON.stringify(result) + '\n');
    return ['exhausted', 'limit-reached'].includes(result.status) ? 0 : 3;
  } catch (error) {
    const directory = mkdtempSync(join(tmpdir(), 'work-queue-error-'));
    const diagnostics = join(directory, 'error.json');
    writeFileSync(diagnostics, JSON.stringify({ message: error.message, stack: error.stack }), { mode: 0o600 });
    output(JSON.stringify({ status: 'unavailable', reason: 'startup-or-run-failed', diagnostics }) + '\n');
    return 4;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv[2], runQueue, undefined, process.argv.slice(3));
}
